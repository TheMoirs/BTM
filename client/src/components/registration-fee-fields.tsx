import { useEffect, useState } from "react";
import type { Control } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FEE_CURRENCIES, parseFeeInput } from "@shared/payments";
import type { InsertTournament } from "@shared/schema";

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
        Per team. Shown on the registration page with your bank details (set them in Profile Settings). Leave blank for no fee.
      </p>
    </div>
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
