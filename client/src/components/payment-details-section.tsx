import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { StripeTestNotice } from "@/components/stripe-test-notice";
import { StripeSignupGuide } from "@/components/stripe-signup-guide";

type ModeStatus = { available: boolean; connected: boolean; ready: boolean; detailsSubmitted: boolean };
type ConnectStatus = { available: boolean; modes: { test: ModeStatus; live: ModeStatus } };
type Mode = "test" | "live";

/**
 * Card payments: the organiser connects their own Stripe account, and captains' fees go
 * straight to it. Stripe keeps test and live apart, so each mode is set up separately.
 */
function StripeConnectBlock() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [opening, setOpening] = useState<Mode | null>(null);

  const loadStatus = () =>
    fetch("/api/connect/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((st) => st && setStatus(st))
      .catch(() => {});

  useEffect(() => {
    loadStatus();
    // Stripe's sign-up opens in another tab: check again when they come back to this one
    const onFocus = () => loadStatus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  if (!status?.available) return null;

  const open = async (mode: Mode) => {
    setOpening(mode);
    // Open the tab straight away (browsers block tabs opened after waiting for the server),
    // so these settings and the test details stay visible here
    const tab = window.open("", "_blank");
    if (tab) {
      tab.document.title = "Opening Stripe…";
      tab.document.body.textContent = "Opening Stripe…";
    }
    try {
      const res = await fetch("/api/connect/onboard", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Please try again.");
      if (tab && !tab.closed) {
        tab.opener = null;
        tab.location.href = data.url;
        toast({ title: "Stripe opened in a new tab", description: "Use the details shown here, then come back to this tab when you've finished." });
        setOpening(null);
      } else {
        // Pop-ups blocked: carry on in this tab
        window.location.href = data.url;
      }
    } catch (e) {
      tab?.close();
      toast({ title: "Couldn't open Stripe", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
      setOpening(null);
    }
  };

  const row = (mode: Mode) => {
    const st = status.modes[mode];
    if (!st.available) {
      // Test is only offered while BTM has a test key; live always shows so it's clear why it's missing
      if (mode === "test") return null;
      return (
        <div className="space-y-1 border-t first:border-t-0 pt-2 first:pt-0" data-testid="row-stripe-live-unavailable">
          <p className="text-sm font-medium">Live card payments (real money)</p>
          <p className="text-xs text-muted-foreground">
            {user?.isSystemAdmin
              ? "Not available yet: add your live Stripe key in Render as STRIPE_LIVE_SECRET_KEY (after activating your Stripe account for real payments). The set-up button appears here once it's added."
              : "Not available yet. Live card payments will appear here once PTM switches them on."}
          </p>
        </div>
      );
    }
    const label = mode === "live" ? "Live card payments (real money)" : "Test card payments (no real money)";
    return (
      <div className="space-y-2 border-t first:border-t-0 pt-2 first:pt-0" data-testid={`row-stripe-${mode}`}>
        <p className="text-sm font-medium">{label}</p>
        {st.ready ? (
          <p className="text-sm flex items-center gap-1.5 text-green-700 dark:text-green-500" data-testid={`text-stripe-connected-${mode}`}>
            <CheckCircle2 className="h-4 w-4" /> Connected. Used by your tournaments set to {mode === "live" ? "Live" : "Test"}.
          </p>
        ) : (
          <>
            {mode === "test" && <StripeTestNotice kind="onboarding" />}
            <Button type="button" size="sm" variant={mode === "live" ? "default" : "outline"} onClick={() => open(mode)} disabled={opening !== null} data-testid={`button-connect-stripe-${mode}`}>
              {opening === mode && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {st.connected ? `Finish ${mode} Stripe sign-up` : `Set up ${mode} card payments`}
            </Button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-md border p-3 space-y-3" data-testid="block-stripe-connect">
      <div className="space-y-1">
        <p className="text-sm font-medium flex items-center gap-1.5">
          <CreditCard className="h-4 w-4" /> Card payments with Stripe
        </p>
        <p className="text-xs text-muted-foreground">
          Let captains pay the registration fee by card. Fees go straight into your own Stripe account (Stripe charges a small fee per payment; PTM takes nothing). Each tournament chooses Live or Test in its settings.
        </p>
      </div>
      {row("live")}
      {row("test")}
      {(!status.modes.live.ready || !status.modes.test.ready) && <StripeSignupGuide />}
      {(status.modes.live.ready || status.modes.test.ready) && (
        <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline">
          Payments and payouts are in your Stripe Dashboard <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

/** Profile Settings: how captains pay registration fees for this organiser's tournaments (card, via Stripe) */
export function PaymentDetailsSection() {
  return (
    <div className="space-y-3 py-2 border-b pb-4" data-testid="section-registration-fee-payments">
      <div>
        <p className="text-sm font-medium">Registration fee payments</p>
        <p className="text-xs text-muted-foreground">
          How captains pay the registration fee for your tournaments: by card, straight into your Stripe account.
        </p>
      </div>
      <StripeConnectBlock />
    </div>
  );
}
