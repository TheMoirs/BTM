import { useEffect, useMemo, useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  clearInstallPrompt,
  getInstallPrompt,
  isRunningAsInstalledApp,
  onInstallPromptChange,
} from "@/lib/install-prompt";

type Props = {
  tournamentName: string;
  slug?: string | null;
  page: "leaderboard" | "teams";
  /** "icon" for a compact square button, "sm" for an icon + label button */
  variant?: "icon" | "sm";
};

type Platform = "ios" | "android" | "mac-safari" | "desktop-chromium" | "firefox" | "other";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Edg\/|Chrome\//.test(ua)) return "desktop-chromium";
  if (/Macintosh/.test(ua) && /Safari\//.test(ua)) return "mac-safari";
  return "other";
}

const pageLabels = { leaderboard: "Leaderboard", teams: "Teams" } as const;

export function AddToHomeScreenButton({ tournamentName, slug, page, variant = "icon" }: Props) {
  const [showHelp, setShowHelp] = useState(false);
  const [, setTick] = useState(0);

  // e.g. "Summer League 2026-Leaderboard"
  const shortcutName = `${tournamentName}-${pageLabels[page]}`;

  // Shortcuts open the public page for the tournament (works for anyone, no sign-in needed)
  const startUrl = useMemo(() => {
    if (slug) return `/${page}/${slug}`;
    return window.location.pathname + window.location.search;
  }, [slug, page]);

  // Point the page's manifest and home-screen title at this tournament + page while it's open
  useEffect(() => {
    const href = `/api/public/manifest?name=${encodeURIComponent(shortcutName)}&start=${encodeURIComponent(startUrl)}`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const createdLink = !link;
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    link.href = href;

    let meta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const createdMeta = !meta;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "apple-mobile-web-app-title";
      document.head.appendChild(meta);
    }
    meta.content = shortcutName;

    const previousTitle = document.title;
    document.title = shortcutName;

    return () => {
      document.title = previousTitle;
      if (createdLink) link?.remove();
      if (createdMeta) meta?.remove();
    };
  }, [shortcutName, startUrl]);

  useEffect(() => onInstallPromptChange(() => setTick((t) => t + 1)), []);

  // Already opened from a home-screen / desktop shortcut: nothing to add
  if (isRunningAsInstalledApp()) return null;

  const handleClick = async () => {
    const prompt = getInstallPrompt();
    if (prompt) {
      try {
        await prompt.prompt();
        await prompt.userChoice;
      } finally {
        clearInstallPrompt();
      }
      return;
    }
    setShowHelp(true);
  };

  const platform = detectPlatform();

  return (
    <>
      {variant === "icon" ? (
        <Button
          variant="outline"
          size="icon"
          onClick={handleClick}
          aria-label="Add to home screen"
          title="Add to home screen / desktop"
          data-testid={`button-add-shortcut-${page}`}
        >
          <MonitorSmartphone className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={handleClick}
          title="Add to home screen / desktop"
          data-testid={`button-add-shortcut-${page}`}
        >
          <MonitorSmartphone className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Add Shortcut</span>
        </Button>
      )}

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a shortcut</DialogTitle>
            <DialogDescription>
              Put the {pageLabels[page].toLowerCase()} on your home screen or desktop, with the BTM logo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3 rounded-md border p-3">
              <img src="/icon-192.png" alt="" className="h-10 w-10 rounded-lg border" />
              <div className="min-w-0">
                <p className="font-medium break-words">{shortcutName}</p>
                <p className="text-xs text-muted-foreground">Shortcut name</p>
              </div>
            </div>

            {platform === "ios" && (
              <ol className="list-decimal pl-5 space-y-1">
                <li>Tap the <strong>Share</strong> button (the square with an arrow pointing up). In Safari it's at the bottom of the screen; in Chrome it's next to the address bar.</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>Check the name, then tap <strong>Add</strong>.</li>
              </ol>
            )}
            {platform === "android" && (
              <ol className="list-decimal pl-5 space-y-1">
                <li>Tap the browser's <strong>⋮</strong> menu (top right).</li>
                <li>Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>).</li>
                <li>Tap <strong>Add</strong> to confirm.</li>
              </ol>
            )}
            {platform === "desktop-chromium" && (
              <ol className="list-decimal pl-5 space-y-1">
                <li>Click the <strong>install</strong> icon at the right of the address bar, if you see one.</li>
                <li>Otherwise, in Chrome open the <strong>⋮</strong> menu → <strong>Cast, save and share</strong> → <strong>Install page as app</strong> (or <strong>Create shortcut</strong>). In Edge, open <strong>…</strong> → <strong>Apps</strong> → <strong>Install this site as an app</strong>.</li>
              </ol>
            )}
            {platform === "mac-safari" && (
              <ol className="list-decimal pl-5 space-y-1">
                <li>In Safari's menu bar, choose <strong>File</strong> → <strong>Add to Dock</strong>.</li>
                <li>Check the name, then click <strong>Add</strong>.</li>
              </ol>
            )}
            {(platform === "firefox" || platform === "other") && (
              <ol className="list-decimal pl-5 space-y-1">
                <li>Drag the <strong>padlock</strong> icon at the left of the address bar onto your desktop.</li>
                <li>Or open this page in Chrome, Edge or Safari, which can add it with the BTM logo.</li>
              </ol>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
