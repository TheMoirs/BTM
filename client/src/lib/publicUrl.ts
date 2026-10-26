// The address BTM's share links should use. Set PUBLIC_URL on the server (e.g.
// https://btm.themoirs.uk) so links use your own domain even when the app is opened
// on its onrender.com address. Without it, the current address is used.
let cached: Promise<string> | null = null;

export function getPublicBaseUrl(): Promise<string> {
  if (!cached) {
    cached = fetch("/api/public/config")
      .then(r => (r.ok ? r.json() : null))
      .then(data => (data?.publicUrl as string | null) || window.location.origin)
      .catch(() => window.location.origin);
  }
  return cached;
}
