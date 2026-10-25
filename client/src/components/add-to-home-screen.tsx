import { useEffect, useMemo, useState } from "react";
import { MonitorSmartphone, Plus, Loader2, Copy, Check } from "lucide-react";
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
  forgetShortcut,
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
  /** Let a page open the box from elsewhere too (e.g. the phone ☰ menu, which closes when tapped) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Keep the box available even when PTM is already installed (the account menu uses this) */
  alwaysShow?: boolean;
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

export function AddToHomeScreenButton({ tournamentName, slug, page, edit = false, tournamentId, label = "Install", variant = "icon", buttonClassName = "", open, onOpenChange, alwaysShow = false }: Props & { buttonClassName?: string }) {
  const [showHelpState, setShowHelpState] = useState(false);
  const showHelp = open ?? showHelpState;
  const setShowHelp = (value: boolean) => (onOpenChange ? onOpenChange(value) : setShowHelpState(value));
  const [copied, setCopied] = useState(false);
  const [, setTick] = useState(0);

  // Android Chrome treats every installed app on a site as covering the whole site, so a
  // second per-tournament install was taken for the first ("app already exists", then
  // "could not open app"). So organisers install ONE PTM app (opens on the tournament
  // they last used), and the Teams / Leaderboard views get a plain shortcut instead.
  const isApp = edit && page === "teams";
  // Which icon: people = Teams, ranked rows = Leaderboard
  const iconKind = page;

  // e.g. "Summer League 2026-Leaderboard"; the organiser app is just "PTM"
  const shortcutName = isApp ? "PTM" : `${tournamentName}-${pageLabels[page]}`;

  // View shortcuts open the public page (anyone, no sign-in needed); the app opens at the start
  const startUrl = useMemo(() => {
    if (isApp) return "/";
    if (slug) return `/${page}/${slug}`;
    return `/${page}${window.location.search}`;
  }, [slug, page, isApp, tournamentId]);

  // App: point the page's manifest at the PTM app. Shortcut: no manifest at all, so
  // Chrome makes a plain home-screen shortcut (named from the page title, with the icon below)
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const createdLink = isApp && !link;
    // A plain shortcut takes the manifest away while it is open; put it back afterwards so the
    // PTM app can still be installed from the same page
    const removedLink = !isApp ? link : null;
    if (isApp) {
      if (!link) {
        link = document.createElement("link");
        link.rel = "manifest";
        document.head.appendChild(link);
      }
      link.href = "/api/public/manifest/ptm-app?app=1";
    } else {
      link?.remove();
      link = null;
    }

    // Android shortcuts take the largest page icon: offer the Teams / Leaderboard one
    let pageIcon: HTMLLinkElement | null = null;
    if (!isApp) {
      pageIcon = document.createElement("link");
      pageIcon.rel = "icon";
      pageIcon.setAttribute("sizes", "192x192");
      pageIcon.type = "image/png";
      pageIcon.href = `/icons/${iconKind}-192.png?v=5`;
      document.head.appendChild(pageIcon);
    }

    let meta = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const createdMeta = !meta;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "apple-mobile-web-app-title";
      document.head.appendChild(meta);
    }
    meta.content = shortcutName;

    // Android Chrome's "Create shortcut" checks application-name before the page title
    let appName = document.querySelector<HTMLMetaElement>('meta[name="application-name"]');
    const createdAppName = !appName;
    if (!appName) {
      appName = document.createElement("meta");
      appName.name = "application-name";
      document.head.appendChild(appName);
    }
    appName.content = shortcutName;

    // iPhone/iPad take the home-screen picture from the apple-touch-icon
    const touchIcon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const previousTouchIcon = touchIcon?.getAttribute("href") ?? null;
    if (touchIcon) touchIcon.href = isApp ? "/apple-touch-icon.png?v=5" : `/icons/${iconKind}-180.png?v=5`;

    const previousTitle = document.title;
    document.title = shortcutName;

    return () => {
      document.title = previousTitle;
      if (touchIcon && previousTouchIcon) touchIcon.setAttribute("href", previousTouchIcon);
      if (createdLink) link?.remove();
      if (removedLink && !removedLink.isConnected) document.head.appendChild(removedLink);
      pageIcon?.remove();
      if (createdMeta) meta?.remove();
      if (createdAppName) appName?.remove();
    };
  }, [shortcutName, startUrl, iconKind, isApp]);

  useEffect(() => onInstallPromptChange(() => setTick((t) => t + 1)), []);
  // Only the PTM app is remembered as installed; plain shortcuts can't be detected
  useEffect(() => {
    if (!isApp) return;
    setCurrentShortcutKey(startUrl);
    return () => setCurrentShortcutKey(null);
  }, [startUrl, isApp]);
  useEffect(() => {
    if (!showHelp) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [showHelp]);

  // Running inside an installed app, or (PTM app only) already installed in this
  // browser: nothing to add. View pages always offer the Shortcut button, since a
  // plain shortcut can't be detected and an old "installed" note could hide it.
  // Inside the PTM app, the Teams / Leaderboard views still offer the Shortcut button:
  // it sends the page to Chrome, where the shortcut is made (the app has no browser menu).
  const inApp = isRunningAsInstalledApp();
  const alreadyInstalled = isApp && (inApp || hasShortcut(startUrl));
  if (alreadyInstalled && !alwaysShow) return null;

  // The browser's own one-click install, when it offers it (Chrome / Edge / Android)
  // (only for the PTM app: view pages are plain shortcuts and have nothing to install)
  const runInstallPrompt = async () => {
    const prompt = isApp ? getInstallPrompt() : null;
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
  const installReady = isApp && !!getInstallPrompt();
  // Browsers that can offer the one-click Install (the PTM app only)
  const canOneClick = isApp && (platform === "desktop-chromium" || platform === "android");
  const buttonLabel = isApp ? label : "Shortcut";
  // Inside the PTM app: copy the page's public link to paste into the browser
  // (sending it to Chrome directly doesn't work: the app keeps PTM pages)
  const copyLink = async () => {
    const url = `${window.location.origin}${startUrl}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Copy this link:", url);
    }
    setCopied(true);
  };
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
          {buttonLabel}
        </Button>
      )}

      <Dialog open={showHelp} onOpenChange={setShowHelp}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{isApp ? "Install the PTM app" : "Add a shortcut"}</DialogTitle>
            <DialogDescription>
              {isApp
                ? "Put PTM on your home screen or desktop. It opens on the tournament you last used, signed in as long as you're signed in on this browser. Press and hold its icon for Teams, Matches, Results and Leaderboard."
                : `Put the ${pageLabels[page].toLowerCase()} for this tournament on your home screen or desktop. Anyone can use it, no sign-in needed.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-3 rounded-md border p-3">
              <img src={isApp ? "/icon-192.png?v=5" : `/icons/${iconKind}-192.png?v=5`} alt="" className="h-10 w-10 rounded-lg border" />
              <div className="min-w-0">
                <p className="font-medium break-words">{shortcutName}</p>
                <p className="text-xs text-muted-foreground">{isApp ? "App name" : "Shortcut name"}</p>
              </div>
            </div>

            {alreadyInstalled && (
              <div className="rounded-md bg-muted/60 p-3 space-y-2" data-testid="already-installed-panel">
                <p>
                  <strong>PTM is already installed on this device.</strong> A web page can't replace an installed app, so to put a fresh copy on,
                  remove the old one first:
                </p>
                <ol className="list-decimal pl-5 space-y-1">
                  {platform === "android" && <li>Press and hold the PTM icon on your home screen, then tap <strong>Uninstall</strong> (or <strong>Remove</strong>).</li>}
                  {platform === "ios" && <li>Press and hold the PTM icon, tap <strong>Remove App</strong>, then <strong>Delete from Home Screen</strong>.</li>}
                  {platform === "desktop-chromium" && <li>Open the PTM app window, click <strong>⋮</strong> (top right), then <strong>Uninstall PTM</strong>. Or open <strong>chrome://apps</strong>, right-click PTM and choose <strong>Remove from Chrome</strong>.</li>}
                  {platform === "mac-safari" && <li>Right-click the PTM icon in the Dock and choose <strong>Options</strong> → <strong>Remove from Dock</strong>.</li>}
                  {(platform === "firefox" || platform === "other") && <li>Delete the old PTM icon or shortcut from your home screen or desktop.</li>}
                  <li>{inApp ? <>Then open <strong>ptm.themoirs.uk</strong> in your browser (the installed app closes when it is removed), sign in, and choose <strong>Install PTM app</strong> from the menu.</> : <>Then tap <strong>Install again</strong> below.</>}</li>
                </ol>
                {!inApp && (
                  <Button className="w-full" variant="outline" onClick={() => forgetShortcut(startUrl)} data-testid="button-install-again">
                    <Plus className="h-4 w-4 mr-2" />
                    Install again
                  </Button>
                )}
              </div>
            )}

            {(installReady || canOneClick) && !alreadyInstalled && (
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
            {platform === "android" && isApp && !installReady && (
              <ol className="list-decimal pl-5 space-y-1">
                <li>Tap the browser's <strong>⋮</strong> menu (top right).</li>
                <li>Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>).</li>
                <li>Tap <strong>Install</strong> to confirm.</li>
              </ol>
            )}
            {inApp && !isApp && (
              <div className="rounded-md bg-muted/60 p-3 space-y-2" data-testid="copy-link-panel">
                <p>
                  You're in the PTM app, which can't make shortcuts itself (and keeps PTM pages
                  inside the app). Make the shortcut in your browser instead:
                </p>
                <ol className="list-decimal pl-5 space-y-1">
                  <li>Tap <strong>Copy link</strong>.</li>
                  <li>Open {platform === "android" ? "Chrome" : "your browser"}, paste the link into the address bar and go.</li>
                  <li>Then follow the steps below there.</li>
                </ol>
                <Button className="w-full" onClick={copyLink} data-testid="button-copy-link">
                  {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
                  {copied ? "Link copied" : "Copy link"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Tip: make your Teams and Leaderboard shortcuts in the browser before installing the PTM app, and you won't need this step.
                </p>
              </div>
            )}
            {platform === "android" && !isApp && (
              <ol className="list-decimal pl-5 space-y-1">
                <li>Tap the browser's <strong>⋮</strong> menu (top right).</li>
                <li>Tap <strong>Add to Home screen</strong>.</li>
                <li>If it asks <strong>Install</strong> or <strong>Create shortcut</strong>, choose <strong>Create shortcut</strong>.</li>
                <li>Check the name, then tap <strong>Add</strong>.</li>
              </ol>
            )}
            {platform === "desktop-chromium" && !isApp && (
              <ol className="list-decimal pl-5 space-y-1">
                <li>In Chrome open the <strong>⋮</strong> menu → <strong>Cast, save and share</strong> → <strong>Create shortcut</strong>.</li>
                <li>In Edge open <strong>…</strong> → <strong>More tools</strong> → <strong>Pin to taskbar</strong> or <strong>Pin to Start</strong>.</li>
              </ol>
            )}
            {platform === "desktop-chromium" && isApp && (
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
