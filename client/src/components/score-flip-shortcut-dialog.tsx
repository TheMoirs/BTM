import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { isRunningAsInstalledApp } from "@/lib/install-prompt";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tournament key (slug) so the shortcut opens Score Flip on that tournament */
  tournamentKey?: string | null;
};

/**
 * Score Flip lives at /coin-toss/ and makes its own home-screen shortcut (its "Create shortcut"
 * button shows the steps for the device). This box takes the person there, or gives them the
 * link to paste into their browser when they're inside the installed PTM app, which has no
 * browser menu.
 */
export function ScoreFlipShortcutDialog({ open, onOpenChange, tournamentKey }: Props) {
  const [copied, setCopied] = useState(false);
  const inApp = isRunningAsInstalledApp();
  const key = tournamentKey && /^[A-Za-z0-9_-]+$/.test(tournamentKey) ? tournamentKey : "";
  const path = `/coin-toss/${key ? `?t=${encodeURIComponent(key)}` : ""}`;
  const url = `${window.location.origin}${path}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) setCopied(false); onOpenChange(value); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Score Flip shortcut</DialogTitle>
          <DialogDescription>
            Score Flip is the coin flip and match score keeper. It works without internet once it has been opened with a signal.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <ol className="list-decimal pl-5 space-y-1">
            {inApp ? (
              <>
                <li>You're in the PTM app, which can't make shortcuts itself. Tap <strong>Copy link</strong> below.</li>
                <li>Open your browser, paste the link into the address bar and go.</li>
              </>
            ) : (
              <li>Tap <strong>Open Score Flip</strong> below.</li>
            )}
            <li>On the Score Flip screen, tap <strong>Create shortcut</strong> and follow the steps for your device.</li>
          </ol>
          <div className="flex gap-2">
            {!inApp && (
              <Button asChild className="flex-1" data-testid="button-open-score-flip">
                <a href={path} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Open Score Flip
                </a>
              </Button>
            )}
            <Button variant={inApp ? "default" : "outline"} className="flex-1" onClick={copyLink} data-testid="button-copy-score-flip-link">
              {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
              {copied ? "Link copied" : "Copy link"}
            </Button>
          </div>
          <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Score Flip link" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
