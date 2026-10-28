import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errorMessage } from "@/lib/backup";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ArrowLeft, Check, CreditCard, Loader2, Sparkles } from "lucide-react";
import { PLAN_PRICES, type BillingStatus, type PlanCurrency, type PlanInterval } from "@shared/plans";

const STATUS_KEY = ["/api/billing/status"];

/** Best guess at the visitor's currency from their browser language */
function guessCurrency(): PlanCurrency {
  const lang = (typeof navigator !== "undefined" && navigator.language) || "en-GB";
  if (/^en-(US|CA)/i.test(lang)) return "usd";
  if (/^en/i.test(lang)) return "gbp";
  if (/^(fr|de|es|it|nl|pt|fi|el|sk|sl|et|lv|lt|mt|ga)/i.test(lang)) return "eur";
  return "gbp";
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Plan & billing page. With `signup`, it is the "Choose your plan" step a new
 * account sees before using the app: Free goes straight in, Unlimited goes to
 * Stripe Checkout.
 */
export default function PlanPage({ signup = false }: { signup?: boolean }) {
  const [, navigate] = useLocation();
  const { refreshUser } = useAuth();
  const { toast } = useToast();
  const [interval, setBillingInterval] = useState<PlanInterval>("year");
  const [currency, setCurrency] = useState<PlanCurrency>(guessCurrency);
  const synced = useRef(false);

  const { data: status, isLoading } = useQuery<BillingStatus>({ queryKey: STATUS_KEY });

  // Back from Stripe Checkout: check with Stripe straight away, in case the
  // webhook hasn't arrived yet
  const checkout = new URLSearchParams(window.location.search).get("checkout");
  useEffect(() => {
    if (checkout !== "success" || synced.current) return;
    synced.current = true;
    // Stripe normally confirms within a second or two; try a few times
    const trySync = async (attempt: number): Promise<void> => {
      const s: BillingStatus = await (await apiRequest("POST", "/api/billing/sync")).json();
      queryClient.setQueryData(STATUS_KEY, s);
      if (!s.unlimited && attempt < 5) {
        await new Promise((r) => setTimeout(r, 2000));
        return trySync(attempt + 1);
      }
      toast({
        title: s.unlimited ? "Welcome to Unlimited" : "Payment received",
        description: s.unlimited
          ? "Thanks! You can now run as many tournaments and teams as you like."
          : "We're still confirming it with Stripe. Please refresh this page in a minute.",
      });
      window.history.replaceState(null, "", window.location.pathname);
      // A new account that has now paid moves on into the app
      if (s.unlimited) await refreshUser();
    };
    trySync(1).catch(() => {});
  }, [checkout, toast, refreshUser]);

  const upgrade = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/checkout", { interval, currency, signup });
      return (await res.json()) as { url: string };
    },
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (error) => toast({ title: "Couldn't start the payment", description: errorMessage(error, "Please try again."), variant: "destructive" }),
  });

  const chooseFree = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/billing/choose-free");
      await refreshUser();
    },
    onSuccess: () => navigate("/"),
    onError: (error) => toast({ title: "Something went wrong", description: errorMessage(error, "Please try again."), variant: "destructive" }),
  });

  const manage = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/billing/portal");
      return (await res.json()) as { url: string };
    },
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (error) => toast({ title: "Couldn't open subscription settings", description: errorMessage(error, "Please try again."), variant: "destructive" }),
  });

  if (isLoading || !status) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const prices = PLAN_PRICES[currency];
  const yearlySaving = currency === "gbp" ? "£10" : currency === "eur" ? "€12" : "$14";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {signup ? (
        <div className="text-center space-y-2 pt-4">
          <img src="/ptm-logo.png?v=4" alt="PTM Logo" className="h-20 w-20 rounded-xl object-cover mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">Choose your plan</h1>
          <p className="text-muted-foreground">Start free, or go Unlimited. You can change your mind later.</p>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back-home" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Your plan</h1>
        </div>
      )}

      {status.plan === "admin" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Unlimited <Badge variant="secondary">System admin</Badge>
            </CardTitle>
            <CardDescription>As the system admin you have unlimited tournaments and teams at no charge.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {status.plan === "unlimited" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Unlimited
              {status.status === "past_due" && <Badge variant="destructive">Payment problem</Badge>}
            </CardTitle>
            <CardDescription>
              {status.interval === "year" ? "Billed yearly" : "Billed monthly"}
              {status.renewsAt &&
                (status.cancelAtPeriodEnd
                  ? `. Ends on ${formatDate(status.renewsAt)}. You keep Unlimited until then.`
                  : `. Renews on ${formatDate(status.renewsAt)}.`)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {status.status === "past_due" && (
              <p className="text-sm text-destructive">
                Your last payment didn't go through. Please update your card so you don't lose Unlimited.
              </p>
            )}
            <Button onClick={() => manage.mutate()} disabled={manage.isPending} data-testid="button-manage-plan">
              {manage.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CreditCard className="h-4 w-4 mr-2" />}
              Manage subscription
            </Button>
            <p className="text-xs text-muted-foreground">Switch between monthly and yearly, change your card, see invoices or cancel.</p>
          </CardContent>
        </Card>
      )}

      {status.plan === "free" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Free {!signup && <Badge variant="secondary">Current plan</Badge>}
              </CardTitle>
              <CardDescription>
                {signup
                  ? "Everything you need to run one tournament. No card needed."
                  : `You're using ${status.usage.tournaments} of ${status.limits.tournaments} tournament.`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />{status.limits.tournaments} tournament</li>
                <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />Up to {status.limits.teamsPerTournament} teams</li>
                <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />No time limit and no adverts</li>
              </ul>
              {signup && (
                <Button
                  variant="outline"
                  size="lg"
                  className="mt-4"
                  onClick={() => chooseFree.mutate()}
                  disabled={chooseFree.isPending || upgrade.isPending}
                  data-testid="button-choose-free"
                >
                  {chooseFree.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Start with Free
                </Button>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Unlimited
              </CardTitle>
              <CardDescription>Run as many tournaments, with as many teams, as you like.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <ToggleGroup type="single" value={interval} onValueChange={(v) => v && setBillingInterval(v as PlanInterval)} variant="outline" aria-label="Billing period">
                  <ToggleGroupItem value="month" data-testid="toggle-monthly">Monthly</ToggleGroupItem>
                  <ToggleGroupItem value="year" data-testid="toggle-yearly">Yearly</ToggleGroupItem>
                </ToggleGroup>
                <ToggleGroup type="single" value={currency} onValueChange={(v) => v && setCurrency(v as PlanCurrency)} variant="outline" aria-label="Currency">
                  <ToggleGroupItem value="gbp" data-testid="toggle-gbp">£</ToggleGroupItem>
                  <ToggleGroupItem value="eur" data-testid="toggle-eur">€</ToggleGroupItem>
                  <ToggleGroupItem value="usd" data-testid="toggle-usd">$</ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div>
                <span className="text-3xl font-bold">{prices[interval]}</span>
                <span className="text-muted-foreground"> / {interval === "year" ? "year" : "month"}</span>
                {interval === "year" && <p className="text-sm text-muted-foreground">Saves {yearlySaving} compared with paying monthly.</p>}
              </div>

              {status.billingEnabled ? (
                <Button size="lg" onClick={() => upgrade.mutate()} disabled={upgrade.isPending} data-testid="button-upgrade">
                  {upgrade.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {signup ? "Choose Unlimited" : "Upgrade to Unlimited"}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">Upgrades aren't available just yet. Please check back soon.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Secure payment by Stripe. Cancel any time; you keep Unlimited until the end of the period you've paid for.
              </p>
            </CardContent>
          </Card>

          {status.canManage && !signup && (
            <Button variant="ghost" className="px-0 underline-offset-4 hover:underline" onClick={() => manage.mutate()} data-testid="button-past-invoices">
              See past invoices
            </Button>
          )}
        </>
      )}

      {checkout === "cancelled" && status.plan === "free" && (
        <p className="text-sm text-muted-foreground">
          {signup ? "No payment was taken. Choose a plan to carry on." : "No payment was taken. You can upgrade whenever you're ready."}
        </p>
      )}
    </div>
  );
}
