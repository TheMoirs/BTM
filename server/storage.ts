import { type Team, type InsertTeam, type Match, type InsertMatch } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getAllTeams(): Promise<Team[]>;
  getTeam(id: string): Promise<Team | undefined>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: string, team: InsertTeam): Promise<Team | undefined>;
  deleteTeam(id: string): Promise<boolean>;
  
  getAllMatches(): Promise<Match[]>;
  getMatch(id: string): Promise<Match | undefined>;
  createMatch(match: InsertMatch): Promise<Match>;
  updateMatchScore(id: string, team1Score: number, team2Score: number): Promise<Match | undefined>;
  deleteMatch(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private teams: Map<string, Team>;
  private matches: Map<string, Match>;

  constructor() {
    this.teams = new Map();
    this.matches = new Map();
  }

  async getAllTeams(): Promise<Team[]> {
    return Array.from(this.teams.values());
  }

  async getTeam(id: string): Promise<Team | undefined> {
    return this.teams.get(id);
  }

  async createTeam(insertTeam: InsertTeam): Promise<Team> {
    const existing = Array.from(this.teams.values()).find(
      (team) => team.name.toLowerCase() === insertTeam.name.toLowerCase()
    );
    
    if (existing) {
      throw new Error("A team with this name already exists");
    }

    const id = randomUUID();
    const team: Team = { ...insertTeam, id };
    this.teams.set(id, team);
    return team;
  }

  async updateTeam(id: string, insertTeam: InsertTeam): Promise<Team | undefined> {
    const team = this.teams.get(id);
    if (!team) {
      return undefined;
    }

    const existing = Array.from(this.teams.values()).find(
      (t) => t.id !== id && t.name.toLowerCase() === insertTeam.name.toLowerCase()
    );
    
    if (existing) {
      throw new Error("A team with this name already exists");
    }

    const updatedTeam: Team = { ...insertTeam, id };
    this.teams.set(id, updatedTeam);
    return updatedTeam;
  }

  async deleteTeam(id: string): Promise<boolean> {
    const deleted = this.teams.delete(id);
    
    if (deleted) {
      const matchesToDelete = Array.from(this.matches.values())
        .filter(match => match.team1Id === id || match.team2Id === id)
        .map(match => match.id);
      
      matchesToDelete.forEach(matchId => this.matches.delete(matchId));
    }
    
    return deleted;
  }

  async getAllMatches(): Promise<Match[]> {
    return Array.from(this.matches.values());
  }

  async getMatch(id: string): Promise<Match | undefined> {
    return this.matches.get(id);
  }

  async createMatch(insertMatch: InsertMatch): Promise<Match> {
    const team1 = this.teams.get(insertMatch.team1Id);
    const team2 = this.teams.get(insertMatch.team2Id);
    
    if (!team1 || !team2) {
      throw new Error("One or both teams do not exist");
    }
    
    if (insertMatch.team1Id === insertMatch.team2Id) {
      throw new Error("A team cannot play against itself");
    }

    const id = randomUUID();
    const match: Match = {
      id,
      team1Id: insertMatch.team1Id,
      team2Id: insertMatch.team2Id,
      team1Score: insertMatch.team1Score ?? null,
      team2Score: insertMatch.team2Score ?? null,
      stage: insertMatch.stage,
      status: insertMatch.status || "scheduled",
      winnerId: insertMatch.winnerId ?? null,
    };
    
    this.matches.set(id, match);
    return match;
  }

  async updateMatchScore(id: string, team1Score: number, team2Score: number): Promise<Match | undefined> {
    const match = this.matches.get(id);
    if (!match) {
      return undefined;
    }

    const winnerId = team1Score > team2Score ? match.team1Id : 
                     team2Score > team1Score ? match.team2Id : 
                     null;

    const updatedMatch: Match = {
      ...match,
      team1Score,
      team2Score,
      status: "completed",
      winnerId,
    };
    
    this.matches.set(id, updatedMatch);
    return updatedMatch;
  }

  async deleteMatch(id: string): Promise<boolean> {
    return this.matches.delete(id);
  }
}

export const storage = new MemStorage();
