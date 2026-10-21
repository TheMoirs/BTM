import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { describePaymentLink, payeeDetailsProblem } from "@shared/payments";

type Details = { accountName: string; sortCode: string; accountNumber: string; iban: string; paymentLink: string };
const empty: Details = { accountName: "", sortCode: "", accountNumber: "", iban: "", paymentLink: "" };

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
  const link = d.paymentLink.trim() ? describePaymentLink(d.paymentLink) : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const blankToNull = (v: string) => (v.trim() ? v.trim() : null);
    const problem = payeeDetailsProblem({
      accountName: blankToNull(d.accountName),
      sortCode: blankToNull(d.sortCode),
      accountNumber: blankToNull(d.accountNumber),
      iban: blankToNull(d.iban),
      paymentLink: blankToNull(d.paymentLink),
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

      <div className="space-y-1">
        <Label htmlFor="pay-link">Pay now link (Monzo.me or PayPal.me)</Label>
        <Input id="pay-link" placeholder="e.g. monzo.me/yourname" value={d.paymentLink} onChange={set("paymentLink")} disabled={loading} data-testid="input-payment-link" />
        <p className="text-xs text-muted-foreground">
          {link?.kind === "monzo"
            ? "Monzo: Pay now opens with the fee and the team's name as the reference."
            : link?.kind === "paypal"
              ? "PayPal: Pay now opens with the fee filled in."
              : link
                ? "Pay now opens this page as it is (the amount isn't filled in)."
                : "Optional. With Monzo.me or PayPal.me the fee is filled in automatically."}
        </p>
      </div>

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
