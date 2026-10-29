import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { payeeDetailsProblem } from "@shared/payments";
import { CheckCircle2, CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { StripeTestNotice } from "@/components/stripe-test-notice";

type ModeStatus = { available: boolean; connected: boolean; ready: boolean; detailsSubmitted: boolean };
type ConnectStatus = { available: boolean; modes: { test: ModeStatus; live: ModeStatus } };
type Mode = "test" | "live";

/**
 * Card payments: the organiser connects their own Stripe account, and captains' fees go
 * straight to it. Stripe keeps test and live apart, so each mode is set up separately.
 */
function StripeConnectBlock() {
  const { toast } = useToast();
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
    if (!st.available) return null;
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
      {(status.modes.live.ready || status.modes.test.ready) && (
        <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline">
          Payments and payouts are in your Stripe Dashboard <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
}

type Details = { accountName: string; sortCode: string; accountNumber: string; iban: string };
const empty: Details = { accountName: "", sortCode: "", accountNumber: "", iban: "" };

/** Profile Settings: where teams pay registration fees for this organiser's tournaments */
export function PaymentDetailsSection() {
  const { toast } = useToast();
  const [d, setD] = useState<Details>(empty);
  const [saved, setSaved] = useState<Details>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/payment-details", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : empty))
      .then((data: Details) => {
        if (cancelled) return;
        setD(data);
        setSaved(data);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const set = (k: keyof Details) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setD({ ...d, [k]: e.target.value });
    setError(null);
  };
  const changed = JSON.stringify(d) !== JSON.stringify(saved);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const blankToNull = (v: string) => (v.trim() ? v.trim() : null);
    const problem = payeeDetailsProblem({
      accountName: blankToNull(d.accountName),
      sortCode: blankToNull(d.sortCode),
      accountNumber: blankToNull(d.accountNumber),
      iban: blankToNull(d.iban),
      paymentLink: null,
    });
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/auth/payment-details", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(d),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't save your payment details.");
        return;
      }
      setSaved(d);
      toast({ title: "Payment details saved", description: "Teams will see them when a tournament has a registration fee." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-3 py-2 border-b pb-4" data-testid="form-payment-details">
      <div>
        <p className="text-sm font-medium">Registration fee payments</p>
        <p className="text-xs text-muted-foreground">
          Where teams pay the registration fee for your tournaments. Shown on the registration page and in the confirmation email.
        </p>
      </div>

      <StripeConnectBlock />
      <p className="text-xs font-medium text-muted-foreground pt-1">Bank transfer</p>

      <div className="space-y-1">
        <Label htmlFor="pay-name">Name on the account</Label>
        <Input id="pay-name" placeholder="e.g. A Moir" value={d.accountName} onChange={set("accountName")} disabled={loading} data-testid="input-account-name" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="pay-sort">Sort code</Label>
          <Input id="pay-sort" inputMode="numeric" placeholder="12-34-56" value={d.sortCode} onChange={set("sortCode")} disabled={loading} data-testid="input-sort-code" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="pay-acc">Account number</Label>
          <Input id="pay-acc" inputMode="numeric" placeholder="12345678" value={d.accountNumber} onChange={set("accountNumber")} disabled={loading} data-testid="input-account-number" />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="pay-iban">or IBAN</Label>
        <Input id="pay-iban" placeholder="e.g. GB33 BUKB 2020 1555 5555 55" value={d.iban} onChange={set("iban")} disabled={loading} data-testid="input-iban" />
      </div>

      {error && <p className="text-sm text-destructive" data-testid="text-payment-error">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={loading || saving || !changed} data-testid="button-save-payment-details">
          {saving ? "Saving…" : "Save payment details"}
        </Button>
      </div>
    </form>
  );
}
