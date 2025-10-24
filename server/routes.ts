import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTeamSchema, insertMatchSchema, updateMatchScoreSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/teams", async (_req, res) => {
    try {
      const teams = await storage.getAllTeams();
      res.json(teams);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch teams" });
    }
  });

  app.get("/api/teams/:id", async (req, res) => {
    try {
      const team = await storage.getTeam(req.params.id);
      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }
      res.json(team);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch team" });
    }
  });

  app.post("/api/teams", async (req, res) => {
    try {
      const validatedData = insertTeamSchema.parse(req.body);
      const team = await storage.createTeam(validatedData);
      res.status(201).json(team);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to create team" });
      }
    }
  });

  app.patch("/api/teams/:id", async (req, res) => {
    try {
      const validatedData = insertTeamSchema.parse(req.body);
      const team = await storage.updateTeam(req.params.id, validatedData);
      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }
      res.json(team);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to update team" });
      }
    }
  });

  app.delete("/api/teams/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTeam(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Team not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete team" });
    }
  });

  app.get("/api/matches", async (_req, res) => {
    try {
      const matches = await storage.getAllMatches();
      res.json(matches);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch matches" });
    }
  });

  app.get("/api/matches/:id", async (req, res) => {
    try {
      const match = await storage.getMatch(req.params.id);
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }
      res.json(match);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch match" });
    }
  });

  app.post("/api/matches", async (req, res) => {
    try {
      const validatedData = insertMatchSchema.parse(req.body);
      const match = await storage.createMatch(validatedData);
      res.status(201).json(match);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to create match" });
      }
    }
  });

  app.post("/api/matches/generate", async (_req, res) => {
    try {
      // Get all teams and matches atomically
      const [teams, existingMatches] = await Promise.all([
        storage.getAllTeams(),
        storage.getAllMatches()
      ]);

      if (teams.length < 2) {
        return res.status(400).json({ 
          error: "Not enough teams. You need at least 2 teams to generate matches." 
        });
      }

      // Build set of existing match pairs (normalized)
      const existingPairs = new Set<string>();
      existingMatches.forEach(match => {
        const pair1 = [match.team1Id, match.team2Id].sort().join('-');
        existingPairs.add(pair1);
      });

      // Group teams by division (excluding teams without divisions)
      const teamsByDivision: Record<string, typeof teams> = {};
      let teamsWithoutDivision = 0;
      
      teams.forEach(team => {
        if (!team.division) {
          teamsWithoutDivision++;
          return; // Skip teams without divisions
        }
        const div = team.division;
        if (!teamsByDivision[div]) {
          teamsByDivision[div] = [];
        }
        teamsByDivision[div].push(team);
      });

      const createdMatches = [];
      let skippedCount = 0;

      // Generate round-robin matches within each division
      for (const division in teamsByDivision) {
        const divTeams = teamsByDivision[division];
        if (divTeams.length < 2) continue;

        // Round-robin: every team plays every other team once
        for (let i = 0; i < divTeams.length; i++) {
          for (let j = i + 1; j < divTeams.length; j++) {
            const team1Id = divTeams[i].id;
            const team2Id = divTeams[j].id;
            
            // Check if match already exists (order-independent)
            const pairKey = [team1Id, team2Id].sort().join('-');
            if (existingPairs.has(pairKey)) {
              skippedCount++;
              continue;
            }

            // Create the match
            const matchData = {
              team1Id,
              team2Id,
              stage: "initial" as const,
              status: "scheduled" as const,
              matchDate: null,
              team1Score: null,
              team2Score: null,
              winnerId: null,
            };

            try {
              const match = await storage.createMatch(matchData);
              createdMatches.push(match);
              
              // Add to set to prevent duplicates within this generation
              existingPairs.add(pairKey);
            } catch (error) {
              // If match creation fails due to duplicate (from concurrent request), count as skipped
              if (error instanceof Error && error.message.includes("already exists")) {
                skippedCount++;
                existingPairs.add(pairKey);
              } else {
                // Re-throw other errors
                throw error;
              }
            }
          }
        }
      }

      res.json({
        created: createdMatches.length,
        skipped: skippedCount,
        teamsWithoutDivision,
        matches: createdMatches
      });
    } catch (error) {
      console.error("Error generating matches:", error);
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to generate matches" });
      }
    }
  });

  app.patch("/api/matches/:id/score", async (req, res) => {
    try {
      const validatedData = updateMatchScoreSchema.parse(req.body);
      const match = await storage.updateMatchScore(
        req.params.id,
        validatedData.team1Score,
        validatedData.team2Score,
        validatedData.matchDate ?? null
      );
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }
      res.json(match);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to update match score" });
      }
    }
  });

  app.get("/api/results", async (_req, res) => {
    try {
      const results = await storage.getAllResults();
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch results" });
    }
  });

  app.delete("/api/results", async (_req, res) => {
    try {
      await storage.deleteAllResults();
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete results" });
    }
  });

  app.delete("/api/matches/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteMatch(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Match not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete match" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
