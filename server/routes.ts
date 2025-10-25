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

  app.delete("/api/teams", async (_req, res) => {
    try {
      await storage.deleteAllTeams();
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete all teams" });
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
      // Get all teams, matches, and results atomically
      const [teams, existingMatches, results] = await Promise.all([
        storage.getAllTeams(),
        storage.getAllMatches(),
        storage.getAllResults()
      ]);

      if (teams.length < 2) {
        return res.status(400).json({ 
          error: "Not enough teams. You need at least 2 teams to generate matches." 
        });
      }

      // Determine what stage to generate based on current state
      const hasInitialMatches = existingMatches.some(m => m.stage === "initial");
      const hasQuarterFinals = existingMatches.some(m => m.stage === "quarter-finals");
      const hasSemiFinals = existingMatches.some(m => m.stage === "semi-finals");
      const hasFinals = existingMatches.some(m => m.stage === "finals");

      let stageToGenerate: "initial" | "quarter-finals" | "semi-finals" | "finals";
      let teamsForStage: typeof teams = [];

      if (!hasInitialMatches) {
        // No matches exist → generate initial matches
        stageToGenerate = "initial";
      } else {
        // Check if all initial matches are completed with dates and results
        const initialMatches = existingMatches.filter(m => m.stage === "initial");
        const allInitialCompleted = initialMatches.length > 0 && 
          initialMatches.every(m => m.status === "completed" && m.matchDate && 
            results.some(r => r.matchId === m.id));

        // Count unique divisions
        const divisions = new Set(teams.filter(t => t.division).map(t => t.division));
        const divisionCount = divisions.size;

        if (!hasQuarterFinals && allInitialCompleted && divisionCount > 8) {
          // Generate quarter finals: top teams from each division
          stageToGenerate = "quarter-finals";
          
          // Get division winners (team with most points in each division)
          const divisionWinners: typeof teams = [];
          divisions.forEach(division => {
            const divisionResults = results.filter(r => {
              const match = initialMatches.find(m => m.id === r.matchId);
              return match?.division === division;
            });
            
            // Group by team and sum points
            const teamPoints = new Map<string, number>();
            divisionResults.forEach(r => {
              teamPoints.set(r.teamName, (teamPoints.get(r.teamName) || 0) + r.points);
            });
            
            // Find team with most points
            let maxPoints = -1;
            let winnerName = "";
            teamPoints.forEach((points, teamName) => {
              if (points > maxPoints) {
                maxPoints = points;
                winnerName = teamName;
              }
            });
            
            if (winnerName) {
              const winnerTeam = teams.find(t => t.name === winnerName);
              if (winnerTeam) divisionWinners.push(winnerTeam);
            }
          });
          
          teamsForStage = divisionWinners;
        } else if (!hasSemiFinals && hasQuarterFinals) {
          // Get quarter finals winners
          const quarterFinals = existingMatches.filter(m => m.stage === "quarter-finals");
          const quarterWinners = quarterFinals
            .filter(m => m.status === "completed" && m.winnerId)
            .map(m => m.winnerId!)
            .filter((id, index, self) => self.indexOf(id) === index);
          
          if (quarterWinners.length <= 4 && quarterWinners.length >= 2) {
            stageToGenerate = "semi-finals";
            teamsForStage = teams.filter(t => quarterWinners.includes(t.id));
          } else {
            return res.status(400).json({ 
              error: "Quarter finals are not ready. Need 2-4 completed quarter final matches with winners." 
            });
          }
        } else if (!hasFinals && hasSemiFinals) {
          // Get semi finals winners
          const semiFinals = existingMatches.filter(m => m.stage === "semi-finals");
          const semiWinners = semiFinals
            .filter(m => m.status === "completed" && m.winnerId)
            .map(m => m.winnerId!)
            .filter((id, index, self) => self.indexOf(id) === index);
          
          if (semiWinners.length === 2) {
            stageToGenerate = "finals";
            teamsForStage = teams.filter(t => semiWinners.includes(t.id));
          } else {
            return res.status(400).json({ 
              error: "Semi finals are not ready. Need exactly 2 semi final winners." 
            });
          }
        } else {
          return res.status(400).json({ 
            error: "All tournament stages are already generated or requirements not met." 
            + (hasInitialMatches && !allInitialCompleted 
                ? " Initial matches must be completed with dates and results." 
                : "")
            + (!hasQuarterFinals && divisionCount <= 8 
                ? " Need more than 8 divisions to generate quarter finals." 
                : "")
          });
        }
      }

      // Build set of existing match pairs (normalized)
      const existingPairs = new Set<string>();
      existingMatches.forEach(match => {
        const pair1 = [match.team1Id, match.team2Id].sort().join('-');
        existingPairs.add(pair1);
      });

      const createdMatches = [];
      let skippedCount = 0;
      let teamsWithoutDivision = 0;

      if (stageToGenerate === "initial") {
        // Generate round-robin matches within each division
        const teamsByDivision: Record<string, typeof teams> = {};
        
        teams.forEach(team => {
          if (!team.division) {
            teamsWithoutDivision++;
            return;
          }
          const div = team.division;
          if (!teamsByDivision[div]) {
            teamsByDivision[div] = [];
          }
          teamsByDivision[div].push(team);
        });

        for (const division in teamsByDivision) {
          const divTeams = teamsByDivision[division];
          if (divTeams.length < 2) continue;

          for (let i = 0; i < divTeams.length; i++) {
            for (let j = i + 1; j < divTeams.length; j++) {
              const team1Id = divTeams[i].id;
              const team2Id = divTeams[j].id;
              
              const pairKey = [team1Id, team2Id].sort().join('-');
              if (existingPairs.has(pairKey)) {
                skippedCount++;
                continue;
              }

              const matchData = {
                team1Id,
                team2Id,
                stage: "initial" as const,
                status: "scheduled" as const,
                matchDate: null,
                team1Game1Score: null,
                team2Game1Score: null,
                team1Game2Score: null,
                team2Game2Score: null,
                team1Game3Score: null,
                team2Game3Score: null,
                winnerId: null,
              };

              try {
                const match = await storage.createMatch(matchData);
                createdMatches.push(match);
                existingPairs.add(pairKey);
              } catch (error) {
                if (error instanceof Error && error.message.includes("already exists")) {
                  skippedCount++;
                  existingPairs.add(pairKey);
                } else {
                  throw error;
                }
              }
            }
          }
        }
      } else {
        // Generate knockout stage matches (quarter-finals, semi-finals, finals)
        if (teamsForStage.length < 2) {
          return res.status(400).json({ 
            error: `Not enough teams for ${stageToGenerate}. Need at least 2 teams.` 
          });
        }

        // Create matches by pairing teams
        for (let i = 0; i < teamsForStage.length; i += 2) {
          if (i + 1 >= teamsForStage.length) break;
          
          const team1Id = teamsForStage[i].id;
          const team2Id = teamsForStage[i + 1].id;
          
          const pairKey = [team1Id, team2Id].sort().join('-');
          if (existingPairs.has(pairKey)) {
            skippedCount++;
            continue;
          }

          const matchData = {
            team1Id,
            team2Id,
            stage: stageToGenerate,
            status: "scheduled" as const,
            matchDate: null,
            team1Game1Score: null,
            team2Game1Score: null,
            team1Game2Score: null,
            team2Game2Score: null,
            team1Game3Score: null,
            team2Game3Score: null,
            winnerId: null,
          };

          try {
            const match = await storage.createMatch(matchData);
            createdMatches.push(match);
            existingPairs.add(pairKey);
          } catch (error) {
            if (error instanceof Error && error.message.includes("already exists")) {
              skippedCount++;
              existingPairs.add(pairKey);
            } else {
              throw error;
            }
          }
        }
      }

      res.json({
        created: createdMatches.length,
        skipped: skippedCount,
        teamsWithoutDivision,
        stage: stageToGenerate,
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
        validatedData.team1Game1Score,
        validatedData.team2Game1Score,
        validatedData.team1Game2Score,
        validatedData.team2Game2Score,
        validatedData.team1Game3Score,
        validatedData.team2Game3Score,
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

  app.delete("/api/matches", async (_req, res) => {
    try {
      await storage.deleteAllMatches();
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete all matches" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
