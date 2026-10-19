import { useEffect, useRef, useState } from "react";

// Google's own "Sign in with Google" button (Google Identity Services).
// The client ID comes from the server (GOOGLE_CLIENT_ID). If it isn't set, or
// Google's script can't load (offline, blocker), the button simply doesn't appear
// and email/password sign-in still works.

declare global {
  interface Window {
    google?: any;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadGoogleScript(): Promise<void> {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error("Couldn't load Google sign-in"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

interface Props {
  onCredential: (credential: string) => void;
  /** Called once we know whether the button could be shown */
  onAvailability?: (available: boolean) => void;
  text?: "signin_with" | "signup_with" | "continue_with";
}

export function GoogleSignInButton({ onCredential, onAvailability, text = "continue_with" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callbackRef = useRef(onCredential);
  callbackRef.current = onCredential;
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/google-client-id");
        const { clientId } = await res.json();
        if (!clientId) throw new Error("Google sign-in not configured");
        await loadGoogleScript();
        if (cancelled || !containerRef.current || !window.google?.accounts?.id) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: { credential: string }) => callbackRef.current(response.credential),
        });
        const width = Math.min(containerRef.current.offsetWidth || 320, 400);
        window.google.accounts.id.renderButton(containerRef.current, {
          theme: "outline",
          size: "large",
          text,
          width,
        });
        setAvailable(true);
        onAvailability?.(true);
      } catch {
        if (!cancelled) {
          setAvailable(false);
          onAvailability?.(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  if (available === false) return null;
  return <div ref={containerRef} className="w-full flex justify-center min-h-[44px]" data-testid="button-google-signin" />;
}
