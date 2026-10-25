// Chrome / Edge / Android offer an "install" prompt once a page has a web app
// manifest. The event fires early and only once, so it's caught here at
// start-up and kept until the "Add to home screen" button is pressed.

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

// ── Remembering which shortcuts exist in this browser ─────────────────────
// Browsers don't tell a page whether its shortcut is installed, so BTM notes it
// when you install from here, and again every time the shortcut is opened.
// After two months without the shortcut being opened, the button comes back
// (in case it was removed).
const SHORTCUT_KEY_PREFIX = "btm-shortcut:";
const REMEMBER_FOR_MS = 60 * 24 * 60 * 60 * 1000;
let currentShortcutKey: string | null = null;

export function rememberShortcut(key: string) {
  try {
    localStorage.setItem(SHORTCUT_KEY_PREFIX + key, String(Date.now()));
  } catch {
    /* storage unavailable: just keep showing the button */
  }
  listeners.forEach((fn) => fn());
}

/** Forget that a shortcut was installed (used when the person is replacing it) */
export function forgetShortcut(key: string) {
  try {
    localStorage.removeItem(SHORTCUT_KEY_PREFIX + key);
  } catch {
    /* storage unavailable: nothing to forget */
  }
  listeners.forEach((fn) => fn());
}

export function hasShortcut(key: string) {
  try {
    const at = Number(localStorage.getItem(SHORTCUT_KEY_PREFIX + key));
    return !!at && Date.now() - at < REMEMBER_FOR_MS;
  } catch {
    return false;
  }
}

/** The page tells us which shortcut it offers, so an install via the browser menu is remembered too */
export function setCurrentShortcutKey(key: string | null) {
  currentShortcutKey = key;
}

export function captureInstallPrompt() {
  if (typeof window === "undefined") return;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own button instead of the browser's mini-bar
    deferred = e as InstallPromptEvent;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    if (currentShortcutKey) rememberShortcut(currentShortcutKey);
    listeners.forEach((fn) => fn());
  });

  // Opened from a shortcut (its address ends with from=shortcut): remember it, then tidy the address
  const url = new URL(window.location.href);
  if (url.searchParams.get("from") === "shortcut") {
    url.searchParams.delete("from");
    const key = url.pathname + (url.search || "");
    rememberShortcut(key);
    window.history.replaceState(window.history.state, "", key + url.hash);
  }
}

export function getInstallPrompt() {
  return deferred;
}

export function clearInstallPrompt() {
  deferred = null;
}

export function onInstallPromptChange(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isRunningAsInstalledApp() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: minimal-ui)").matches ||
    (navigator as any).standalone === true
  );
}
