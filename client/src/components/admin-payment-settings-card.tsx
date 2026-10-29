import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { errorMessage } from "@/lib/backup";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CreditCard } from "lucide-react";

type PaymentSettings = {
  billingMode: "test" | "live";
  billingModeChosen: "test" | "live" | null;
  testAvailable: boolean;
  liveAvailable: boolean;
};

const KEY = ["/api/admin/payment-settings"];

/** System admin: whether new Unlimited plan upgrades are paid in Stripe test or live mode */
export function AdminPaymentSettingsCard() {
  const { toast } = useToast();
  const { data } = useQuery<PaymentSettings>({ queryKey: KEY, staleTime: 0 });

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

  if (!data || (!data.testAvailable && !data.liveAvailable)) return null;

  return (
    <Card data-testid="card-payment-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> Payments
        </CardTitle>
        <CardDescription>
          Choose whether new upgrades to the Unlimited plan are paid with real money (Live) or Stripe's test card (Test).
          People already subscribed stay on the mode they paid in. Captain card payments are chosen on each tournament instead.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
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
        {!data.liveAvailable && (
          <p className="text-xs text-muted-foreground">
            Live isn't available yet: add your live Stripe key in Render as STRIPE_LIVE_SECRET_KEY.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
