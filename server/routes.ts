import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTeamSchema, insertMatchSchema, updateMatchScoreSchema } from "@shared/schema";
import { getUncachableResendClient } from "./resend";
import { z } from "zod";

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

      let stageToGenerate: "initial" | "quarter-finals" | "semi-finals" | "finals";
      let teamsForStage: typeof teams = [];

      // If no matches exist, generate initial stage
      if (existingMatches.length === 0) {
        stageToGenerate = "initial";
      } else {
        // Find the latest stage with matches
        const hasInitialMatches = existingMatches.some(m => m.stage === "initial");
        const hasQuarterFinals = existingMatches.some(m => m.stage === "quarter-finals");
        const hasSemiFinals = existingMatches.some(m => m.stage === "semi-finals");
        const hasFinals = existingMatches.some(m => m.stage === "finals");

        let latestStage: "initial" | "quarter-finals" | "semi-finals" | "finals";
        if (hasFinals) latestStage = "finals";
        else if (hasSemiFinals) latestStage = "semi-finals";
        else if (hasQuarterFinals) latestStage = "quarter-finals";
        else latestStage = "initial";

        // Check if all matches in latest stage are complete
        const latestStageMatches = existingMatches.filter(m => m.stage === latestStage);
        const allLatestCompleted = latestStageMatches.length > 0 && 
          latestStageMatches.every(m => m.status === "completed" && m.matchDate && 
            results.some(r => r.matchId === m.id));

        if (!allLatestCompleted) {
          return res.status(400).json({ 
            error: `Cannot generate next stage. All ${latestStage} matches must be completed with dates and results.` 
          });
        }

        // Latest stage is complete, determine next stage and get winners
        if (latestStage === "finals") {
          return res.status(400).json({ 
            error: "Tournament is complete. All stages have been generated." 
          });
        }

        // Function to get division winners using points and score difference
        const getDivisionWinners = (stageMatches: typeof existingMatches) => {
          const divisions = new Set(teams.filter(t => t.division).map(t => t.division));
          const divisionWinners: typeof teams = [];

          divisions.forEach(division => {
            const divisionResults = results.filter(r => {
              const match = stageMatches.find(m => m.id === r.matchId);
              return match?.division === division;
            });
            
            // Group by team and aggregate stats
            const teamStats = new Map<string, { points: number, scoreDiff: number }>();
            divisionResults.forEach(r => {
              const current = teamStats.get(r.teamName) || { points: 0, scoreDiff: 0 };
              teamStats.set(r.teamName, {
                points: current.points + r.points,
                scoreDiff: current.scoreDiff + r.scoreDifference
              });
            });
            
            // Find team with most points, use score difference as tiebreaker
            let bestTeamName = "";
            let bestPoints = -1;
            let bestScoreDiff = -Infinity;
            
            teamStats.forEach((stats, teamName) => {
              if (stats.points > bestPoints || 
                  (stats.points === bestPoints && stats.scoreDiff > bestScoreDiff)) {
                bestPoints = stats.points;
                bestScoreDiff = stats.scoreDiff;
                bestTeamName = teamName;
              }
            });
            
            if (bestTeamName) {
              const winnerTeam = teams.find(t => t.name === bestTeamName);
              if (winnerTeam) divisionWinners.push(winnerTeam);
            }
          });

          return divisionWinners;
        };

        if (latestStage === "initial") {
          // Get division winners from initial stage
          const divisionWinners = getDivisionWinners(latestStageMatches);
          const winnerCount = divisionWinners.length;

          if (winnerCount < 2) {
            return res.status(400).json({ 
              error: "Not enough division winners. Need at least 2 divisions with completed matches." 
            });
          }

          // Determine stage based on number of divisions/winners
          if (winnerCount === 2) {
            stageToGenerate = "finals";
          } else if (winnerCount === 4) {
            stageToGenerate = "semi-finals";
          } else {
            stageToGenerate = "quarter-finals";
          }

          teamsForStage = divisionWinners;
        } else if (latestStage === "quarter-finals") {
          // Get quarter finals winners
          const quarterWinners = latestStageMatches
            .filter(m => m.status === "completed" && m.winnerId)
            .map(m => m.winnerId!)
            .filter((id, index, self) => self.indexOf(id) === index);
          
          if (quarterWinners.length < 2) {
            return res.status(400).json({ 
              error: "Not enough quarter final winners. Need at least 2 completed matches with winners." 
            });
          }

          // Determine stage based on number of winners
          if (quarterWinners.length === 2) {
            stageToGenerate = "finals";
          } else {
            stageToGenerate = "semi-finals";
          }

          teamsForStage = teams.filter(t => quarterWinners.includes(t.id));
        } else if (latestStage === "semi-finals") {
          // Get semi finals winners
          const semiWinners = latestStageMatches
            .filter(m => m.status === "completed" && m.winnerId)
            .map(m => m.winnerId!)
            .filter((id, index, self) => self.indexOf(id) === index);
          
          if (semiWinners.length !== 2) {
            return res.status(400).json({ 
              error: "Semi finals are not ready. Need exactly 2 semi final winners." 
            });
          }

          stageToGenerate = "finals";
          teamsForStage = teams.filter(t => semiWinners.includes(t.id));
        } else {
          // This should never happen, but TypeScript needs a default
          return res.status(400).json({ 
            error: "Unable to determine next stage." 
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

  const emailPdfSchema = z.object({
    recipientEmail: z.string().email(),
    pdfBase64: z.string(),
    filename: z.string().optional().default("matches-report.pdf"),
  });

  app.post("/api/email-pdf", async (req, res) => {
    try {
      const validatedData = emailPdfSchema.parse(req.body);
      
      const { client, fromEmail } = await getUncachableResendClient();
      
      // Convert base64 to buffer
      const pdfBuffer = Buffer.from(validatedData.pdfBase64, 'base64');
      
      // Send email with PDF attachment
      const result = await client.emails.send({
        from: fromEmail,
        to: validatedData.recipientEmail,
        subject: "Boules League - Matches Report",
        html: `
          <h2>Boules League Matches Report</h2>
          <p>Please find attached the matches report generated on ${new Date().toLocaleDateString()}.</p>
          <p>This report contains all match information including schedules, scores, and results.</p>
          <br/>
          <p>Best regards,<br/>Boules League Management</p>
        `,
        attachments: [
          {
            filename: validatedData.filename,
            content: pdfBuffer,
          },
        ],
      });
      
      res.json({ success: true, emailId: result.data?.id });
    } catch (error) {
      console.error("Error sending email:", error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to send email" });
      }
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
