import { type Team, type InsertTeam, type Match, type InsertMatch, type Result, type InsertResult, teams, matches, results } from "@shared/schema";
import { db } from "./db";
import { eq, or } from "drizzle-orm";

export interface IStorage {
  getAllTeams(): Promise<Team[]>;
  getTeam(id: string): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: string, team: InsertTeam): Promise<Team | undefined>;
  deleteTeam(id: string): Promise<boolean>;
  deleteAllTeams(): Promise<boolean>;
  
  getAllMatches(): Promise<Match[]>;
  getMatch(id: string): Promise<Match | undefined>;
  createMatch(match: InsertMatch): Promise<Match>;
  updateMatchScore(id: string, team1Score: number | null, team2Score: number | null, matchDate: string | null): Promise<Match | undefined>;
  deleteMatch(id: string): Promise<boolean>;
  deleteAllMatches(): Promise<boolean>;
  
  getAllResults(): Promise<Result[]>;
  createResult(result: InsertResult): Promise<Result>;
  deleteAllResults(): Promise<boolean>;
  deleteResultsByMatchId(matchId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  async getAllTeams(): Promise<Team[]> {
    return await db.select().from(teams);
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    return team || undefined;
  }

  async createTeam(insertTeam: InsertTeam): Promise<Team> {
    const existing = await db
      .select()
      .from(teams)
      .where(eq(teams.name, insertTeam.name));
    
    if (existing.length > 0) {
      throw new Error("A team with this name already exists");
    }

    const [team] = await db
      .insert(teams)
      .values(insertTeam)
      .returning();
    return team;
  }

  async updateTeam(id: string, insertTeam: InsertTeam): Promise<Team | undefined> {
    const existingTeam = await this.getTeam(id);
    if (!existingTeam) {
      return undefined;
    }

    const duplicate = await db
      .select()
      .from(teams)
      .where(eq(teams.name, insertTeam.name));
    
    if (duplicate.length > 0 && duplicate[0].id !== id) {
      throw new Error("A team with this name already exists");
    }

    const [updatedTeam] = await db
      .update(teams)
      .set(insertTeam)
      .where(eq(teams.id, id))
      .returning();
    
    return updatedTeam || undefined;
  }

  async deleteTeam(id: string): Promise<boolean> {
    // Get all matches for this team to delete their results
    const teamMatches = await db.select().from(matches).where(
      or(
        eq(matches.team1Id, id),
        eq(matches.team2Id, id)
      )
    );
    
    // Delete results for all these matches
    for (const match of teamMatches) {
      await this.deleteResultsByMatchId(match.id);
    }
    
    // Delete matches
    await db.delete(matches).where(
      or(
        eq(matches.team1Id, id),
        eq(matches.team2Id, id)
      )
    );
    
    // Delete team
    const result = await db.delete(teams).where(eq(teams.id, id)).returning();
    return result.length > 0;
  }

  async deleteAllTeams(): Promise<boolean> {
    // Delete all results first
    await this.deleteAllResults();
    // Delete all matches
    await db.delete(matches);
    // Delete all teams
    await db.delete(teams);
    return true;
  }

  async getAllMatches(): Promise<Match[]> {
    return await db.select().from(matches);
  }

  async getMatch(id: string): Promise<Match | undefined> {
    const [match] = await db.select().from(matches).where(eq(matches.id, id));
    return match || undefined;
  }

  async createMatch(insertMatch: InsertMatch): Promise<Match> {
    const team1 = await this.getTeam(insertMatch.team1Id);
    const team2 = await this.getTeam(insertMatch.team2Id);
    
    if (!team1 || !team2) {
      throw new Error("One or both teams do not exist");
    }
    
    if (insertMatch.team1Id === insertMatch.team2Id) {
      throw new Error("A team cannot play against itself");
    }

    // Only validate division matching for initial stage matches
    // For other stages (quarter-finals, semi-finals, finals), teams can be from different divisions
    if (insertMatch.stage === "initial") {
      // Both teams must have a division assigned
      if (!team1.division || !team2.division) {
        throw new Error("Both teams must have a division assigned for initial stage matches");
      }
      // Both teams must be in the same division
      if (team1.division !== team2.division) {
        throw new Error("Both teams must be in the same division for initial stage matches");
      }
    }

    // Set division only for initial stage matches
    // For other stages, division is null (cross-division matches are allowed)
    const matchDivision = insertMatch.stage === "initial" ? (team1.division ?? null) : null;

    try {
      const [match] = await db
        .insert(matches)
        .values({
          team1Id: insertMatch.team1Id,
          team2Id: insertMatch.team2Id,
          team1Score: insertMatch.team1Score ?? null,
          team2Score: insertMatch.team2Score ?? null,
          stage: insertMatch.stage,
          status: insertMatch.status || "scheduled",
          winnerId: insertMatch.winnerId ?? null,
          matchDate: insertMatch.matchDate ?? null,
          division: matchDivision,
        })
        .returning();
      
      return match;
    } catch (error: any) {
      // Handle database unique constraint violation
      if (error.code === '23505' && error.constraint === 'unique_team_pair') {
        throw new Error("A match between these two teams already exists");
      }
      throw error;
    }
  }

  async updateMatchScore(id: string, team1Score: number | null, team2Score: number | null, matchDate: string | null): Promise<Match | undefined> {
    const match = await this.getMatch(id);
    if (!match) {
      return undefined;
    }

    // Delete existing results for this match if they exist
    await this.deleteResultsByMatchId(id);

    // Only calculate winner and set completed if both scores are provided
    let winnerId = null;
    let status = match.status;

    if (team1Score !== null && team2Score !== null) {
      winnerId = team1Score > team2Score ? match.team1Id : 
                 team2Score > team1Score ? match.team2Id : 
                 null;
      status = "completed";

      // Create result records
      const team1 = await this.getTeam(match.team1Id);
      const team2 = await this.getTeam(match.team2Id);
      
      if (team1 && team2) {
        const matchInfo = `${team1.name} vs ${team2.name}`;
        
        // Determine points for each team
        const team1Points = team1Score > team2Score ? 2 : team1Score === team2Score ? 1 : 0;
        const team2Points = team2Score > team1Score ? 2 : team1Score === team2Score ? 1 : 0;
        
        // Create result records for both teams
        await this.createResult({
          matchId: id,
          matchInfo,
          matchDate: matchDate || match.matchDate || null,
          stage: match.stage,
          teamName: team1.name,
          points: team1Points,
          score: team1Score,
        });
        
        await this.createResult({
          matchId: id,
          matchInfo,
          matchDate: matchDate || match.matchDate || null,
          stage: match.stage,
          teamName: team2.name,
          points: team2Points,
          score: team2Score,
        });
      }
    } else {
      // If scores are cleared (both null), reset to scheduled
      status = "scheduled";
    }

    const [updatedMatch] = await db
      .update(matches)
      .set({
        team1Score,
        team2Score,
        matchDate: matchDate !== undefined ? matchDate : match.matchDate,
        status,
        winnerId,
      })
      .where(eq(matches.id, id))
      .returning();
    
    return updatedMatch || undefined;
  }

  async deleteMatch(id: string): Promise<boolean> {
    // Delete associated results first
    await this.deleteResultsByMatchId(id);
    const result = await db.delete(matches).where(eq(matches.id, id)).returning();
    return result.length > 0;
  }

  async deleteAllMatches(): Promise<boolean> {
    // Delete all results first
    await this.deleteAllResults();
    // Delete all matches
    await db.delete(matches);
    return true;
  }

  async getAllResults(): Promise<Result[]> {
    return await db.select().from(results);
  }

  async createResult(insertResult: InsertResult): Promise<Result> {
    const [result] = await db
      .insert(results)
      .values(insertResult)
      .returning();
    return result;
  }

  async deleteAllResults(): Promise<boolean> {
    await db.delete(results);
    return true;
  }

  async deleteResultsByMatchId(matchId: string): Promise<boolean> {
    await db.delete(results).where(eq(results.matchId, matchId));
    return true;
  }
}

export const storage = new DatabaseStorage();
