import { useEffect, useState } from "react";
import type { Control } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FEE_CURRENCIES, parseFeeInput } from "@shared/payments";
import type { InsertTournament } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";

type ModeInfo = { available: boolean; ready: boolean };
type ConnectStatus = { available: boolean; modes?: { test: ModeInfo; live: ModeInfo } };

/** Which Stripe modes BTM has keys for, and whether this organiser has set up card payments in each */
export function useStripeModes() {
  const { data } = useQuery<ConnectStatus | null>({
    queryKey: ["/api/connect/status"],
    queryFn: async () => {
      const r = await fetch("/api/connect/status", { credentials: "include" });
      return r.ok ? r.json() : null;
    },
    staleTime: 60_000,
  });
  return data?.modes ?? null;
}

/** "Team registration fee": currency (default GBP) and amount, for the tournament settings forms */
export function RegistrationFeeFields({ control, testIdSuffix = "" }: { control: Control<InsertTournament>; testIdSuffix?: string }) {
  return (
    <div className="space-y-2">
      <FormLabel>Team registration fee (Optional)</FormLabel>
      <div className="flex items-start gap-2">
        <FormField
          control={control}
          name="registrationFeeCurrency"
          render={({ field }) => (
            <FormItem className="w-[110px] space-y-0">
              <Select value={field.value || "GBP"} onValueChange={field.onChange}>
                <SelectTrigger aria-label="Currency" data-testid={`select-fee-currency${testIdSuffix}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEE_CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name="registrationFeeMinor"
          render={({ field }) => <FeeAmountInput value={field.value ?? null} onChange={field.onChange} testId={`input-fee-amount${testIdSuffix}`} />}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Per team. Captains pay by card after registering, once you've set up card payments in Profile Settings. Leave blank for no fee.
      </p>
      <PaymentModeField control={control} testIdSuffix={testIdSuffix} />
    </div>
  );
}

/** Captain card payments for this tournament: live (real money) or test (Stripe sandbox) */
function PaymentModeField({ control, testIdSuffix }: { control: Control<InsertTournament>; testIdSuffix: string }) {
  const modes = useStripeModes();
  if (!modes || (!modes.test.available && !modes.live.available)) return null;
  const fallback = modes.live.available ? "live" : "test";
  return (
    <FormField
      control={control}
      name="paymentMode"
      render={({ field }) => {
        const value = (field.value as string | null | undefined) || fallback;
        const ready = value === "live" ? modes.live.ready : modes.test.ready;
        return (
          <FormItem className="space-y-1 pt-2">
            <FormLabel>Captain card payments</FormLabel>
            <Select value={value} onValueChange={field.onChange}>
              <SelectTrigger data-testid={`select-payment-mode${testIdSuffix}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="live" disabled={!modes.live.available}>
                  Live: real money{!modes.live.available ? " (not available yet)" : ""}
                </SelectItem>
                <SelectItem value="test" disabled={!modes.test.available}>
                  Test: no real money (Stripe test card)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {value === "test"
                ? "Captains pay with Stripe's test card and nothing is charged. The registration page shows a TEST banner."
                : "Captains pay real money by card, straight into your Stripe account."}
              {!ready && " Set up " + (value === "live" ? "live" : "test") + " card payments in Profile Settings for the Pay by card button to appear."}
            </p>
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
}

function FeeAmountInput({ value, onChange, testId }: { value: number | null; onChange: (v: number | null) => void; testId: string }) {
  const toText = (minor: number | null) => (minor == null ? "" : (minor / 100).toFixed(2));
  const [text, setText] = useState(toText(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    // Keep in step when the form is reset (e.g. opening another tournament's settings)
    setText((t) => (parseFeeInput(t) === value ? t : toText(value)));
  }, [value]);
  return (
    <FormItem className="flex-1 space-y-1">
      <Input
        inputMode="decimal"
        placeholder="e.g. 10.00"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const minor = parseFeeInput(e.target.value);
          setInvalid(Number.isNaN(minor));
          if (!Number.isNaN(minor)) onChange(minor);
        }}
        onBlur={() => {
          const minor = parseFeeInput(text);
          if (!Number.isNaN(minor)) setText(toText(minor));
        }}
        aria-invalid={invalid}
        data-testid={testId}
      />
      {invalid && <p className="text-xs text-destructive">Enter an amount like 10 or 12.50</p>}
      <FormMessage />
    </FormItem>
  );
}
