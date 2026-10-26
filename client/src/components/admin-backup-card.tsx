import { useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  type BackupEntry,
  type BackupFile,
  type RestoreResponse,
  describeCounts,
  downloadBackup,
  entryCounts,
  entryForUpload,
  errorMessage,
  formatWhen,
  readBackupFile,
  refreshAfterRestore,
} from "@/lib/backup";
import { DatabaseBackup, Download, Upload, Loader2, X } from "lucide-react";

/** System admin: back up every tournament, or restore any one of them from a backup file. */
export function AdminBackupCard() {
  const { toast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"download" | "restore" | "reading" | null>(null);
  const [backup, setBackup] = useState<BackupFile | null>(null);
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set());
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [pending, setPending] = useState<BackupEntry | null>(null);

  const handleDownload = async () => {
    setBusy("download");
    try {
      await downloadBackup("/api/admin/backup", "btm-backup-everything.json");
      toast({ title: "Full backup downloaded", description: "Keep the file somewhere safe, e.g. cloud storage." });
    } catch (error) {
      toast({ title: "Backup failed", description: errorMessage(error, "Couldn't create the backup."), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const loadExistingIds = async () => {
    const ids: string[] = await (await apiRequest("GET", "/api/admin/tournament-ids")).json();
    setExistingIds(new Set(ids));
  };

  const handleFileChosen = async (file: File | undefined) => {
    if (fileInput.current) fileInput.current.value = "";
    if (!file) return;
    setFileProblem(null);
    setBackup(null);
    setBusy("reading");
    try {
      const data = await readBackupFile(file);
      if (data.tournaments.length === 0) throw new Error("That backup file is empty.");
      await loadExistingIds();
      setBackup(data);
    } catch (error) {
      setFileProblem(error instanceof Error ? errorMessage(error, "That file couldn't be read.") : "That file couldn't be read.");
    } finally {
      setBusy(null);
    }
  };

  const confirmRestore = async () => {
    if (!pending) return;
    const recreating = !existingIds.has(pending.tournament.id);
    setBusy("restore");
    try {
      const res = await apiRequest("POST", "/api/admin/restore", { entry: entryForUpload(pending, recreating) });
      const result: RestoreResponse = await res.json();
      refreshAfterRestore();
      toast({
        title: result.recreated ? "Tournament recreated" : "Tournament restored",
        description: `${pending.tournament.name} now has ${describeCounts(result.counts)}.`,
      });
      setPending(null);
      await loadExistingIds();
    } catch (error) {
      toast({ title: "Restore failed", description: errorMessage(error, "Nothing was changed."), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const pendingIsRecreate = pending ? !existingIds.has(pending.tournament.id) : false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup className="h-5 w-5" /> Backups
        </CardTitle>
        <CardDescription>
          Download every tournament in one file, or restore any single tournament from a backup — including one that has been deleted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={handleDownload} disabled={busy !== null} className="gap-2" data-testid="button-download-everything">
            {busy === "download" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Back up everything
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => handleFileChosen(e.target.files?.[0])}
            data-testid="input-admin-restore-file"
          />
          <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy !== null} className="gap-2" data-testid="button-admin-choose-backup">
            {busy === "reading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Restore from a backup file
          </Button>
        </div>

        {fileProblem && <p className="text-sm text-destructive">{fileProblem}</p>}

        {backup && (
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {backup.kind === "all" ? "Full backup" : "Tournament backup"} made {formatWhen(backup.createdAt)}
                {backup.createdBy ? ` by ${backup.createdBy}` : ""}. Choose a tournament to restore:
              </p>
              <Button size="icon" variant="ghost" className="h-7 w-7 flex-shrink-0" onClick={() => setBackup(null)} title="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <ul className="divide-y rounded-md border">
              {backup.tournaments.map((entry) => {
                const exists = existingIds.has(entry.tournament.id);
                return (
                  <li key={entry.tournament.id} className="flex items-center justify-between gap-3 p-3" data-testid={`backup-entry-${entry.tournament.id}`}>
                    <div className="min-w-0">
                      <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                        <span className="truncate">{entry.tournament.name}</span>
                        {!exists && <Badge variant="secondary">Deleted</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{describeCounts(entryCounts(entry))}</div>
                      {entry.ownerEmail && <div className="text-xs text-muted-foreground truncate">Owner: {entry.ownerEmail}</div>}
                    </div>
                    <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => setPending(entry)} data-testid={`button-admin-restore-${entry.tournament.id}`}>
                      {exists ? "Restore" : "Recreate"}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!pending} onOpenChange={(o) => !o && busy !== "restore" && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingIsRecreate ? "Recreate" : "Restore"} {pending?.tournament.name}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {pending && <p className="font-medium text-foreground">Backup contains {describeCounts(entryCounts(pending))}.</p>}
                {pendingIsRecreate ? (
                  <p>
                    This tournament no longer exists. It will be recreated with its settings, share links and co-editors
                    {pending?.ownerEmail ? `, owned by ${pending.ownerEmail} if that account still exists (otherwise by you)` : ", owned by you"}.
                  </p>
                ) : (
                  <p>
                    This replaces all current teams, matches and results in this tournament only. Other tournaments are not touched.
                    The current data is saved as an automatic backup first, so you can undo this.
                  </p>
                )}
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
              data-testid="button-admin-confirm-restore"
            >
              {busy === "restore" ? "Working…" : pendingIsRecreate ? "Recreate" : "Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
