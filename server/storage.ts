import { type Team, type InsertTeam, type Match, type InsertMatch, type Result, type InsertResult, type Tournament, type InsertTournament, teams, matches, results, tournaments } from "@shared/schema";
import { db } from "./db";
import { eq, or, and, desc } from "drizzle-orm";

export interface IStorage {
  // Tournament methods
  getAllTournaments(): Promise<Tournament[]>;
  getTournament(id: string): Promise<Tournament | undefined>;
  getLatestTournament(): Promise<Tournament | undefined>;
  createTournament(tournament: InsertTournament): Promise<Tournament>;
  updateTournament(id: string, tournament: InsertTournament): Promise<Tournament | undefined>;
  deleteTournament(id: string): Promise<boolean>;
  
  getAllTeams(tournamentId?: string): Promise<Team[]>;
  getTeam(id: string): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: string, team: InsertTeam): Promise<Team | undefined>;
  getTeamDeletionImpact(id: string): Promise<{ matchCount: number; resultCount: number }>;
  deleteTeam(id: string): Promise<boolean>;
  deleteAllTeams(tournamentId?: string): Promise<boolean>;
  
  getAllMatches(tournamentId?: string): Promise<Match[]>;
  getMatch(id: string): Promise<Match | undefined>;
  createMatch(match: InsertMatch): Promise<Match>;
  updateMatchScore(
    id: string, 
    team1Game1Score: number | null, 
    team2Game1Score: number | null,
    team1Game2Score: number | null,
    team2Game2Score: number | null,
    team1Game3Score: number | null,
    team2Game3Score: number | null,
    matchDate: string | null
  ): Promise<Match | undefined>;
  deleteMatch(id: string): Promise<boolean>;
  deleteAllMatches(tournamentId?: string): Promise<boolean>;
  
  getAllResults(tournamentId?: string): Promise<Result[]>;
  getResultsByStage(tournamentId: string, stage: string): Promise<Result[]>;
  createResult(result: InsertResult): Promise<Result>;
  deleteAllResults(tournamentId?: string): Promise<boolean>;
  deleteResultsByMatchId(matchId: string): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // Tournament methods
  async getAllTournaments(): Promise<Tournament[]> {
    return await db.select().from(tournaments).orderBy(desc(tournaments.createdAt));
  }

  async getTournament(id: string): Promise<Tournament | undefined> {
    const [tournament] = await db.select().from(tournaments).where(eq(tournaments.id, id));
    return tournament || undefined;
  }

  async getLatestTournament(): Promise<Tournament | undefined> {
    const [tournament] = await db.select().from(tournaments).orderBy(desc(tournaments.createdAt)).limit(1);
    return tournament || undefined;
  }

  async createTournament(insertTournament: InsertTournament): Promise<Tournament> {
    const [tournament] = await db
      .insert(tournaments)
      .values(insertTournament)
      .returning();
    return tournament;
  }

  async updateTournament(id: string, insertTournament: InsertTournament): Promise<Tournament | undefined> {
    const existingTournament = await this.getTournament(id);
    if (!existingTournament) {
      return undefined;
    }

    const [updatedTournament] = await db
      .update(tournaments)
      .set(insertTournament)
      .where(eq(tournaments.id, id))
      .returning();
    return updatedTournament || undefined;
  }

  async deleteTournament(id: string): Promise<boolean> {
    // Cascade delete will handle teams, matches, and results
    const result = await db.delete(tournaments).where(eq(tournaments.id, id)).returning();
    return result.length > 0;
  }

  // Team methods
  async getAllTeams(tournamentId?: string): Promise<Team[]> {
    if (tournamentId) {
      return await db.select().from(teams).where(eq(teams.tournamentId, tournamentId));
    }
    return await db.select().from(teams);
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    return team || undefined;
  }

  async createTeam(insertTeam: InsertTeam): Promise<Team> {
    // Check for duplicate team name within the same tournament
    const existing = await db
      .select()
      .from(teams)
      .where(and(
        eq(teams.tournamentId, insertTeam.tournamentId),
        eq(teams.name, insertTeam.name)
      ));
    
    if (existing.length > 0) {
      throw new Error("A team with this name already exists in this tournament");
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

    // Check for duplicate team name within the same tournament
    const duplicate = await db
      .select()
      .from(teams)
      .where(and(
        eq(teams.tournamentId, insertTeam.tournamentId),
        eq(teams.name, insertTeam.name)
      ));
    
    if (duplicate.length > 0 && duplicate[0].id !== id) {
      throw new Error("A team with this name already exists in this tournament");
    }

    // Normalize divisions for comparison (both to uppercase, handle null/undefined)
    const existingDivision = existingTeam.division?.toUpperCase() || null;
    const newDivision = insertTeam.division?.toUpperCase() || null;
    
    // Check if division is being changed and if team has any matches
    if (existingDivision !== newDivision) {
      const teamMatches = await db.select().from(matches).where(
        or(
          eq(matches.team1Id, id),
          eq(matches.team2Id, id)
        )
      );
      
      if (teamMatches.length > 0) {
        throw new Error("Cannot change division for a team that has existing matches");
      }
    }

    const [updatedTeam] = await db
      .update(teams)
      .set(insertTeam)
      .where(eq(teams.id, id))
      .returning();
    
    // If division changed and team has no matches, update matches and results for initial stage
    // This path is only reached if team has no matches (due to validation above)
    if (updatedTeam && existingDivision !== newDivision) {
      await this.updateMatchDivisionsForTeam(id);
    }
    
    return updatedTeam || undefined;
  }

  async getTeamDeletionImpact(id: string): Promise<{ matchCount: number; resultCount: number }> {
    // Get all matches for this team
    const teamMatches = await db.select().from(matches).where(
      or(
        eq(matches.team1Id, id),
        eq(matches.team2Id, id)
      )
    );
    
    const matchCount = teamMatches.length;
    
    // Count results for all these matches (2 results per match - one for each team)
    let resultCount = 0;
    for (const match of teamMatches) {
      const matchResults = await db.select().from(results).where(eq(results.matchId, match.id));
      resultCount += matchResults.length;
    }
    
    return { matchCount, resultCount };
  }

  async deleteTeam(id: string): Promise<boolean> {
    // Delete matches (results are automatically deleted via CASCADE constraint)
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

  async deleteAllTeams(tournamentId?: string): Promise<boolean> {
    if (tournamentId) {
      // Delete matches (results are automatically deleted via CASCADE constraint)
      await db.delete(matches).where(eq(matches.tournamentId, tournamentId));
      // Delete all teams for this tournament
      await db.delete(teams).where(eq(teams.tournamentId, tournamentId));
    } else {
      // Delete matches (results are automatically deleted via CASCADE constraint)
      await db.delete(matches);
      // Delete all teams
      await db.delete(teams);
    }
    return true;
  }

  // Match methods
  async getAllMatches(tournamentId?: string): Promise<Match[]> {
    if (tournamentId) {
      return await db.select().from(matches).where(eq(matches.tournamentId, tournamentId));
    }
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
          tournamentId: insertMatch.tournamentId,
          team1Id: insertMatch.team1Id,
          team2Id: insertMatch.team2Id,
          team1Game1Score: insertMatch.team1Game1Score ?? null,
          team2Game1Score: insertMatch.team2Game1Score ?? null,
          team1Game2Score: insertMatch.team1Game2Score ?? null,
          team2Game2Score: insertMatch.team2Game2Score ?? null,
          team1Game3Score: insertMatch.team1Game3Score ?? null,
          team2Game3Score: insertMatch.team2Game3Score ?? null,
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

  async updateMatchScore(
    id: string, 
    team1Game1Score: number | null, 
    team2Game1Score: number | null,
    team1Game2Score: number | null,
    team2Game2Score: number | null,
    team1Game3Score: number | null,
    team2Game3Score: number | null,
    matchDate: string | null
  ): Promise<Match | undefined> {
    const match = await this.getMatch(id);
    if (!match) {
      return undefined;
    }

    // Get the tournament to check gamesPerMatch setting
    const tournament = await this.getTournament(match.tournamentId);
    if (!tournament) {
      return undefined;
    }

    // Cap gamesPerMatch at 3 since matches table only supports 3 games
    const gamesPerMatch = Math.min(tournament.gamesPerMatch, 3);

    // Calculate winner based on games won
    let winnerId = null;
    let status = match.status;
    let team1GamesWon = 0;
    let team2GamesWon = 0;

    // Count games won for each team
    if (team1Game1Score !== null && team2Game1Score !== null) {
      if (team1Game1Score > team2Game1Score) team1GamesWon++;
      else if (team2Game1Score > team1Game1Score) team2GamesWon++;
    }
    if (team1Game2Score !== null && team2Game2Score !== null) {
      if (team1Game2Score > team2Game2Score) team1GamesWon++;
      else if (team2Game2Score > team1Game2Score) team2GamesWon++;
    }
    if (team1Game3Score !== null && team2Game3Score !== null) {
      if (team1Game3Score > team2Game3Score) team1GamesWon++;
      else if (team2Game3Score > team1Game3Score) team2GamesWon++;
    }

    // Determine overall winner and status
    const hasAnyScores = team1Game1Score !== null || team2Game1Score !== null ||
                         team1Game2Score !== null || team2Game2Score !== null ||
                         team1Game3Score !== null || team2Game3Score !== null;
    
    // Check if at least one complete game has been played (both scores entered for at least one game)
    const hasCompleteGame = (team1Game1Score !== null && team2Game1Score !== null) ||
                            (team1Game2Score !== null && team2Game2Score !== null) ||
                            (team1Game3Score !== null && team2Game3Score !== null);

    // Count number of complete games played
    let completeGamesCount = 0;
    if (team1Game1Score !== null && team2Game1Score !== null) completeGamesCount++;
    if (team1Game2Score !== null && team2Game2Score !== null) completeGamesCount++;
    if (team1Game3Score !== null && team2Game3Score !== null) completeGamesCount++;

    // Determine the matchDate to use (new value or existing)
    const finalMatchDate = matchDate !== undefined ? matchDate : match.matchDate;

    if (hasAnyScores) {
      // Match is completed when at least one complete game has been played
      if (hasCompleteGame) {
        status = "completed";
        
        // Determine winner based on games won
        if (team1GamesWon > team2GamesWon) {
          winnerId = match.team1Id;
        } else if (team2GamesWon > team1GamesWon) {
          winnerId = match.team2Id;
        } else {
          // Tie - no clear winner
          winnerId = null;
        }
      } else {
        // Scores entered but no complete game yet
        status = "in-progress";
      }

      // Handle results based on match status
      if (status === "completed") {
        // Delete existing results for this match before creating new ones
        await this.deleteResultsByMatchId(id);
        
        const team1 = await this.getTeam(match.team1Id);
        const team2 = await this.getTeam(match.team2Id);
        
        if (team1 && team2) {
          const matchInfo = `${team1.name} vs ${team2.name}`;
          
          // Calculate total scores across all games
          const team1TotalScore = (team1Game1Score ?? 0) + (team1Game2Score ?? 0) + (team1Game3Score ?? 0);
          const team2TotalScore = (team2Game1Score ?? 0) + (team2Game2Score ?? 0) + (team2Game3Score ?? 0);
          
          // Calculate points and game statistics based on individual game results
          // Each game awards: 2 points for win, 1 point for draw, 0 points for loss
          let team1Points = 0;
          let team2Points = 0;
          let gamesPlayed = 0;
          let team1GamesWonCount = 0;
          let team2GamesWonCount = 0;
          let team1GamesLostCount = 0;
          let team2GamesLostCount = 0;
          let team1GamesDrawnCount = 0;
          let team2GamesDrawnCount = 0;
          
          // Game 1
          if (team1Game1Score !== null && team2Game1Score !== null) {
            gamesPlayed++;
            if (team1Game1Score > team2Game1Score) {
              team1Points += 2;
              team1GamesWonCount++;
              team2GamesLostCount++;
            } else if (team2Game1Score > team1Game1Score) {
              team2Points += 2;
              team2GamesWonCount++;
              team1GamesLostCount++;
            } else {
              team1Points += 1;
              team2Points += 1;
              team1GamesDrawnCount++;
              team2GamesDrawnCount++;
            }
          }
          
          // Game 2
          if (team1Game2Score !== null && team2Game2Score !== null) {
            gamesPlayed++;
            if (team1Game2Score > team2Game2Score) {
              team1Points += 2;
              team1GamesWonCount++;
              team2GamesLostCount++;
            } else if (team2Game2Score > team1Game2Score) {
              team2Points += 2;
              team2GamesWonCount++;
              team1GamesLostCount++;
            } else {
              team1Points += 1;
              team2Points += 1;
              team1GamesDrawnCount++;
              team2GamesDrawnCount++;
            }
          }
          
          // Game 3
          if (team1Game3Score !== null && team2Game3Score !== null) {
            gamesPlayed++;
            if (team1Game3Score > team2Game3Score) {
              team1Points += 2;
              team1GamesWonCount++;
              team2GamesLostCount++;
            } else if (team2Game3Score > team1Game3Score) {
              team2Points += 2;
              team2GamesWonCount++;
              team1GamesLostCount++;
            } else {
              team1Points += 1;
              team2Points += 1;
              team1GamesDrawnCount++;
              team2GamesDrawnCount++;
            }
          }
          
          // Create result records for both teams
          // Use match.division for initial stage matches (stored on match record)
          // For playoff matches, match.division will be null
          await this.createResult({
            tournamentId: match.tournamentId,
            matchId: id,
            matchInfo,
            matchDate: matchDate || match.matchDate || null,
            stage: match.stage,
            teamName: team1.name,
            division: match.division || null,
            gamesPlayed,
            gamesWon: team1GamesWonCount,
            gamesLost: team1GamesLostCount,
            gamesDrawn: team1GamesDrawnCount,
            points: team1Points,
            scoreFor: team1TotalScore,
            scoreAgainst: team2TotalScore,
            scoreDifference: team1TotalScore - team2TotalScore,
          });
          
          await this.createResult({
            tournamentId: match.tournamentId,
            matchId: id,
            matchInfo,
            matchDate: matchDate || match.matchDate || null,
            stage: match.stage,
            teamName: team2.name,
            division: match.division || null,
            gamesPlayed,
            gamesWon: team2GamesWonCount,
            gamesLost: team2GamesLostCount,
            gamesDrawn: team2GamesDrawnCount,
            points: team2Points,
            scoreFor: team2TotalScore,
            scoreAgainst: team1TotalScore,
            scoreDifference: team2TotalScore - team1TotalScore,
          });
        }
      } else if (status === "in-progress") {
        // Match is in-progress, delete any existing results from when it was previously completed
        await this.deleteResultsByMatchId(id);
      }
    } else {
      // If all scores are null, reset to scheduled and delete results
      status = "scheduled";
      await this.deleteResultsByMatchId(id);
    }

    const [updatedMatch] = await db
      .update(matches)
      .set({
        team1Game1Score,
        team2Game1Score,
        team1Game2Score,
        team2Game2Score,
        team1Game3Score,
        team2Game3Score,
        matchDate: matchDate !== undefined ? matchDate : match.matchDate,
        status,
        winnerId,
      })
      .where(eq(matches.id, id))
      .returning();
    
    return updatedMatch || undefined;
  }

  async deleteMatch(id: string): Promise<boolean> {
    // Results are automatically deleted via CASCADE constraint
    const result = await db.delete(matches).where(eq(matches.id, id)).returning();
    return result.length > 0;
  }

  async deleteAllMatches(tournamentId?: string): Promise<boolean> {
    if (tournamentId) {
      // Results are automatically deleted via CASCADE constraint
      await db.delete(matches).where(eq(matches.tournamentId, tournamentId));
    } else {
      // Results are automatically deleted via CASCADE constraint
      await db.delete(matches);
    }
    return true;
  }

  // Result methods
  async getAllResults(tournamentId?: string): Promise<Result[]> {
    if (tournamentId) {
      return await db.select().from(results).where(eq(results.tournamentId, tournamentId));
    }
    return await db.select().from(results);
  }

  async getResultsByStage(tournamentId: string, stage: string): Promise<Result[]> {
    return await db.select().from(results).where(
      and(
        eq(results.tournamentId, tournamentId),
        eq(results.stage, stage)
      )
    );
  }

  async createResult(insertResult: InsertResult): Promise<Result> {
    const [result] = await db
      .insert(results)
      .values(insertResult)
      .returning();
    return result;
  }

  async deleteAllResults(tournamentId?: string): Promise<boolean> {
    if (tournamentId) {
      await db.delete(results).where(eq(results.tournamentId, tournamentId));
    } else {
      await db.delete(results);
    }
    return true;
  }

  async deleteResultsByMatchId(matchId: string): Promise<boolean> {
    await db.delete(results).where(eq(results.matchId, matchId));
    return true;
  }

  // Helper method to update match divisions when team division changes
  private async updateMatchDivisionsForTeam(teamId: string): Promise<void> {
    // Find all INITIAL stage matches where this team participates
    const teamMatches = await db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.stage, "initial"),
          or(eq(matches.team1Id, teamId), eq(matches.team2Id, teamId))
        )
      );

    // For each match, update the division based on both teams' divisions
    for (const match of teamMatches) {
      const team1 = await this.getTeam(match.team1Id);
      const team2 = await this.getTeam(match.team2Id);

      if (!team1 || !team2) continue;

      // If both teams have the same division, set match division to that
      // Otherwise set to null (cross-division match)
      const newDivision = team1.division === team2.division ? team1.division : null;

      // Update the match division
      await db
        .update(matches)
        .set({ division: newDivision })
        .where(eq(matches.id, match.id));

      // Update results for this match to use the new division
      await db
        .update(results)
        .set({ division: newDivision })
        .where(eq(results.matchId, match.id));
    }
  }
}

export const storage = new DatabaseStorage();
