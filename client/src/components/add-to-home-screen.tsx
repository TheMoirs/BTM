import { useEffect, useMemo, useState } from "react";
import { MonitorSmartphone, Plus, Loader2 } from "lucide-react";
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
  hasShortcut,
  rememberShortcut,
  setCurrentShortcutKey,
  isRunningAsInstalledApp,
  onInstallPromptChange,
} from "@/lib/install-prompt";

type Props = {
  tournamentName: string;
  slug?: string | null;
  page: "leaderboard" | "teams";
  /** Organiser's shortcut to the editable Teams page (needs sign-in) rather than the public view */
  edit?: boolean;
  tournamentId?: string;
  /** Text on the "sm" button (default "Install") */
  label?: string;
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

export function AddToHomeScreenButton({ tournamentName, slug, page, edit = false, tournamentId, label = "Install", variant = "icon", buttonClassName = "" }: Props & { buttonClassName?: string }) {
  const [showHelp, setShowHelp] = useState(false);
  const [, setTick] = useState(0);

  const isEdit = edit && page === "teams";
  // Which badge the icon gets: people = Teams, trophy = Leaderboard, pencil = Teams Edit
  const iconKind = isEdit ? "teams-edit" : page;

  // e.g. "Summer League 2026-Leaderboard", "Summer League 2026-Teams-Edit"
  const shortcutName = `${tournamentName}-${pageLabels[page]}${isEdit ? "-Edit" : ""}`;

  // View shortcuts open the public page (anyone, no sign-in needed);
  // the organiser's edit shortcut opens the editable Teams page for this tournament
  const startUrl = useMemo(() => {
    if (isEdit) return tournamentId ? `/edit/teams?tournament=${encodeURIComponent(tournamentId)}` : "/edit/teams";
    if (slug) return `/${page}/${slug}`;
    // No public address: use the page's own path (never "/", which would cover the whole site)
    return `/${page}${window.location.search}`;
  }, [slug, page, isEdit, tournamentId]);

  // Point the page's manifest and home-screen title at this tournament + page while it's open
  useEffect(() => {
    const href = `/api/public/manifest?name=${encodeURIComponent(shortcutName)}&start=${encodeURIComponent(startUrl)}&icon=${iconKind}`;
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

    // iPhone/iPad take the home-screen picture from the apple-touch-icon
    const touchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const previousTouchIcon = touchIcon?.getAttribute("href") ?? null;
    if (touchIcon) touchIcon.href = `/icons/${iconKind}-180.png?v=3`;

    const previousTitle = document.title;
    document.title = shortcutName;

    return () => {
      document.title = previousTitle;
      if (touchIcon && previousTouchIcon) touchIcon.setAttribute("href", previousTouchIcon);
      if (createdLink) link?.remove();
      if (createdMeta) meta?.remove();
    };
  }, [shortcutName, startUrl, iconKind]);

  useEffect(() => onInstallPromptChange(() => setTick((t) => t + 1)), []);
  useEffect(() => {
    setCurrentShortcutKey(startUrl);
    return () => setCurrentShortcutKey(null);
  }, [startUrl]);
  useEffect(() => {
    if (!showHelp) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [showHelp]);

  // Already opened from a home-screen / desktop shortcut, or this browser already
  // has the shortcut for this page: nothing to add
  if (isRunningAsInstalledApp() || hasShortcut(startUrl)) return null;

  // The browser's own one-click install, when it offers it (Chrome / Edge / Android)
  const runInstallPrompt = async () => {
    const prompt = getInstallPrompt();
    if (!prompt) return false;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        rememberShortcut(startUrl);
        setShowHelp(false);
      }
    } finally {
      clearInstallPrompt();
    }
    return true;
  };

  const handleClick = async () => {
    if (await runInstallPrompt()) return;
    setShowHelp(true);
  };

  const platform = detectPlatform();
  const installReady = !!getInstallPrompt();
  // Browsers that can offer the one-click Install
  const canOneClick = platform === "desktop-chromium" || platform === "android";
  // Chrome/Edge only offer it after ~30 seconds on the page; give up waiting after a minute
  const gaveUpWaiting = !installReady && performance.now() > 60_000;


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
          className={`flex-shrink-0 ${buttonClassName}`}
          onClick={handleClick}
          title="Add to home screen / desktop"
          data-testid={`button-add-shortcut-${page}`}
        >
          <MonitorSmartphone className="h-4 w-4 mr-1.5" />
          {label}
        </Button>
      )}

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a shortcut</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Put the editable teams page on your home screen or desktop. It opens signed in, as long as you're signed in on this browser."
                : `Put the ${pageLabels[page].toLowerCase()} on your home screen or desktop, with the PTM logo.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3 rounded-md border p-3">
              <img src={`/icons/${iconKind}-192.png?v=3`} alt="" className="h-10 w-10 rounded-lg border" />
              <div className="min-w-0">
                <p className="font-medium break-words">{shortcutName}</p>
                <p className="text-xs text-muted-foreground">Shortcut name</p>
              </div>
            </div>

            {(installReady || canOneClick) && (
              <div className="rounded-md bg-muted/60 p-3 space-y-2" data-testid="install-panel">
                {installReady ? (
                  <>
                    <p>Click <strong>Install</strong>, then confirm. {platform === "android" ? "It will appear on your home screen." : "It will appear on your desktop and in your Start menu or Applications."}</p>
                    <Button className="w-full" onClick={runInstallPrompt} data-testid="button-install-now">
                      <Plus className="h-4 w-4 mr-2" />
                      Install
                    </Button>
                  </>
                ) : !gaveUpWaiting ? (
                  <>
                    <p>
                      Your browser makes one-click install available once you've been on this page for about half a minute.
                      Keep this open and the button will switch on by itself.
                    </p>
                    <Button className="w-full" disabled data-testid="button-install-waiting">
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Getting ready…
                    </Button>
                  </>
                ) : (
                  <p>
                    One-click install isn't available. It may already be installed (look on your {platform === "android" ? "home screen" : "desktop or in the Start menu"}),
                    or your browser doesn't offer it here. You can still add it using the steps below.
                  </p>
                )}
              </div>
            )}

            {platform === "ios" && (
              <ol className="list-decimal pl-5 space-y-1">
                <li>Tap the <strong>Share</strong> button (the square with an arrow pointing up). In Safari it's at the bottom of the screen; in Chrome it's next to the address bar.</li>
                <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>Check the name, then tap <strong>Add</strong>.</li>
              </ol>
            )}
            {platform === "android" && !installReady && (
              <ol className="list-decimal pl-5 space-y-1">
                <li>Tap the browser's <strong>⋮</strong> menu (top right).</li>
                <li>Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>).</li>
                <li>Tap <strong>Add</strong> to confirm.</li>
              </ol>
            )}
            {platform === "desktop-chromium" && (
              <details open={gaveUpWaiting} className="text-muted-foreground">
                <summary className="cursor-pointer select-none">Other ways to add it</summary>
                <ol className="list-decimal pl-5 space-y-1 mt-2 text-foreground">
                  <li>Click the <strong>install</strong> icon at the right of the address bar, if you see one.</li>
                  <li>Or in Chrome open the <strong>⋮</strong> menu → <strong>Cast, save and share</strong> → <strong>Install page as app</strong> (or <strong>Create shortcut</strong>, and tick <strong>Open as window</strong>). In Edge, open <strong>…</strong> → <strong>Apps</strong> → <strong>Install this site as an app</strong>.</li>
                </ol>
              </details>
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
                <li>Or open this page in Chrome, Edge or Safari, which can add it with the PTM logo.</li>
              </ol>
            )}

          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
