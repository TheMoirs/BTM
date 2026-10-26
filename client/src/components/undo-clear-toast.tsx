import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { describeCounts, errorMessage, restoreSnapshot } from "@/lib/backup";

/**
 * Toast shown after a "Clear all". When a safety backup was saved and the user
 * is logged in, it offers an Undo button that puts the data straight back.
 */
export function showClearedToast(opts: {
  title: string;
  description: string;
  tournamentId: string;
  snapshotId: string | null;
  canUndo: boolean;
}) {
  const { title, description, tournamentId, snapshotId, canUndo } = opts;

  if (!snapshotId) {
    toast({ title, description });
    return;
  }

  if (!canUndo) {
    toast({ title, description: `${description} A safety backup was saved; the tournament owner can restore it from Backups.` });
    return;
  }

  const undo = async () => {
    try {
      const result = await restoreSnapshot(tournamentId, snapshotId);
      toast({ title: "Undone", description: `Put back ${describeCounts(result.counts)}.` });
    } catch (error) {
      toast({
        title: "Couldn't undo",
        description: errorMessage(error, "You can still restore it from Backups in the tournament list."),
        variant: "destructive",
        duration: Infinity,
      });
    }
  };

  toast({
    title,
    description: `${description} Changed your mind? Tap Undo, or restore it later from Backups.`,
    duration: 20000,
    action: (
      <ToastAction altText="Undo" onClick={undo} data-testid="button-undo-clear">
        Undo
      </ToastAction>
    ),
  });
}
