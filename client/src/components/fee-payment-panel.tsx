import { useState } from "react";
import { Check, Copy, CreditCard, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";

export type FeePayment = {
  amount: string;
  minor: number;
  currency: string;
  reference: string;
  cardPayUrl?: string | null;
  bank: { accountName: string | null; sortCode: string | null; accountNumber: string | null; iban: string | null } | null;
};

function CopyRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available: the value is on screen to type */
    }
  };
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-t first:border-t-0">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold tabular-nums break-all" data-testid={testId}>{value}</p>
      </div>
      <Button type="button" variant="ghost" size="sm" className="h-8 px-2 flex-shrink-0" onClick={copy} aria-label={`Copy ${label}`}>
        {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
        <span className="ml-1 text-xs">{copied ? "Copied" : "Copy"}</span>
      </Button>
    </div>
  );
}

/** Registration fee: Pay by card (Stripe) and/or bank transfer details with copy buttons */
export function FeePaymentPanel({ fee }: { fee: FeePayment }) {
  const b = fee.bank;
  return (
    <div className="rounded-lg border bg-muted/40 p-4 space-y-3" data-testid="panel-fee-payment">
      <div>
        <p className="text-sm text-muted-foreground">Registration fee</p>
        <p className="text-2xl font-bold" data-testid="text-fee-amount">{fee.amount}</p>
      </div>

      {fee.cardPayUrl && (
        <Button asChild className="w-full" size="lg" data-testid="button-pay-by-card">
          <a href={fee.cardPayUrl}>
            <CreditCard className="h-4 w-4 mr-2" />
            Pay {fee.amount} by card
          </a>
        </Button>
      )}

      {b && (
        <div className="space-y-1">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Landmark className="h-4 w-4" />
            {fee.cardPayUrl ? "Or pay by bank transfer" : "Pay by bank transfer"}
          </p>
          <div className="rounded-md border bg-background px-3">
            {b.accountName && <CopyRow label="Account name" value={b.accountName} testId="text-pay-account-name" />}
            {b.sortCode && <CopyRow label="Sort code" value={b.sortCode} testId="text-pay-sort-code" />}
            {b.accountNumber && <CopyRow label="Account number" value={b.accountNumber} testId="text-pay-account-number" />}
            {b.iban && <CopyRow label="IBAN" value={b.iban} testId="text-pay-iban" />}
            <CopyRow label="Reference" value={fee.reference} testId="text-pay-reference" />
            <CopyRow label="Amount" value={fee.amount} testId="text-pay-amount" />
          </div>
          <p className="text-xs text-muted-foreground">Please use the reference so the organiser can match your payment to your team.</p>
        </div>
      )}

      {!b && !fee.cardPayUrl && (
        <p className="text-sm">The organiser will let you know how to pay.</p>
      )}
    </div>
  );
}
