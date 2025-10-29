import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTeamSchema, insertMatchSchema, updateMatchScoreSchema, insertTournamentSchema } from "@shared/schema";
import { getUncachableResendClient } from "./resend";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Tournament routes
  app.get("/api/tournaments", async (_req, res) => {
    try {
      const tournaments = await storage.getAllTournaments();
      res.json(tournaments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tournaments" });
    }
  });

  app.get("/api/tournaments/latest", async (_req, res) => {
    try {
      const tournament = await storage.getLatestTournament();
      if (!tournament) {
        return res.status(404).json({ error: "No tournament found" });
      }
      res.json(tournament);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch latest tournament" });
    }
  });

  app.get("/api/tournaments/:id", async (req, res) => {
    try {
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      res.json(tournament);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tournament" });
    }
  });

  app.post("/api/tournaments", async (req, res) => {
    try {
      const validatedData = insertTournamentSchema.parse(req.body);
      const tournament = await storage.createTournament(validatedData);
      res.status(201).json(tournament);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to create tournament" });
      }
    }
  });

  app.delete("/api/tournaments/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTournament(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete tournament" });
    }
  });

  // Team routes
  app.get("/api/teams", async (req, res) => {
    try {
      const tournamentId = req.query.tournamentId as string | undefined;
      const teams = await storage.getAllTeams(tournamentId);
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

  app.delete("/api/teams", async (req, res) => {
    try {
      const tournamentId = req.query.tournamentId as string | undefined;
      await storage.deleteAllTeams(tournamentId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete all teams" });
    }
  });

  app.get("/api/matches", async (req, res) => {
    try {
      const tournamentId = req.query.tournamentId as string | undefined;
      const matches = await storage.getAllMatches(tournamentId);
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

  app.post("/api/matches/generate", async (req, res) => {
    try {
      const tournamentId = req.body.tournamentId as string;
      
      if (!tournamentId) {
        return res.status(400).json({ error: "Tournament ID is required" });
      }

      // Get all teams and existing matches for this tournament
      const [teams, existingMatches] = await Promise.all([
        storage.getAllTeams(tournamentId),
        storage.getAllMatches(tournamentId)
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

      const createdMatches = [];
      let skippedCount = 0;
      let teamsWithoutDivision = 0;
      const warnings: string[] = [];

      // Group teams by division
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

      // Generate round-robin matches within each division
      for (const division in teamsByDivision) {
        const divTeams = teamsByDivision[division];
        
        if (divTeams.length < 2) {
          warnings.push(`Division ${division} has only ${divTeams.length} team. Need at least 2 teams per division.`);
          continue;
        }

        // Warn if odd number of teams in division
        if (divTeams.length % 2 !== 0) {
          warnings.push(`Division ${division} has ${divTeams.length} teams (odd number). One team will have a bye in each round.`);
        }

        // Generate round-robin matches for this division
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
              tournamentId,
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

      res.json({
        created: createdMatches.length,
        skipped: skippedCount,
        teamsWithoutDivision,
        warnings,
        stage: "initial",
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

  app.get("/api/results", async (req, res) => {
    try {
      const tournamentId = req.query.tournamentId as string | undefined;
      const results = await storage.getAllResults(tournamentId);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch results" });
    }
  });

  app.delete("/api/results", async (req, res) => {
    try {
      const tournamentId = req.query.tournamentId as string | undefined;
      await storage.deleteAllResults(tournamentId);
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

  app.delete("/api/matches", async (req, res) => {
    try {
      const tournamentId = req.query.tournamentId as string | undefined;
      await storage.deleteAllMatches(tournamentId);
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
