import { Switch, Route, useLocation, Redirect, Router as WouterRouter } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TournamentProvider } from "@/contexts/TournamentContext";
import { ViewModeProvider } from "@/contexts/ViewModeContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Navigation } from "@/components/navigation";
import Teams from "@/pages/teams";
import Matches from "@/pages/matches";
import Results from "@/pages/results";
import Leaderboard from "@/pages/leaderboard";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import AdminUsers from "@/pages/admin-users";
import NotFound from "@/pages/not-found";
import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { ClerkProvider, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";

// ── Clerk configuration ───────────────────────────────────────────────────
// REQUIRED — copy verbatim (resolves key from hostname so same build serves
// multiple Clerk custom domains). Must not be the raw env var or undefined.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — copy verbatim. Empty in dev (Clerk hits dev FAPI directly),
// auto-set in prod. Do NOT gate on import.meta.env.PROD / NODE_ENV.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

export const clerkAppearance = {
  theme: shadcn,
  // NOTE: no cssLayerName — this project uses Tailwind v3 (PostCSS)
  options: {
    socialButtonsPlacement: "top" as const,
    socialButtonsVariant: "blockButton" as const,
  },
  variables: {
    colorPrimary: "#3b82f6",
    colorForeground: "#0f172a",
    colorMutedForeground: "#64748b",
    colorDanger: "#ef4444",
    colorBackground: "#ffffff",
    colorInput: "#ffffff",
    colorInputForeground: "#0f172a",
    colorNeutral: "#e2e8f0",
    fontFamily: "inherit",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-xl w-full max-w-[440px] overflow-hidden shadow-sm border border-slate-200",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-slate-900 font-semibold",
    headerSubtitle: "text-slate-500",
    socialButtonsBlockButtonText: "text-slate-700 font-medium",
    formFieldLabel: "text-slate-700",
    footerActionLink: "text-blue-500 hover:text-blue-600",
    footerActionText: "text-slate-500",
    dividerText: "text-slate-400",
    identityPreviewEditButton: "text-blue-500",
    formFieldSuccessText: "text-green-600",
    alertText: "text-red-600",
    logoBox: "hidden",
    socialButtonsBlockButton: "border border-slate-200 hover:bg-slate-50",
    formButtonPrimary: "bg-blue-500 hover:bg-blue-600 text-white",
    formFieldInput: "border-slate-200",
    footerAction: "bg-slate-50 border-t border-slate-100",
    dividerLine: "bg-slate-200",
    alert: "bg-red-50",
    otpCodeFieldInput: "border-slate-200",
    formFieldRow: "",
    main: "",
  },
};

// ── Server startup guard ──────────────────────────────────────────────────
function ServerStartupGuard({ children }: { children: React.ReactNode }) {
  const [serverReady, setServerReady] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    const checkServer = async () => {
      try {
        await fetch("/api/auth/check-access");
        setServerReady(true);
      } catch {
        setAttempt(prev => prev + 1);
        timeoutId = setTimeout(checkServer, 3000);
      }
    };
    checkServer();
    return () => clearTimeout(timeoutId);
  }, []);

  if (!serverReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-background text-foreground">
        <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
        <p className="text-lg font-medium">Starting up, please wait…</p>
        {attempt > 1 && (
          <p className="text-sm text-muted-foreground">This may take a few seconds on first load.</p>
        )}
      </div>
    );
  }

  return <>{children}</>;
}

// ── Query client cache invalidator on Clerk user change ───────────────────
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener]);

  return null;
}

// ── Main app content (authenticated routes) ───────────────────────────────
function AppContent() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  const hasPersistedViewToken =
    typeof window !== "undefined" && !!sessionStorage.getItem("boules_view_token");

  const urlToken =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("token")
      : null;
  const [urlTokenIsView, setUrlTokenIsView] = useState<boolean | null>(
    urlToken ? null : false
  );

  useEffect(() => {
    if (!urlToken) { setUrlTokenIsView(false); return; }
    fetch(`/api/auth/check-access${window.location.search}`, { credentials: "omit" })
      .then(r => r.json())
      .then(data => setUrlTokenIsView(!!data.isViewOnlyAccess))
      .catch(() => setUrlTokenIsView(false));
  }, [urlToken]);

  if (isLoading || urlTokenIsView === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isViewLinkAccess = urlTokenIsView || hasPersistedViewToken;

  if (isViewLinkAccess) {
    const showNavigation = location !== "/leaderboard";
    return (
      <ViewModeProvider>
        <TournamentProvider>
          <div className="min-h-screen bg-background">
            {showNavigation && <Navigation />}
            <Switch>
              <Route path="/" component={Teams} />
              <Route path="/teams" component={Teams} />
              <Route path="/matches" component={Matches} />
              <Route path="/results" component={Results} />
              <Route path="/leaderboard" component={Leaderboard} />
              <Route component={NotFound} />
            </Switch>
          </div>
          <Toaster />
        </TournamentProvider>
      </ViewModeProvider>
    );
  }

  if (!user) {
    return (
      <>
        <Redirect to="/sign-in" />
        <Toaster />
      </>
    );
  }

  const showNavigation = location !== "/leaderboard";

  return (
    <ViewModeProvider>
      <TournamentProvider>
        <div className="min-h-screen bg-background">
          {showNavigation && <Navigation />}
          <Switch>
            <Route path="/" component={Teams} />
            <Route path="/teams" component={Teams} />
            <Route path="/matches" component={Matches} />
            <Route path="/results" component={Results} />
            <Route path="/leaderboard" component={Leaderboard} />
            <Route path="/admin/users" component={AdminUsers} />
            <Route component={NotFound} />
          </Switch>
        </div>
        <Toaster />
      </TournamentProvider>
    </ViewModeProvider>
  );
}

// ── Clerk router (must be inside WouterRouter to use useLocation) ─────────
function ClerkRouter() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
          <ServerStartupGuard>
            <AuthProvider>
              <Switch>
                {/* Clerk OAuth callback routes — MUST be /*? to match sub-paths */}
                <Route path="/sign-in/*?" component={SignInPage} />
                <Route path="/sign-up/*?" component={SignUpPage} />
                {/* Legacy /login redirect */}
                <Route path="/login">
                  <Redirect to="/sign-in" />
                </Route>
                <Route component={AppContent} />
              </Switch>
            </AuthProvider>
          </ServerStartupGuard>
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkRouter />
    </WouterRouter>
  );
}

export default App;
