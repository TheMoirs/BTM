import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  type BackupEntry,
  type BackupFile,
  type RestoreResponse,
  type Snapshot,
  SNAPSHOT_REASONS,
  describeCounts,
  downloadBackup,
  entryCounts,
  entryForUpload,
  errorMessage,
  formatWhen,
  readBackupFile,
  refreshAfterRestore,
  restoreSnapshot,
} from "@/lib/backup";
import { Download, Upload, History, Loader2 } from "lucide-react";

interface Props {
  tournament: { id: string; name: string; slug?: string | null } | null;
  onOpenChange: (open: boolean) => void;
}

type Pending =
  | { kind: "file"; entry: BackupEntry; file: BackupFile }
  | { kind: "snapshot"; snapshot: Snapshot };

export function BackupDialog({ tournament, onOpenChange }: Props) {
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"download" | "restore" | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const open = !!tournament;
  const { data: snapshots = [], isLoading: snapshotsLoading, refetch: refetchSnapshots } = useQuery<Snapshot[]>({
    queryKey: ["/api/tournaments", tournament?.id, "snapshots"],
    queryFn: async () => (await apiRequest("GET", `/api/tournaments/${tournament!.id}/snapshots`)).json(),
    enabled: open,
  });

  const close = (next: boolean) => {
    if (!next) {
      setFileProblem(null);
      setPending(null);
    }
    onOpenChange(next);
  };

  const handleDownload = async () => {
    if (!tournament) return;
    setBusy("download");
    try {
      await downloadBackup(`/api/tournaments/${tournament.id}/backup`, `btm-backup-${tournament.slug || "tournament"}.json`);
      toast({ title: "Backup downloaded", description: `Keep the file somewhere safe. It holds everything in ${tournament.name}.` });
    } catch (error) {
      toast({ title: "Backup failed", description: errorMessage(error, "Couldn't create the backup."), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const handleFileChosen = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = "";
    if (!file || !tournament) return;
    setFileProblem(null);
    try {
      const backup = await readBackupFile(file);
      const entry = backup.tournaments.find((t) => t.tournament.id === tournament.id);
      if (!entry) {
        const names = backup.tournaments.map((t) => t.tournament.name).join(", ");
        setFileProblem(
          backup.tournaments.length
            ? `That backup doesn't include ${tournament.name}. It contains: ${names}.`
            : "That backup file is empty.",
        );
        return;
      }
      setPending({ kind: "file", entry, file: backup });
    } catch (error) {
      setFileProblem(error instanceof Error ? error.message : "That file couldn't be read.");
    }
  };

  const confirmRestore = async () => {
    if (!tournament || !pending) return;
    setBusy("restore");
    try {
      let result: RestoreResponse;
      if (pending.kind === "file") {
        const res = await apiRequest("POST", `/api/tournaments/${tournament.id}/restore`, {
          entry: entryForUpload(pending.entry, false),
        });
        result = await res.json();
        refreshAfterRestore();
      } else {
        result = await restoreSnapshot(tournament.id, pending.snapshot.id);
      }
      toast({
        title: "Tournament restored",
        description: `${tournament.name} now has ${describeCounts(result.counts)}. The previous data was saved as an automatic backup.`,
      });
      setPending(null);
      refetchSnapshots();
    } catch (error) {
      toast({ title: "Restore failed", description: errorMessage(error, "Nothing was changed."), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const pendingCounts =
    pending?.kind === "file"
      ? entryCounts(pending.entry)
      : pending
        ? { teams: pending.snapshot.teamCount, matches: pending.snapshot.matchCount, results: pending.snapshot.resultCount }
        : null;

  return (
    <>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Backups — {tournament?.name}</DialogTitle>
            <DialogDescription>Save a copy of this tournament, or put back an earlier copy.</DialogDescription>
          </DialogHeader>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">Download a backup</h3>
            <p className="text-sm text-muted-foreground">Saves the settings, teams, matches and results to a file on this device.</p>
            <Button onClick={handleDownload} disabled={busy !== null} className="w-full sm:w-auto gap-2" data-testid="button-download-backup">
              {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download backup
            </Button>
          </section>

          <section className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-semibold">Restore from a backup file</h3>
            <p className="text-sm text-muted-foreground">
              Works with a backup of this tournament or a full “everything” backup. Replaces the current teams, matches and results.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => handleFileChosen(e.target.files?.[0])}
              data-testid="input-restore-file"
            />
            <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy !== null} className="w-full sm:w-auto gap-2" data-testid="button-choose-backup-file">
              <Upload className="h-4 w-4" />
              Choose backup file
            </Button>
            {fileProblem && <p className="text-sm text-destructive" data-testid="text-backup-file-problem">{fileProblem}</p>}
          </section>

          <section className="space-y-2 border-t pt-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <History className="h-4 w-4" /> Automatic backups
            </h3>
            <p className="text-sm text-muted-foreground">Saved automatically before any “Clear all” or restore. The latest 10 are kept.</p>
            {snapshotsLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : snapshots.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {snapshots.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 p-3" data-testid={`snapshot-${s.id}`}>
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{SNAPSHOT_REASONS[s.reason] ?? s.reason}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatWhen(s.createdAt)}
                        {s.createdBy ? ` · ${s.createdBy}` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {describeCounts({ teams: s.teamCount, matches: s.matchCount, results: s.resultCount })}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setPending({ kind: "snapshot", snapshot: s })} data-testid={`button-restore-snapshot-${s.id}`}>
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && busy !== "restore" && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore {tournament?.name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {pending?.kind === "file" && (
                  <p>
                    From {pending.file.kind === "all" ? "the full backup" : "the backup"} made {formatWhen(pending.file.createdAt)}
                    {pending.file.createdBy ? ` by ${pending.file.createdBy}` : ""}.
                  </p>
                )}
                {pending?.kind === "snapshot" && <p>From the automatic backup made {formatWhen(pending.snapshot.createdAt)}.</p>}
                {pendingCounts && <p className="font-medium text-foreground">Backup contains {describeCounts(pendingCounts)}.</p>}
                <p>This replaces all current teams, matches and results in this tournament. The current data is saved as an automatic backup first, so you can undo this.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "restore"}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmRestore();
              }}
              disabled={busy === "restore"}
              data-testid="button-confirm-restore"
            >
              {busy === "restore" ? "Restoring…" : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
