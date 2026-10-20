import { useMemo, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import { BarChart3, Share2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import type { Match, Result, Team } from "@shared/schema";
import { calculateTeamPerformance, ordinal, type MatchOutcome } from "@/lib/team-performance";

type Props = {
  teamId: string;
  teams: Team[] | undefined;
  matches: Match[] | undefined;
  results: Result[] | undefined;
  tournamentName: string;
};

const outcomeStyle: Record<MatchOutcome, string> = {
  W: "bg-emerald-500 text-white",
  D: "bg-amber-400 text-amber-950",
  L: "bg-rose-500 text-white",
};

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-2 py-2 text-center">
      <div className="text-xl font-bold leading-tight tabular-nums">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Row({ label, values }: { label: string; values: (string | number)[] }) {
  return (
    <tr className="border-t border-border/60">
      <td className="py-1.5 pr-2 text-left font-medium">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="py-1.5 text-center tabular-nums">{v}</td>
      ))}
    </tr>
  );
}

export function TeamPerformanceDialog({ teamId, teams, matches, results, tournamentName }: Props) {
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const perf = useMemo(
    () => calculateTeamPerformance(teamId, teams, matches, results),
    [teamId, teams, matches, results],
  );

  const shareImage = async () => {
    if (!cardRef.current || !perf) return;
    setSharing(true);
    try {
      const node = cardRef.current;
      const backgroundColor = getComputedStyle(node).backgroundColor || "#ffffff";
      let blob: Blob | null = null;
      try {
        blob = await toBlob(node, { pixelRatio: 2, cacheBust: true, backgroundColor });
      } catch {
        // Web fonts can fail to embed on some devices; fall back to system fonts
        blob = await toBlob(node, { pixelRatio: 2, cacheBust: true, backgroundColor, skipFonts: true });
      }
      if (!blob) throw new Error("Could not create the image");

      const safe = (s: string) => s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-");
      const fileName = `${safe(tournamentName)}-${safe(perf.team.name)}-performance.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${perf.displayName} – performance` });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast({ title: "Image saved", description: "The performance card was downloaded as a picture." });
      }
    } catch (error) {
      // Closing the share sheet without choosing an app isn't an error
      if (error instanceof Error && error.name === "AbortError") return;
      toast({
        title: "Couldn't create the image",
        description: "You can still take a screenshot of the card instead.",
        variant: "destructive",
      });
    } finally {
      setSharing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 px-2 flex-shrink-0" data-testid="button-team-performance">
          <BarChart3 className="h-4 w-4 mr-1" />
          Performance
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[400px] p-3 sm:p-4 max-h-[92vh] overflow-y-auto" data-testid="dialog-team-performance">
        <DialogHeader className="sr-only">
          <DialogTitle>Team performance</DialogTitle>
          <DialogDescription>Performance summary you can share as a picture</DialogDescription>
        </DialogHeader>

        {!perf ? (
          <p className="text-sm text-muted-foreground p-4">Team not found.</p>
        ) : (
          <>
            {/* The card that becomes the shared image */}
            <div ref={cardRef} className="rounded-xl border bg-card text-card-foreground p-4 space-y-3" data-testid="card-team-performance">
              <div className="flex items-center gap-2">
                <img src="/btm-logo.png" alt="" className="h-9 w-9 rounded-md object-cover flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{tournamentName}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Performance · {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              </div>

              <div>
                <h2 className="text-2xl font-bold leading-tight break-words">{perf.team.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {[
                    perf.team.teamDisplayId,
                    perf.division ? `Division ${perf.division}` : null,
                    perf.position !== null && perf.matchesPlayed > 0
                      ? `${ordinal(perf.position)} of ${perf.divisionSize}`
                      : null,
                    perf.furthestStage ? `Reached ${perf.furthestStage}` : null,
                  ].filter(Boolean).join(" · ")}
                </p>
              </div>

              {perf.matchesPlayed === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No results yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-1.5">
                    <Stat label="Pts" value={perf.leaguePoints} />
                    <Stat label="Win %" value={perf.gameWinPct !== null ? `${perf.gameWinPct}%` : "–"} />
                    <Stat label="Diff" value={`${perf.scoreDifference > 0 ? "+" : ""}${perf.scoreDifference}`} />
                    <Stat label="Pos" value={perf.position !== null ? ordinal(perf.position) : "–"} />
                  </div>

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="pb-1 text-left font-medium"></th>
                        <th className="pb-1 font-medium">P</th>
                        <th className="pb-1 font-medium">W</th>
                        <th className="pb-1 font-medium">D</th>
                        <th className="pb-1 font-medium">L</th>
                      </tr>
                    </thead>
                    <tbody>
                      <Row label="Matches" values={[perf.matchesPlayed, perf.matchesWon, perf.matchesDrawn, perf.matchesLost]} />
                      <Row label="Games" values={[perf.gamesPlayed, perf.gamesWon, perf.gamesDrawn, perf.gamesLost]} />
                    </tbody>
                  </table>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Points for</span><span className="font-semibold tabular-nums">{perf.scoreFor}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Against</span><span className="font-semibold tabular-nums">{perf.scoreAgainst}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Avg for</span><span className="font-semibold tabular-nums">{perf.avgFor ?? "–"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Avg against</span><span className="font-semibold tabular-nums">{perf.avgAgainst ?? "–"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">13–0 wins</span><span className="font-semibold tabular-nums">{perf.fannysFor}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">13–0 losses</span><span className="font-semibold tabular-nums">{perf.fannysAgainst}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Win streak</span><span className="font-semibold tabular-nums">{perf.longestWinStreak}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">No-shows</span><span className="font-semibold tabular-nums">{perf.noShows}</span></div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Form</span>
                    <div className="flex gap-1">
                      {perf.form.map((o, i) => (
                        <span key={i} className={`inline-flex h-6 w-6 items-center justify-center rounded text-xs font-bold ${outcomeStyle[o]}`}>
                          {o}
                        </span>
                      ))}
                    </div>
                    <span className="ml-auto text-[11px] text-muted-foreground">latest first</span>
                  </div>

                  {(perf.bestWin || perf.closestGame) && (
                    <div className="space-y-0.5 text-sm">
                      {perf.bestWin && (
                        <p><span className="text-muted-foreground">Best win:</span> <span className="font-semibold">{perf.bestWin.score}</span> v {perf.bestWin.opponent}</p>
                      )}
                      {perf.closestGame && (
                        <p><span className="text-muted-foreground">Closest game:</span> <span className="font-semibold">{perf.closestGame.score}</span> v {perf.closestGame.opponent} {perf.closestGame.won ? "(won)" : "(lost)"}</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            <Button onClick={shareImage} disabled={sharing} className="w-full" data-testid="button-share-performance">
              {sharing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Share2 className="h-4 w-4 mr-2" />}
              {sharing ? "Creating image…" : "Share as image"}
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
