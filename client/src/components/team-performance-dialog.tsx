import { useEffect, useMemo, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import { BarChart3, Share2, Loader2, Download } from "lucide-react";
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
  const cardRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // The picture is made as soon as the card opens, so that pressing "Share"
  // can open the share sheet straight away. (Phones, iPhones especially, only
  // allow sharing directly from a tap, not after waiting for something else.)
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepareFailed, setPrepareFailed] = useState(false);
  const [showPicture, setShowPicture] = useState(false);

  const perf = useMemo(
    () => calculateTeamPerformance(teamId, teams, matches, results),
    [teamId, teams, matches, results],
  );

  const safe = (s: string) => s.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-");
  const fileName = perf ? `${safe(tournamentName)}-${safe(perf.team.name)}-performance.png` : "performance.png";

  const prepareImage = async () => {
    const node = cardRef.current;
    if (!node) return;
    setPreparing(true);
    setPrepareFailed(false);
    try {
      const backgroundColor = getComputedStyle(node).backgroundColor || "#ffffff";
      const render = async (skipFonts: boolean) => {
        const opts = { pixelRatio: 2, backgroundColor, skipFonts };
        // Safari sometimes leaves images out of the first render, so render twice
        await toBlob(node, opts).catch(() => null);
        return toBlob(node, opts);
      };
      let blob: Blob | null = null;
      try {
        blob = await render(false);
      } catch (err) {
        console.warn("[performance] image with web fonts failed, retrying without", err);
      }
      if (!blob) blob = await render(true); // system fonts instead of downloaded ones
      if (!blob) throw new Error("No image produced");
      setImageFile(new File([blob], fileName, { type: "image/png" }));
      setImageUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob!);
      });
    } catch (err) {
      console.error("[performance] couldn't create image", err);
      setPrepareFailed(true);
    } finally {
      setPreparing(false);
    }
  };

  useEffect(() => {
    if (!open || !perf) return;
    // Wait for the dialog's opening animation to finish before taking the picture
    const timer = setTimeout(prepareImage, 450);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, perf]);

  useEffect(() => {
    if (open) return;
    setImageFile(null);
    setShowPicture(false);
    setPrepareFailed(false);
    setImageUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  }, [open]);

  const downloadImage = () => {
    if (!imageUrl) return;
    const a = document.createElement("a");
    a.href = imageUrl;
    a.download = fileName;
    a.click();
  };

  // Not async before navigator.share: it must run directly from the tap
  const handleShare = () => {
    if (!imageFile) {
      if (prepareFailed) {
        toast({
          title: "Couldn't create the image",
          description: "Trying again. If it still doesn't work, take a screenshot of the card instead.",
          variant: "destructive",
        });
        prepareImage();
      }
      return;
    }
    if (typeof navigator.share === "function" && navigator.canShare?.({ files: [imageFile] })) {
      navigator.share({ files: [imageFile] }).catch((err: unknown) => {
        // Closing the share sheet without choosing an app isn't a problem
        if (err instanceof Error && err.name === "AbortError") return;
        console.warn("[performance] share failed, showing the picture instead", err);
        setShowPicture(true);
      });
      return;
    }
    // Computers and browsers that can't share files: save the picture
    downloadImage();
    toast({ title: "Image saved", description: "The performance card was downloaded as a picture." });
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
            {showPicture && imageUrl && (
              <div className="space-y-2">
                <img src={imageUrl} alt="Performance card" className="w-full rounded-xl border" data-testid="img-performance-picture" />
                <p className="text-sm text-muted-foreground text-center">
                  Press and hold the picture to save or share it.
                </p>
              </div>
            )}
            <div ref={cardRef} className={`${showPicture && imageUrl ? "hidden " : ""}rounded-xl border bg-card text-card-foreground p-4 space-y-3`} data-testid="card-team-performance">
              <div className="flex items-center gap-2">
                <img src="/ptm-logo.png?v=4" alt="" className="h-11 w-11 rounded-md object-cover flex-shrink-0" />
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
                    <div className="flex justify-between"><span className="text-muted-foreground">Scores for</span><span className="font-semibold tabular-nums">{perf.scoreFor}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Scores against</span><span className="font-semibold tabular-nums">{perf.scoreAgainst}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Avg score for</span><span className="font-semibold tabular-nums">{perf.avgFor ?? "–"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Avg score against</span><span className="font-semibold tabular-nums">{perf.avgAgainst ?? "–"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Fanny wins</span><span className="font-semibold tabular-nums">{perf.fannysFor}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Fanny losses</span><span className="font-semibold tabular-nums">{perf.fannysAgainst}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Win streak</span><span className="font-semibold tabular-nums">{perf.longestWinStreak}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">No-shows</span><span className="font-semibold tabular-nums">{perf.noShows}</span></div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm text-muted-foreground">Form</span>
                      <span className="text-[11px] text-muted-foreground">last {perf.form.length} {perf.form.length === 1 ? "match" : "matches"}, games won–lost, latest first</span>
                    </div>
                    <div className="flex gap-1">
                      {perf.form.map((f, i) => (
                        <span
                          key={i}
                          title={`v ${f.opponent}${f.noShow ? " (no-show)" : ""}`}
                          className={`inline-flex h-7 min-w-[2.75rem] px-1.5 items-center justify-center rounded text-xs font-bold tabular-nums ${outcomeStyle[f.outcome]}`}
                        >
                          {f.gamesWon}–{f.gamesLost}
                        </span>
                      ))}
                    </div>
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

            {showPicture && imageUrl ? (
              <Button variant="outline" onClick={downloadImage} className="w-full" data-testid="button-download-performance">
                <Download className="h-4 w-4 mr-2" />
                Download picture
              </Button>
            ) : (
              <Button onClick={handleShare} disabled={!imageFile && !prepareFailed} className="w-full" data-testid="button-share-performance">
                {!imageFile && !prepareFailed ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Share2 className="h-4 w-4 mr-2" />}
                {!imageFile && !prepareFailed ? "Preparing image…" : "Share as image"}
              </Button>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
