import { pgTable, text, varchar, integer, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  captainName: text("captain_name").notNull(),
  captainPhone: text("captain_phone").notNull(),
  captainEmail: text("captain_email").notNull(),
  division: text("division"),
});

export const insertTeamSchema = createInsertSchema(teams).omit({ id: true }).extend({
  name: z.string().min(1, "Team name is required"),
  captainName: z.string().min(1, "Captain name is required"),
  captainPhone: z.string().min(1, "Phone number is required"),
  captainEmail: z.string().email("Valid email is required"),
  division: z.string().transform(val => val === "" ? null : val).pipe(
    z.union([
      z.string().regex(/^[A-Z]$/, "Division must be a single letter A-Z"),
      z.null()
    ])
  ).optional().nullable(),
});

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

export const matches = pgTable("matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  team1Id: varchar("team1_id").notNull(),
  team2Id: varchar("team2_id").notNull(),
  team1Score: integer("team1_score"),
  team2Score: integer("team2_score"),
  stage: text("stage").notNull(),
  status: text("status").notNull().default("scheduled"),
  winnerId: varchar("winner_id"),
  matchDate: text("match_date"),
  division: text("division"),
});

// Note: A unique index exists on the database:
// CREATE UNIQUE INDEX unique_team_pair ON matches (LEAST(team1_id, team2_id), GREATEST(team1_id, team2_id));
// This prevents duplicate matches regardless of team order

export const insertMatchSchema = createInsertSchema(matches).omit({ id: true }).extend({
  team1Id: z.string().min(1, "Team 1 is required"),
  team2Id: z.string().min(1, "Team 2 is required"),
  stage: z.enum(["initial", "quarter-finals", "semi-finals", "finals"]),
  status: z.enum(["scheduled", "in-progress", "completed"]).default("scheduled"),
  team1Score: z.number().int().min(0).nullable().optional(),
  team2Score: z.number().int().min(0).nullable().optional(),
  winnerId: z.string().nullable().optional(),
  matchDate: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  division: z.string().transform(val => val === "" ? null : val).pipe(
    z.union([
      z.string().regex(/^[A-Z]$/, "Division must be a single letter A-Z"),
      z.null()
    ])
  ).optional().nullable(),
});

export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matches.$inferSelect;

export const updateMatchScoreSchema = z.object({
  team1Score: z.union([z.number().int().min(0), z.null()]),
  team2Score: z.union([z.number().int().min(0), z.null()]),
  matchDate: z.string().transform(val => val === "" ? null : val).nullable().optional(),
});

export type UpdateMatchScore = z.infer<typeof updateMatchScoreSchema>;

export const results = pgTable("results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  matchId: varchar("match_id").notNull(),
  matchInfo: text("match_info").notNull(),
  matchDate: text("match_date"),
  stage: text("stage").notNull(),
  teamName: text("team_name").notNull(),
  points: integer("points").notNull(),
  score: integer("score").notNull(),
});

export const insertResultSchema = createInsertSchema(results).omit({ id: true });

export type InsertResult = z.infer<typeof insertResultSchema>;
export type Result = typeof results.$inferSelect;
