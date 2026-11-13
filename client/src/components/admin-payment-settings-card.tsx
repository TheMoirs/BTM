import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errorMessage } from "@/lib/backup";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CreditCard, Loader2 } from "lucide-react";
import {
  CURRENCIES,
  CURRENCY_SYMBOLS,
  FREE_LIMITS,
  PAID_OPTIONS,
  PAID_OPTION_LABELS,
  sellingOptionsProblems,
  type PaidOption,
  type PlanCurrency,
  type SellingOptions,
} from "@shared/plans";

type PaymentSettings = {
  billingMode: "test" | "live";
  billingModeChosen: "test" | "live" | null;
  testAvailable: boolean;
  liveAvailable: boolean;
  selling: SellingOptions;
};

const KEY = ["/api/admin/payment-settings"];

const PER: Record<PaidOption, string> = { month: "a month", year: "a year", once: "once, no end date" };

/** The form keeps prices as typed text (pounds, euros, dollars), turned into pence/cents on save */
type Draft = {
  free: boolean;
  paid: Record<PaidOption, { enabled: boolean; amounts: Record<PlanCurrency, string> }>;
};

function toDraft(s: SellingOptions): Draft {
  const paid = {} as Draft["paid"];
  for (const o of PAID_OPTIONS) {
    const amounts = {} as Record<PlanCurrency, string>;
    for (const c of CURRENCIES) {
      const v = s[o].amounts[c];
      amounts[c] = v % 100 === 0 ? String(v / 100) : (v / 100).toFixed(2);
    }
    paid[o] = { enabled: s[o].enabled, amounts };
  }
  return { free: s.free.enabled, paid };
}

function fromDraft(d: Draft) {
  const out: Record<string, unknown> = { free: { enabled: d.free } };
  for (const o of PAID_OPTIONS) {
    const amounts: Record<string, number> = {};
    for (const c of CURRENCIES) {
      const n = Number(d.paid[o].amounts[c].trim());
      amounts[c] = Number.isFinite(n) ? Math.round(n * 100) : NaN;
    }
    out[o] = { enabled: d.paid[o].enabled, amounts };
  }
  return out;
}

/**
 * System admin: whether new Unlimited plan upgrades are paid in Stripe test or
 * live mode, and what's on sale (Free, Monthly, Annual, One-off) at what price.
 */
export function AdminPaymentSettingsCard() {
  const { toast } = useToast();
  const { data } = useQuery<PaymentSettings>({ queryKey: KEY, staleTime: 0 });
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (data?.selling) setDraft(toDraft(data.selling));
  }, [data?.selling]);

  const save = useMutation({
    mutationFn: async (billingMode: "test" | "live") => (await apiRequest("PUT", "/api/admin/payment-settings", { billingMode })).json(),
    onSuccess: (_d, mode) => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/status"] });
      toast({
        title: mode === "live" ? "Unlimited plan payments are now Live" : "Unlimited plan payments are now Test",
        description: mode === "live" ? "New upgrades take real money." : "New upgrades use Stripe's test card; no real money is taken.",
      });
    },
    onError: (error) => toast({ title: "Couldn't change it", description: errorMessage(error, "Please try again."), variant: "destructive" }),
  });

  const saveSelling = useMutation({
    mutationFn: async (body: unknown) =>
      (await apiRequest("PUT", "/api/admin/selling-options", body)).json() as Promise<{ selling: SellingOptions; warnings: string[] }>,
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: KEY });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/status"] });
      if (d.warnings?.length) {
        toast({ title: "Saved, with a Stripe problem", description: d.warnings.join(" "), variant: "destructive" });
      } else {
        toast({ title: "Selling options saved", description: "The plan page and home page now show these options and prices." });
      }
    },
    onError: (error) => toast({ title: "Couldn't save", description: errorMessage(error, "Please try again."), variant: "destructive" }),
  });

  if (!data || !draft) return null;
  const stripeReady = data.testAvailable || data.liveAvailable;

  const body = fromDraft(draft);
  const problems = sellingOptionsProblems(body);
  const changed = JSON.stringify(body) !== JSON.stringify(fromDraft(toDraft(data.selling)));

  const setPaid = (o: PaidOption, patch: Partial<Draft["paid"][PaidOption]>) =>
    setDraft({ ...draft, paid: { ...draft.paid, [o]: { ...draft.paid[o], ...patch } } });

  return (
    <Card data-testid="card-payment-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> Payments
        </CardTitle>
        <CardDescription>
          Choose what's on sale, and whether new upgrades to the Unlimited plan are paid with real money (Live) or
          Stripe's test card (Test). Captain card payments are chosen on each tournament instead.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {stripeReady && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Unlimited plan payments</span>
              <ToggleGroup
                type="single"
                variant="outline"
                value={data.billingMode}
                onValueChange={(v) => v && v !== data.billingMode && save.mutate(v as "test" | "live")}
                aria-label="Unlimited plan payment mode"
                disabled={save.isPending}
              >
                <ToggleGroupItem value="live" disabled={!data.liveAvailable} data-testid="toggle-billing-live">Live</ToggleGroupItem>
                <ToggleGroupItem value="test" disabled={!data.testAvailable} data-testid="toggle-billing-test">Test</ToggleGroupItem>
              </ToggleGroup>
            </div>
            <p className="text-xs text-muted-foreground">People who've already paid stay on the mode they paid in.</p>
            {!data.liveAvailable && (
              <p className="text-xs text-muted-foreground">
                Live isn't available yet: add your live Stripe key in Render as STRIPE_LIVE_SECRET_KEY.
              </p>
            )}
          </div>
        )}

        <div className="space-y-3">
          <h3 className="text-sm font-semibold">Selling options</h3>

          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div>
              <p className="font-medium">Free</p>
              <p className="text-xs text-muted-foreground">
                {FREE_LIMITS.tournaments} tournament, up to {FREE_LIMITS.teamsPerTournament} teams. Switching this off locks
                existing free accounts until they pay; their tournaments and teams are kept.
              </p>
            </div>
            <Switch checked={draft.free} onCheckedChange={(v) => setDraft({ ...draft, free: v })} aria-label="Free plan on sale" data-testid="switch-free" />
          </div>

          {PAID_OPTIONS.map((o) => (
            <div key={o} className="space-y-3 rounded-md border p-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{PAID_OPTION_LABELS[o]}</p>
                  <p className="text-xs text-muted-foreground">Unlimited, paid {PER[o]}.</p>
                </div>
                <Switch
                  checked={draft.paid[o].enabled}
                  onCheckedChange={(v) => setPaid(o, { enabled: v })}
                  aria-label={`${PAID_OPTION_LABELS[o]} on sale`}
                  data-testid={`switch-${o}`}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {CURRENCIES.map((c) => (
                  <label key={c} className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground w-3">{CURRENCY_SYMBOLS[c]}</span>
                    <Input
                      inputMode="decimal"
                      value={draft.paid[o].amounts[c]}
                      onChange={(e) => setPaid(o, { amounts: { ...draft.paid[o].amounts, [c]: e.target.value } })}
                      className="h-9 min-w-0"
                      aria-label={`${PAID_OPTION_LABELS[o]} price in ${c.toUpperCase()}`}
                      data-testid={`input-price-${o}-${c}`}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}

          {problems.length > 0 && <p className="text-sm text-destructive">{problems.join(" ")}</p>}
          <p className="text-xs text-muted-foreground">
            Changing a price makes a new price in Stripe. Anyone already subscribed stays on the price they signed up at
            until they cancel.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => saveSelling.mutate(body)}
              disabled={!changed || problems.length > 0 || saveSelling.isPending}
              data-testid="button-save-selling"
            >
              {saveSelling.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save selling options
            </Button>
            {changed && (
              <Button variant="outline" onClick={() => setDraft(toDraft(data.selling))} disabled={saveSelling.isPending}>
                Undo changes
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
