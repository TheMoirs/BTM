// Backup & restore for tournaments.
//
// A backup file holds one or more tournaments. Each tournament entry has the
// tournament's settings plus its teams, matches, results, share links and
// co-editors. The same entry format is used for downloaded backups and for the
// automatic safety snapshots saved before a "Clear all" or a restore.
//
// Restoring an entry REPLACES that tournament's teams, matches and results, all
// inside one database transaction: if anything goes wrong nothing changes.
// An entry can only ever be restored into the tournament it came from (same id).
import { getTableColumns, eq, desc, and, notInArray, inArray, ne } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "./db";
import { slugify } from "./storage";
import {
  tournaments,
  teams,
  matches,
  results,
  shortLinks,
  tournamentCollaborators,
  users,
  tournamentSnapshots,
} from "@shared/schema";

export const BACKUP_FORMAT = "btm-backup";
export const BACKUP_VERSION = 1;
/** How many automatic snapshots to keep per tournament */
export const SNAPSHOTS_KEPT = 10;

type Row = Record<string, unknown>;

export interface TournamentBackupEntry {
  tournament: Row;
  ownerEmail: string | null;
  teams: Row[];
  matches: Row[];
  results: Row[];
  shortLinks: Row[];
  collaborators: { userId: string; email: string | null }[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  kind: "tournament" | "all";
  createdAt: string;
  createdBy: string | null;
  tournaments: TournamentBackupEntry[];
}

export interface BackupCounts {
  teams: number;
  matches: number;
  results: number;
}

/** A problem with the backup file itself (shown to the user as-is). */
export class BackupError extends Error {}

// ── Export ────────────────────────────────────────────────────────────────

export async function exportTournament(
  tournamentId: string,
  opts: { includeRulesPdf?: boolean } = {},
): Promise<TournamentBackupEntry | undefined> {
  const [t] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));
  if (!t) return undefined;

  const [teamRows, matchRows, resultRows, linkRows, collabRows] = await Promise.all([
    db.select().from(teams).where(eq(teams.tournamentId, tournamentId)),
    db.select().from(matches).where(eq(matches.tournamentId, tournamentId)),
    db.select().from(results).where(eq(results.tournamentId, tournamentId)),
    db.select().from(shortLinks).where(eq(shortLinks.tournamentId, tournamentId)),
    db
      .select({ userId: tournamentCollaborators.userId, email: users.email })
      .from(tournamentCollaborators)
      .leftJoin(users, eq(users.id, tournamentCollaborators.userId))
      .where(eq(tournamentCollaborators.tournamentId, tournamentId)),
  ]);

  let ownerEmail: string | null = null;
  if (t.userId) {
    const [owner] = await db.select({ email: users.email }).from(users).where(eq(users.id, t.userId));
    ownerEmail = owner?.email ?? null;
  }

  const tournament: Row = { ...t };
  if (!opts.includeRulesPdf) {
    delete tournament.rulesPdfData;
  }

  return {
    tournament,
    ownerEmail,
    teams: teamRows,
    matches: matchRows,
    results: resultRows,
    shortLinks: linkRows,
    collaborators: collabRows.map((c) => ({ userId: c.userId, email: c.email ?? null })),
  };
}

export async function exportAllTournaments(): Promise<TournamentBackupEntry[]> {
  const all = await db.select({ id: tournaments.id }).from(tournaments).orderBy(tournaments.createdAt);
  const entries: TournamentBackupEntry[] = [];
  for (const { id } of all) {
    const entry = await exportTournament(id, { includeRulesPdf: true });
    if (entry) entries.push(entry);
  }
  return entries;
}

export function makeBackupFile(
  kind: "tournament" | "all",
  entries: TournamentBackupEntry[],
  createdBy: string | null,
): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kind,
    createdAt: new Date().toISOString(),
    createdBy,
    tournaments: entries,
  };
}

export function countsOf(entry: TournamentBackupEntry): BackupCounts {
  return { teams: entry.teams.length, matches: entry.matches.length, results: entry.results.length };
}

// ── Validation ────────────────────────────────────────────────────────────

const id = z.string().min(1).max(100);
const rowWithId = z.object({ id }).passthrough();

const entrySchema = z.object({
  tournament: z
    .object({
      id,
      name: z.string().min(1),
      adminToken: z.string().min(1),
      viewToken: z.string().min(1),
    })
    .passthrough(),
  ownerEmail: z.string().nullable().optional(),
  teams: z.array(rowWithId.extend({ name: z.string().min(1) })),
  matches: z.array(rowWithId.extend({ team1Id: id, team2Id: id })),
  results: z.array(rowWithId.extend({ matchId: id })),
  shortLinks: z.array(rowWithId).optional().default([]),
  collaborators: z
    .array(z.object({ userId: id, email: z.string().nullable().optional() }))
    .optional()
    .default([]),
});

/** Check an uploaded tournament entry and return it in a known shape. */
export function parseEntry(raw: unknown): TournamentBackupEntry {
  const parsed = entrySchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new BackupError(
      `This doesn't look like a valid BTM backup (${issue.path.join(".") || "file"}: ${issue.message}).`,
    );
  }
  const entry = parsed.data as unknown as TournamentBackupEntry;
  entry.ownerEmail = entry.ownerEmail ?? null;

  // Every result must belong to a match in the same backup
  const matchIds = new Set(entry.matches.map((m) => String(m.id)));
  const orphan = entry.results.find((r) => !matchIds.has(String(r.matchId)));
  if (orphan) {
    throw new BackupError("This backup is damaged: it has results for matches that aren't in it.");
  }
  return entry;
}

// ── Restore ───────────────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Keep only the fields the table actually has; turn timestamp strings back into dates. */
function toRow(table: PgTable, row: Row, overrides: Row = {}): any {
  const out: Row = {};
  for (const [key, col] of Object.entries(getTableColumns(table))) {
    if (!(key in row)) continue;
    let value = row[key];
    if (col.dataType === "date" && value != null) value = new Date(value as string);
    out[key] = value;
  }
  return { ...out, ...overrides };
}

async function insertInChunks(tx: Tx, table: PgTable, rows: any[]) {
  for (let i = 0; i < rows.length; i += 400) {
    await tx.insert(table).values(rows.slice(i, i + 400));
  }
}

/** Swap a tournament's teams, matches and results for the ones in the entry. */
async function replaceTournamentData(tx: Tx, tournamentId: string, entry: TournamentBackupEntry) {
  const scoped = { tournamentId };
  // Results go automatically with their matches (ON DELETE CASCADE)
  await tx.delete(results).where(eq(results.tournamentId, tournamentId));
  await tx.delete(matches).where(eq(matches.tournamentId, tournamentId));
  await tx.delete(teams).where(eq(teams.tournamentId, tournamentId));

  await insertInChunks(tx, teams, entry.teams.map((r) => toRow(teams, r, scoped)));
  await insertInChunks(tx, matches, entry.matches.map((r) => toRow(matches, r, scoped)));
  await insertInChunks(tx, results, entry.results.map((r) => toRow(results, r, scoped)));
}

/** A slug for a recreated tournament that no other tournament is using. */
async function freeSlug(tx: Tx, wanted: string | null | undefined, name: string, ownId: string) {
  const base = wanted || slugify(name);
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    const clash = await tx
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(and(eq(tournaments.slug, candidate), ne(tournaments.id, ownId)));
    if (clash.length === 0) return candidate;
  }
}

/**
 * Restore one tournament entry.
 *  - If the tournament still exists, its teams, matches and results are replaced.
 *  - If it has been deleted and `allowRecreate` is set (system admin only), the
 *    whole tournament is recreated with its settings, share links and co-editors.
 */
export async function restoreEntry(
  entry: TournamentBackupEntry,
  opts: { allowRecreate: boolean; fallbackOwnerId: string | null },
): Promise<{ recreated: boolean; counts: BackupCounts }> {
  const tournamentId = String(entry.tournament.id);

  return await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: tournaments.id })
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    let recreated = false;
    if (!existing) {
      if (!opts.allowRecreate) {
        throw new BackupError("That tournament no longer exists. Only the system admin can recreate it.");
      }

      // Owner: the original account if it still exists, otherwise whoever is restoring
      let ownerId: string | null = null;
      const originalOwner = entry.tournament.userId as string | null | undefined;
      if (originalOwner) {
        const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, originalOwner));
        ownerId = u?.id ?? null;
      }
      if (!ownerId && entry.ownerEmail) {
        const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.email, entry.ownerEmail));
        ownerId = u?.id ?? null;
      }
      ownerId = ownerId ?? opts.fallbackOwnerId;

      const tokenClash = await tx
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(
          inArray(tournaments.adminToken, [String(entry.tournament.adminToken), String(entry.tournament.viewToken)]),
        );
      const viewClash = await tx
        .select({ id: tournaments.id })
        .from(tournaments)
        .where(
          inArray(tournaments.viewToken, [String(entry.tournament.adminToken), String(entry.tournament.viewToken)]),
        );
      if (tokenClash.length || viewClash.length) {
        throw new BackupError("Another tournament is already using this tournament's share codes, so it can't be recreated.");
      }

      const slug = await freeSlug(
        tx,
        entry.tournament.slug as string | null | undefined,
        String(entry.tournament.name),
        tournamentId,
      );
      await tx.insert(tournaments).values(toRow(tournaments, entry.tournament, { userId: ownerId, slug }));
      recreated = true;
    }

    await replaceTournamentData(tx, tournamentId, entry);

    if (recreated) {
      // Share links: put back any whose code nobody else has taken since
      const links = entry.shortLinks.map((r) => toRow(shortLinks, r, { tournamentId }));
      for (const link of links) {
        await tx.insert(shortLinks).values(link).onConflictDoNothing();
      }
      // Co-editors whose accounts still exist
      const wantedIds = entry.collaborators.map((c) => c.userId);
      if (wantedIds.length) {
        const stillThere = await tx.select({ id: users.id }).from(users).where(inArray(users.id, wantedIds));
        for (const { id: userId } of stillThere) {
          await tx.insert(tournamentCollaborators).values({ tournamentId, userId }).onConflictDoNothing();
        }
      }
    }

    return { recreated, counts: countsOf(entry) };
  });
}

// ── Automatic snapshots ───────────────────────────────────────────────────

export type SnapshotReason = "clear-teams" | "clear-matches" | "clear-results" | "before-restore";

/**
 * Save a safety snapshot of a tournament. Returns the snapshot id, or null if
 * there was nothing worth saving (no teams, matches or results).
 * Throws if the save fails, so callers can refuse to go ahead with a clear.
 */
export async function createSnapshot(
  tournamentId: string,
  reason: SnapshotReason,
  createdBy: string | null,
): Promise<string | null> {
  const entry = await exportTournament(tournamentId, { includeRulesPdf: false });
  if (!entry) return null;
  const counts = countsOf(entry);
  if (counts.teams + counts.matches + counts.results === 0) return null;

  const [row] = await db
    .insert(tournamentSnapshots)
    .values({
      tournamentId,
      reason,
      createdBy,
      teamCount: counts.teams,
      matchCount: counts.matches,
      resultCount: counts.results,
      data: JSON.stringify(entry),
    })
    .returning({ id: tournamentSnapshots.id });

  // Keep only the most recent few
  const keep = await db
    .select({ id: tournamentSnapshots.id })
    .from(tournamentSnapshots)
    .where(eq(tournamentSnapshots.tournamentId, tournamentId))
    .orderBy(desc(tournamentSnapshots.createdAt))
    .limit(SNAPSHOTS_KEPT);
  await db.delete(tournamentSnapshots).where(
    and(
      eq(tournamentSnapshots.tournamentId, tournamentId),
      notInArray(tournamentSnapshots.id, keep.map((k) => k.id)),
    ),
  );

  return row.id;
}

export async function listSnapshots(tournamentId: string) {
  return await db
    .select({
      id: tournamentSnapshots.id,
      reason: tournamentSnapshots.reason,
      createdBy: tournamentSnapshots.createdBy,
      createdAt: tournamentSnapshots.createdAt,
      teamCount: tournamentSnapshots.teamCount,
      matchCount: tournamentSnapshots.matchCount,
      resultCount: tournamentSnapshots.resultCount,
    })
    .from(tournamentSnapshots)
    .where(eq(tournamentSnapshots.tournamentId, tournamentId))
    .orderBy(desc(tournamentSnapshots.createdAt));
}

export async function getSnapshotEntry(tournamentId: string, snapshotId: string): Promise<TournamentBackupEntry | undefined> {
  const [row] = await db
    .select()
    .from(tournamentSnapshots)
    .where(and(eq(tournamentSnapshots.id, snapshotId), eq(tournamentSnapshots.tournamentId, tournamentId)));
  if (!row) return undefined;
  return parseEntry(JSON.parse(row.data));
}
