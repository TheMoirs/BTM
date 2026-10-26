// Helpers for tournament backup files (download, read, restore).
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface BackupEntry {
  tournament: { id: string; name: string; rulesPdfData?: string | null; [key: string]: unknown };
  ownerEmail: string | null;
  teams: unknown[];
  matches: unknown[];
  results: unknown[];
  shortLinks?: unknown[];
  collaborators?: unknown[];
}

export interface BackupFile {
  format: "btm-backup";
  version: number;
  kind: "tournament" | "all";
  createdAt: string;
  createdBy: string | null;
  tournaments: BackupEntry[];
}

export interface Snapshot {
  id: string;
  reason: string;
  createdBy: string | null;
  createdAt: string;
  teamCount: number;
  matchCount: number;
  resultCount: number;
}

export interface RestoreResponse {
  recreated: boolean;
  counts: { teams: number; matches: number; results: number };
  snapshotId: string | null;
}

/** "Couldn't do it" message from an apiRequest error ("400: {"error":"..."}") */
export function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const json = error.message.replace(/^\d{3}:\s*/, "");
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed?.error === "string") return parsed.error;
  } catch {
    /* not JSON */
  }
  return json || fallback;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function describeCounts(c: { teams: number; matches: number; results: number }) {
  return `${plural(c.teams, "team", "teams")}, ${plural(c.matches, "match", "matches")}, ${plural(c.results, "result", "results")}`;
}

export function entryCounts(entry: BackupEntry) {
  return { teams: entry.teams.length, matches: entry.matches.length, results: entry.results.length };
}

export function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export const SNAPSHOT_REASONS: Record<string, string> = {
  "clear-teams": "Before “Clear all teams”",
  "clear-matches": "Before “Clear all matches”",
  "clear-results": "Before “Clear all results”",
  "before-restore": "Before a restore",
};

/** Download a backup from the server and save it as a file. */
export async function downloadBackup(url: string, fallbackName: string) {
  const res = await apiRequest("GET", url);
  const disposition = res.headers.get("Content-Disposition") || "";
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] || fallbackName;
  const blob = new Blob([await res.text()], { type: "application/json" });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** Read a chosen backup file. Throws an Error with a friendly message if it isn't one. */
export async function readBackupFile(file: File): Promise<BackupFile> {
  let data: any;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("That file isn't a BTM backup (it couldn't be read).");
  }
  if (data?.format !== "btm-backup" || !Array.isArray(data.tournaments)) {
    throw new Error("That file isn't a BTM backup.");
  }
  if (typeof data.version === "number" && data.version > 1) {
    throw new Error("This backup was made by a newer version of BTM.");
  }
  for (const t of data.tournaments) {
    if (!t?.tournament?.id || !Array.isArray(t.teams) || !Array.isArray(t.matches) || !Array.isArray(t.results)) {
      throw new Error("This backup file is damaged.");
    }
  }
  return data as BackupFile;
}

/**
 * The entry to send to the server. The rules PDF is only needed when a deleted
 * tournament is being recreated, so it's left out otherwise to keep the upload small.
 */
export function entryForUpload(entry: BackupEntry, keepRulesPdf: boolean): BackupEntry {
  if (keepRulesPdf) return entry;
  const { rulesPdfData: _pdf, ...tournament } = entry.tournament;
  return { ...entry, tournament: tournament as BackupEntry["tournament"] };
}

/** Refresh everything a restore can change */
export function refreshAfterRestore() {
  queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
  queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
  queryClient.invalidateQueries({ queryKey: ["/api/results"] });
  queryClient.invalidateQueries({ queryKey: ["/api/tournaments"] });
}

export async function restoreSnapshot(tournamentId: string, snapshotId: string): Promise<RestoreResponse> {
  const res = await apiRequest("POST", `/api/tournaments/${tournamentId}/snapshots/${snapshotId}/restore`);
  const data = (await res.json()) as RestoreResponse;
  refreshAfterRestore();
  return data;
}

/** Read the snapshot id a "Clear all" returns */
export async function snapshotIdFrom(res: Response): Promise<string | null> {
  try {
    const data = await res.json();
    return typeof data?.snapshotId === "string" ? data.snapshotId : null;
  } catch {
    return null;
  }
}
