import { pgTable, text, varchar, integer, unique, index, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";

export const tournaments = pgTable("tournaments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  numberOfDivisions: integer("number_of_divisions").notNull().default(2),
  gamesPerMatch: integer("games_per_match").notNull().default(3),
  hasQuarterFinals: boolean("has_quarter_finals").notNull().default(false),
  hasSemiFinals: boolean("has_semi_finals").notNull().default(false),
  hasFinals: boolean("has_finals").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertTournamentSchema = createInsertSchema(tournaments).omit({ id: true, createdAt: true }).extend({
  name: z.string().min(1, "Tournament name is required"),
  numberOfDivisions: z.number().int().min(1, "Must have at least 1 division").default(2),
  gamesPerMatch: z.number().int().min(1, "Must have at least 1 game").max(5, "Maximum 5 games per match").default(3),
  hasQuarterFinals: z.boolean().default(false),
  hasSemiFinals: z.boolean().default(false),
  hasFinals: z.boolean().default(true),
});

export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type Tournament = typeof tournaments.$inferSelect;

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tournamentId: varchar("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  captainName: text("captain_name").notNull(),
  captainPhone: text("captain_phone").notNull(),
  captainEmail: text("captain_email").notNull(),
  division: text("division"),
  homePiste: text("home_piste"),
  otherPlayers: text("other_players").array(),
}, (table) => ({
  uniqueTeamPerTournament: unique().on(table.tournamentId, table.name),
}));

export const insertTeamSchema = createInsertSchema(teams).omit({ id: true }).extend({
  tournamentId: z.string().min(1, "Tournament is required"),
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
  homePiste: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  otherPlayers: z.array(z.string()).nullable().optional(),
});

export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

export const matches = pgTable("matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tournamentId: varchar("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  team1Id: varchar("team1_id").notNull(),
  team2Id: varchar("team2_id").notNull(),
  team1Game1Score: integer("team1_game1_score"),
  team2Game1Score: integer("team2_game1_score"),
  team1Game2Score: integer("team1_game2_score"),
  team2Game2Score: integer("team2_game2_score"),
  team1Game3Score: integer("team1_game3_score"),
  team2Game3Score: integer("team2_game3_score"),
  team1Game4Score: integer("team1_game4_score"),
  team2Game4Score: integer("team2_game4_score"),
  team1Game5Score: integer("team1_game5_score"),
  team2Game5Score: integer("team2_game5_score"),
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
  tournamentId: z.string().min(1, "Tournament is required"),
  team1Id: z.string().min(1, "Team 1 is required"),
  team2Id: z.string().min(1, "Team 2 is required"),
  stage: z.enum(["initial", "quarter-finals", "semi-finals", "finals"]),
  status: z.enum(["scheduled", "in-progress", "completed"]).default("scheduled"),
  team1Game1Score: z.number().int().min(0).nullable().optional(),
  team2Game1Score: z.number().int().min(0).nullable().optional(),
  team1Game2Score: z.number().int().min(0).nullable().optional(),
  team2Game2Score: z.number().int().min(0).nullable().optional(),
  team1Game3Score: z.number().int().min(0).nullable().optional(),
  team2Game3Score: z.number().int().min(0).nullable().optional(),
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
  team1Game1Score: z.union([z.number().int().min(0), z.null()]),
  team2Game1Score: z.union([z.number().int().min(0), z.null()]),
  team1Game2Score: z.union([z.number().int().min(0), z.null()]),
  team2Game2Score: z.union([z.number().int().min(0), z.null()]),
  team1Game3Score: z.union([z.number().int().min(0), z.null()]),
  team2Game3Score: z.union([z.number().int().min(0), z.null()]),
  matchDate: z.string().transform(val => val === "" ? null : val).nullable().optional(),
});

export type UpdateMatchScore = z.infer<typeof updateMatchScoreSchema>;

export const results = pgTable("results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tournamentId: varchar("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  matchId: varchar("match_id").notNull(),
  matchInfo: text("match_info").notNull(),
  matchDate: text("match_date"),
  stage: text("stage").notNull(),
  teamName: text("team_name").notNull(),
  division: text("division"),
  gamesPlayed: integer("games_played").notNull(),
  gamesWon: integer("games_won").notNull(),
  gamesLost: integer("games_lost").notNull(),
  gamesDrawn: integer("games_drawn").notNull(),
  points: integer("points").notNull(),
  scoreFor: integer("score_for").notNull(),
  scoreAgainst: integer("score_against").notNull(),
  scoreDifference: integer("score_difference").notNull(),
});

export const insertResultSchema = createInsertSchema(results).omit({ id: true }).extend({
  tournamentId: z.string().min(1, "Tournament is required"),
});

export type InsertResult = z.infer<typeof insertResultSchema>;
export type Result = typeof results.$inferSelect;
