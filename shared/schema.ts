import { pgTable, text, varchar, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  captainName: text("captain_name").notNull(),
  captainPhone: text("captain_phone").notNull(),
  captainEmail: text("captain_email").notNull(),
});

export const insertTeamSchema = createInsertSchema(teams).omit({ id: true }).extend({
  name: z.string().min(1, "Team name is required"),
  captainName: z.string().min(1, "Captain name is required"),
  captainPhone: z.string().min(1, "Phone number is required"),
  captainEmail: z.string().email("Valid email is required"),
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
});

export const insertMatchSchema = createInsertSchema(matches).omit({ id: true }).extend({
  team1Id: z.string().min(1, "Team 1 is required"),
  team2Id: z.string().min(1, "Team 2 is required"),
  stage: z.enum(["initial", "quarter-finals", "semi-finals", "finals"]),
  status: z.enum(["scheduled", "in-progress", "completed"]).default("scheduled"),
  team1Score: z.number().int().min(0).nullable().optional(),
  team2Score: z.number().int().min(0).nullable().optional(),
  winnerId: z.string().nullable().optional(),
});

export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matches.$inferSelect;

export const updateMatchScoreSchema = z.object({
  team1Score: z.coerce.number().int().min(0),
  team2Score: z.coerce.number().int().min(0),
});

export type UpdateMatchScore = z.infer<typeof updateMatchScoreSchema>;
