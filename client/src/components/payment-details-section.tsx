import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { payeeDetailsProblem } from "@shared/payments";
import { CheckCircle2, CreditCard, ExternalLink, Loader2 } from "lucide-react";
import { StripeTestNotice } from "@/components/stripe-test-notice";

type ConnectStatus = { available: boolean; testMode?: boolean; connected: boolean; ready: boolean; detailsSubmitted: boolean };

/** Card payments: the organiser connects their own Stripe account, and captains' fees go straight to it */
function StripeConnectBlock() {
  const { toast } = useToast();
  const [status, setStatus] = useState<ConnectStatus | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    fetch("/api/connect/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  if (!status?.available) return null;

  const open = async () => {
    setOpening(true);
    try {
      const res = await fetch("/api/connect/onboard", { method: "POST", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "Please try again.");
      window.location.href = data.url;
    } catch (e) {
      toast({ title: "Couldn't open Stripe", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
      setOpening(false);
    }
  };

  return (
    <div className="rounded-md border p-3 space-y-2" data-testid="block-stripe-connect">
      <p className="text-sm font-medium flex items-center gap-1.5">
        <CreditCard className="h-4 w-4" /> Card payments with Stripe
      </p>
      {status.ready ? (
        <>
          <p className="text-sm flex items-center gap-1.5 text-green-700 dark:text-green-500" data-testid="text-stripe-connected">
            <CheckCircle2 className="h-4 w-4" /> Connected. Captains can pay the fee by card, and teams are ticked as paid automatically.
          </p>
          <a href="https://dashboard.stripe.com" target="_blank" rel="noopener noreferrer" className="text-xs text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline">
            Payments and payouts are in your Stripe Dashboard <ExternalLink className="h-3 w-3" />
          </a>
        </>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {status.connected
              ? "Your Stripe account isn't ready to take payments yet. Finish Stripe's sign-up to turn on card payments."
              : "Let captains pay the registration fee by card. Fees go straight into your own Stripe account (Stripe charges a small fee per payment; PTM takes nothing). Sign-up takes about 5 minutes."}
          </p>
          {status.testMode && <StripeTestNotice kind="onboarding" />}
          <Button type="button" size="sm" onClick={open} disabled={opening} data-testid="button-connect-stripe">
            {opening && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {status.connected ? "Finish Stripe sign-up" : "Set up card payments"}
          </Button>
        </>
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
