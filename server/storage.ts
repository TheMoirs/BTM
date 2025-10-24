import { type Team, type InsertTeam, type Match, type InsertMatch, teams, matches } from "@shared/schema";
import { db } from "./db";
import { eq, or } from "drizzle-orm";

export interface IStorage {
  getAllTeams(): Promise<Team[]>;
  getTeam(id: string): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: string, team: InsertTeam): Promise<Team | undefined>;
  deleteTeam(id: string): Promise<boolean>;
  
  getAllMatches(): Promise<Match[]>;
  getMatch(id: string): Promise<Match | undefined>;
  createMatch(match: InsertMatch): Promise<Match>;
  updateMatchScore(id: string, team1Score: number | null, team2Score: number | null): Promise<Match | undefined>;
  deleteMatch(id: string): Promise<boolean>;
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
    await db.delete(matches).where(
      or(
        eq(matches.team1Id, id),
        eq(matches.team2Id, id)
      )
    );
    
    const result = await db.delete(teams).where(eq(teams.id, id)).returning();
    return result.length > 0;
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

    // Validate both teams are in the same division
    if (team1.division !== team2.division) {
      throw new Error("Both teams must be in the same division");
    }

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
        division: team1.division ?? null,
      })
      .returning();
    
    return match;
  }

  async updateMatchScore(id: string, team1Score: number | null, team2Score: number | null): Promise<Match | undefined> {
    const match = await this.getMatch(id);
    if (!match) {
      return undefined;
    }

    // Only calculate winner and set completed if both scores are provided
    let winnerId = null;
    let status = match.status;

    if (team1Score !== null && team2Score !== null) {
      winnerId = team1Score > team2Score ? match.team1Id : 
                 team2Score > team1Score ? match.team2Id : 
                 null;
      status = "completed";
    } else {
      // If scores are cleared (both null), reset to scheduled
      status = "scheduled";
    }

    const [updatedMatch] = await db
      .update(matches)
      .set({
        team1Score,
        team2Score,
        status,
        winnerId,
      })
      .where(eq(matches.id, id))
      .returning();
    
    return updatedMatch || undefined;
  }

  async deleteMatch(id: string): Promise<boolean> {
    const result = await db.delete(matches).where(eq(matches.id, id)).returning();
    return result.length > 0;
  }
}

export const storage = new DatabaseStorage();
