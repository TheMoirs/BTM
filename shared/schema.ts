import { pgTable, text, varchar, integer, unique, index, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";

// ── Users ─────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  isSystemAdmin: boolean("is_system_admin").notNull().default(false),
  isBlocked: boolean("is_blocked").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  clerkUserId: text("clerk_user_id"),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true, createdAt: true, passwordHash: true, isSystemAdmin: true, isBlocked: true,
}).extend({
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().transform(v => v === "" ? null : v).nullable().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ── Tournaments ───────────────────────────────────────────────────────────
export const tournaments = pgTable("tournaments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  numberOfDivisions: integer("number_of_divisions").notNull().default(2),
  gamesPerMatch: integer("games_per_match").notNull().default(3),
  numberOfPistes: integer("number_of_pistes"),
  hasQuarterFinals: boolean("has_quarter_finals").notNull().default(false),
  hasSemiFinals: boolean("has_semi_finals").notNull().default(false),
  hasFinals: boolean("has_finals").notNull().default(true),
  pointsForWin: integer("points_for_win").notNull().default(3),
  pointsForDraw: integer("points_for_draw").notNull().default(2),
  pointsForLoss: integer("points_for_loss").notNull().default(1),
  pointsForNoShow: integer("points_for_no_show").notNull().default(0),
  adminToken: varchar("admin_token", { length: 32 }).notNull().unique(),
  viewToken: varchar("view_token", { length: 32 }).notNull().unique(),
  rulesPdfData: text("rules_pdf_data"),   // base64-encoded PDF
  rulesPdfName: text("rules_pdf_name"),   // original filename
  createdAt: timestamp("created_at").notNull().defaultNow(),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }),
});

export const insertTournamentSchema = createInsertSchema(tournaments).omit({ id: true, createdAt: true, adminToken: true, viewToken: true, userId: true, rulesPdfData: true, rulesPdfName: true }).extend({
  name: z.string().min(1, "Tournament name is required"),
  description: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  numberOfDivisions: z.number().int().min(1, "Must have at least 1 division").default(2),
  gamesPerMatch: z.number().int().min(1, "Must have at least 1 game").max(5, "Maximum 5 games per match").default(3),
  hasQuarterFinals: z.boolean().default(false),
  hasSemiFinals: z.boolean().default(false),
  hasFinals: z.boolean().default(true),
  pointsForWin: z.number().int().min(0, "Points must be 0 or greater").default(3),
  pointsForDraw: z.number().int().min(0, "Points must be 0 or greater").default(2),
  pointsForLoss: z.number().int().min(0, "Points must be 0 or greater").default(1),
  pointsForNoShow: z.number().int().min(0, "Points must be 0 or greater").default(0),
  numberOfPistes: z.number().int().min(1).nullable().optional(),
});

export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type Tournament = typeof tournaments.$inferSelect;

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tournamentId: varchar("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  teamDisplayId: text("team_display_id"),
  name: text("name").notNull(),
  captainName: text("captain_name").notNull(),
  captainPhone: text("captain_phone").notNull(),
  captainEmail: text("captain_email"),
  division: text("division").default("A"),
  homePiste: text("home_piste"),
  otherPlayers: text("other_players").array(),
}, (table) => ({
  uniqueTeamPerTournament: unique().on(table.tournamentId, table.name),
}));

export const insertTeamSchema = createInsertSchema(teams).omit({ id: true }).extend({
  tournamentId: z.string().min(1, "Tournament is required"),
  teamDisplayId: z.string().transform(val => val === "" ? null : val).nullable().optional(),
  name: z.string().min(1, "Team name is required"),
  captainName: z.string().min(1, "Captain name is required"),
  captainPhone: z.string().min(1, "Phone number is required"),
  captainEmail: z.string().transform(val => val === "" ? null : val).pipe(
    z.union([
      z.string().email("Valid email is required"),
      z.null()
    ])
  ).optional().nullable(),
  division: z.string().transform(val => val === "" ? "A" : val).pipe(
    z.string().regex(/^[A-Z]$/, "Division must be a single letter A-Z")
  ).default("A"),
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
  stage: text("stage").notNull(),
  status: text("status").notNull().default("scheduled"),
  winnerId: varchar("winner_id"),
  matchDate: text("match_date"),
  division: text("division"),
  pisteId: text("piste_id"),
  team1NoShow: boolean("team1_no_show").notNull().default(false),
  team2NoShow: boolean("team2_no_show").notNull().default(false),
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
  team1NoShow: z.boolean().optional().default(false),
  team2NoShow: z.boolean().optional().default(false),
  pisteId: z.string().nullable().optional(),
});

export type UpdateMatchScore = z.infer<typeof updateMatchScoreSchema>;

export const results = pgTable("results", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tournamentId: varchar("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  matchId: varchar("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
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

// Short links for sharing tournament pages
export const shortLinks = pgTable("short_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code", { length: 8 }).notNull().unique(),
  tournamentId: varchar("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  accessType: text("access_type").notNull().default("view"), // 'view' or 'admin'
  targetPage: text("target_page").notNull().default("leaderboard"), // 'leaderboard', 'teams', etc.
  createdAt: timestamp("created_at").notNull().defaultNow(),
  tinyUrl: text("tiny_url"), // cached external short URL (hides Replit domain for email sharing)
});

export const insertShortLinkSchema = createInsertSchema(shortLinks).omit({ id: true, createdAt: true }).extend({
  code: z.string().min(6).max(8),
  tournamentId: z.string().min(1, "Tournament is required"),
  accessType: z.enum(["view", "admin"]).default("view"),
  targetPage: z.enum(["leaderboard", "teams", "results", "matches"]).default("leaderboard"),
});

export type InsertShortLink = z.infer<typeof insertShortLinkSchema>;
export type ShortLink = typeof shortLinks.$inferSelect;

// ── Tournament Collaborators ───────────────────────────────────────────────
// Users who can co-edit a tournament without owning it.
export const tournamentCollaborators = pgTable("tournament_collaborators", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tournamentId: varchar("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueCollaborator: unique().on(table.tournamentId, table.userId),
}));

export type TournamentCollaborator = typeof tournamentCollaborators.$inferSelect;
