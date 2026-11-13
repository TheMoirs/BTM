import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExternalLink, Loader2 } from "lucide-react";
import type { BillingStatus } from "@shared/plans";

type Payment = {
  id: string;
  created: string;
  amount: number;
  amountRefunded: number;
  currency: string;
  status: string;
  description: string | null;
  failureMessage: string | null;
  receiptUrl: string | null;
  card: string | null;
};

type UserBilling = {
  status: BillingStatus;
  refundPreview?: { amount: number; currency: string; unusedDays: number } | null;
  customerId: string | null;
  mode?: "test" | "live" | null;
  stripeCustomerUrl: string | null;
  payments: Payment[];
  stripeError: string | null;
};

export type BillingFields = {
  isSystemAdmin: boolean;
  email: string;
  subscriptionStatus: string | null;
  planInterval: string | null;
  planCancelAtPeriodEnd: boolean;
  planChosenAt: string | null;
  compUnlimited?: boolean;
  compUntil?: string | null;
  oneOffPaidAt?: string | null;
};

function money(minor: number, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(minor / 100);
}

function day(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
}

const PAYMENT_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  succeeded: { label: "Paid", variant: "default" },
  pending: { label: "Pending", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
  refunded: { label: "Refunded", variant: "outline" },
  partly_refunded: { label: "Part refunded", variant: "outline" },
};

/** The plan badge shown beside each user on the Users page */
export function PlanBadge({ u }: { u: BillingFields }) {
  if (u.isSystemAdmin) return null;
  if (u.oneOffPaidAt) return <Badge variant="default" className="text-xs shrink-0">Unlimited · one-off</Badge>;
  const s = u.subscriptionStatus;
  const paying = s === "active" || s === "trialing" || s === "past_due";
  if (!paying && u.compUnlimited && (!u.compUntil || new Date(u.compUntil) > new Date())) {
    return (
      <Badge variant="default" className="text-xs shrink-0">
        Unlimited · free{u.compUntil ? ` to ${day(u.compUntil)}` : ""}
      </Badge>
    );
  }
  const per = u.planInterval === "year" ? "yearly" : "monthly";
  if (s === "active" || s === "trialing") {
    return (
      <Badge variant="default" className="text-xs shrink-0">
        Unlimited · {per}{u.planCancelAtPeriodEnd ? " · ending" : ""}
      </Badge>
    );
  }
  if (s === "past_due") return <Badge variant="destructive" className="text-xs shrink-0">Unlimited · payment problem</Badge>;
  if (s === "canceled" || s === "unpaid" || s === "incomplete_expired") {
    return <Badge variant="outline" className="text-xs shrink-0">Free · Unlimited cancelled</Badge>;
  }
  if (!u.planChosenAt) return <Badge variant="outline" className="text-xs shrink-0">No plan chosen yet</Badge>;
  return <Badge variant="secondary" className="text-xs shrink-0">Free</Badge>;
}

/** System admin drill-down: one user's plan and payment history */
export function AdminUserBillingDialog({
  user,
  onClose,
}: {
  user: { id: string; email: string; displayName: string | null } | null;
  onClose: () => void;
}) {
  const { data, isLoading, error } = useQuery<UserBilling>({
    queryKey: ["/api/admin/users", user?.id, "billing"],
    enabled: !!user,
    staleTime: 0,
  });

  const st = data?.status;

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{user?.displayName || user?.email}</DialogTitle>
          <DialogDescription>{user?.displayName ? user.email : "Plan and payments"}</DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && <p className="text-sm text-destructive">Couldn't load this user's billing.</p>}

        {st && data && (
          <div className="space-y-5">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Plan</dt>
              <dd className="font-medium">
                {st.plan === "admin"
                  ? "System admin (free)"
                  : st.complimentary
                    ? `Unlimited, given free${st.complimentaryUntil ? ` until ${day(st.complimentaryUntil)}` : " (no end date)"}`
                    : st.oneOff
                      ? `Unlimited, one-off payment${st.oneOffPaidAt ? ` on ${day(st.oneOffPaidAt)}` : ""} (no end date)`
                      : st.plan === "unlimited"
                        ? `Unlimited, ${st.interval === "year" ? "yearly" : "monthly"}`
                        : st.locked ? "Free (locked: the Free plan is switched off)" : "Free"}
              </dd>
              {st.status && (
                <>
                  <dt className="text-muted-foreground">Stripe status</dt>
                  <dd>{st.status.replace(/_/g, " ")}</dd>
                </>
              )}
              {st.renewsAt && st.plan === "unlimited" && !st.oneOff && (
                <>
                  <dt className="text-muted-foreground">{st.cancelAtPeriodEnd ? "Ends" : "Renews"}</dt>
                  <dd>{day(st.renewsAt)}</dd>
                </>
              )}
              {data.mode && (
                <>
                  <dt className="text-muted-foreground">Stripe mode</dt>
                  <dd>{data.mode === "live" ? "Live (real money)" : "Test (no real money)"}</dd>
                </>
              )}
              {st.currency && (
                <>
                  <dt className="text-muted-foreground">Currency</dt>
                  <dd>{st.currency.toUpperCase()}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Tournaments</dt>
              <dd>{st.usage.tournaments}</dd>
            </dl>

            {user && st.plan !== "admin" && <ChangePlan userId={user.id} billing={data} />}

            {data.stripeCustomerUrl && (
              <a
                href={data.stripeCustomerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline"
              >
                Open in Stripe <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}

            <div className="space-y-2">
              <h3 className="font-semibold">Payments</h3>
              {data.stripeError && <p className="text-sm text-destructive">{data.stripeError}</p>}
              {!data.stripeError && data.payments.length === 0 && (
                <p className="text-sm text-muted-foreground">No payments yet.</p>
              )}
              {data.payments.length > 0 && (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Card</TableHead>
                        <TableHead><span className="sr-only">Receipt</span></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.payments.map((p) => {
                        const label = PAYMENT_LABELS[p.status] ?? { label: p.status, variant: "secondary" as const };
                        return (
                          <TableRow key={p.id} data-testid={`row-payment-${p.id}`}>
                            <TableCell className="whitespace-nowrap">{day(p.created)}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              {money(p.amount, p.currency)}
                              {p.amountRefunded > 0 && p.status === "partly_refunded" && (
                                <div className="text-xs text-muted-foreground">{money(p.amountRefunded, p.currency)} refunded</div>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={label.variant} className="text-xs">{label.label}</Badge>
                              {p.failureMessage && <div className="text-xs text-muted-foreground mt-1">{p.failureMessage}</div>}
                            </TableCell>
                            <TableCell className="whitespace-nowrap capitalize text-muted-foreground">{p.card ?? ""}</TableCell>
                            <TableCell>
                              {p.receiptUrl && (
                                <a href={p.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-primary text-sm underline-offset-4 hover:underline">
                                  Receipt
                                </a>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type PlanAction =
  | { kind: "switch"; interval: "month" | "year" }
  | { kind: "cancel-at-period-end" }
  | { kind: "resume" }
  | { kind: "cancel-now"; refund: boolean };

/** System admin: change a user's plan — free Unlimited, or their paid Stripe subscription */
function ChangePlan({ userId, billing }: { userId: string; billing: UserBilling }) {
  const { toast } = useToast();
  const st = billing.status;
  const paying = st.plan === "unlimited" && !st.complimentary && !st.oneOff && !!st.status && ["active", "trialing", "past_due"].includes(st.status);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const [until, setUntil] = useState(st.complimentaryUntil ? st.complimentaryUntil.slice(0, 10) : "");
  const [confirming, setConfirming] = useState<PlanAction | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId, "billing"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
  };
  const errorText = (e: unknown) => {
    const m = e instanceof Error ? e.message.match(/^\d{3}: ([\s\S]*)$/) : null;
    if (m) { try { return JSON.parse(m[1]).error ?? m[1]; } catch { return m[1]; } }
    return e instanceof Error ? e.message : "Something went wrong";
  };

  const comp = useMutation({
    mutationFn: async (body: { action: "give" | "remove"; until?: string }) =>
      (await apiRequest("POST", `/api/admin/users/${userId}/comp`, body)).json(),
    onSuccess: (_d, body) => {
      refresh();
      toast({ title: body.action === "give" ? "Unlimited given free" : "Back on the Free plan" });
    },
    onError: (e) => toast({ title: "Couldn't change the plan", description: errorText(e), variant: "destructive" }),
  });

  const subscription = useMutation({
    mutationFn: async (a: PlanAction) => {
      const body = a.kind === "switch" ? { action: "switch", interval: a.interval }
        : a.kind === "cancel-now" ? { action: "cancel-now", refund: a.refund }
        : { action: a.kind };
      return (await apiRequest("POST", `/api/admin/users/${userId}/subscription`, body)).json();
    },
    onSuccess: (d: { refunded: { amount: number; currency: string } | null }) => {
      setConfirming(null);
      refresh();
      toast({
        title: "Subscription updated",
        description: d?.refunded ? `${money(d.refunded.amount, d.refunded.currency)} refunded to their card.` : undefined,
      });
    },
    onError: (e) => toast({ title: "Couldn't change the subscription", description: errorText(e), variant: "destructive" }),
  });

  const oneOff = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/admin/users/${userId}/one-off`, { action: "refund-remove" })).json(),
    onSuccess: (d: { refunded: { amount: number; currency: string } | null }) => {
      setConfirmRefund(false);
      refresh();
      toast({
        title: "Back on the Free plan",
        description: d?.refunded ? `${money(d.refunded.amount, d.refunded.currency)} refunded to their card.` : "Their payment had already been refunded.",
      });
    },
    onError: (e) => toast({ title: "Couldn't refund the payment", description: errorText(e), variant: "destructive" }),
  });

  const refund = billing.refundPreview;
  const describe = (a: PlanAction): string => {
    if (a.kind === "switch") {
      return a.interval === "year"
        ? "Switch to yearly. Stripe charges the difference for the rest of this period straight away."
        : "Switch to monthly. Stripe credits the unused yearly time to their account, used against future payments.";
    }
    if (a.kind === "cancel-at-period-end") return `Cancel at the end of the period. They keep Unlimited until ${day(st.renewsAt)} and won't be charged again.`;
    if (a.kind === "resume") return "Undo the cancellation. Their subscription renews as normal.";
    return a.refund && refund
      ? `Cancel now and refund ${money(refund.amount, refund.currency)} (${refund.unusedDays} unused days) to their card. Unlimited ends straight away.`
      : "Cancel now with no refund. Unlimited ends straight away.";
  };

  return (
    <div className="space-y-3 rounded-md border p-3">
      <h3 className="font-semibold">Change plan</h3>

      {st.oneOff ? (
        confirmRefund ? (
          <div className="space-y-3">
            <p className="text-sm">Refund their one-off payment in full and put them back on the Free plan. Unlimited ends straight away.</p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={() => oneOff.mutate()} disabled={oneOff.isPending} data-testid="button-confirm-refund-oneoff">
                {oneOff.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirm
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmRefund(false)} disabled={oneOff.isPending}>Back</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">They paid once for Unlimited, with no end date.</p>
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirmRefund(true)} data-testid="button-refund-oneoff">
              Refund and remove Unlimited
            </Button>
          </div>
        )
      ) : paying ? (
        confirming ? (
          <div className="space-y-3">
            <p className="text-sm">{describe(confirming)}</p>
            <div className="flex gap-2">
              <Button size="sm" variant={confirming.kind === "cancel-now" ? "destructive" : "default"}
                onClick={() => subscription.mutate(confirming)} disabled={subscription.isPending} data-testid="button-confirm-plan-change">
                {subscription.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirm
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirming(null)} disabled={subscription.isPending}>Back</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" data-testid="button-switch-interval"
              onClick={() => setConfirming({ kind: "switch", interval: st.interval === "year" ? "month" : "year" })}>
              Switch to {st.interval === "year" ? "monthly" : "yearly"}
            </Button>
            {st.cancelAtPeriodEnd ? (
              <Button size="sm" variant="outline" onClick={() => setConfirming({ kind: "resume" })} data-testid="button-resume">
                Undo cancellation
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setConfirming({ kind: "cancel-at-period-end" })} data-testid="button-cancel-at-end">
                Cancel at period end
              </Button>
            )}
            <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirming({ kind: "cancel-now", refund: false })} data-testid="button-cancel-now">
              Cancel now
            </Button>
            {refund && (
              <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirming({ kind: "cancel-now", refund: true })} data-testid="button-cancel-refund">
                Cancel now and refund {money(refund.amount, refund.currency)}
              </Button>
            )}
          </div>
        )
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {st.complimentary
              ? "They have Unlimited free. Change the end date, or switch them back to Free."
              : "Give Unlimited free, with no payment. Leave the end date blank for no end."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="h-9 w-40" aria-label="End date (optional)" data-testid="input-comp-until" />
            <Button size="sm" onClick={() => comp.mutate({ action: "give", until })} disabled={comp.isPending} data-testid="button-give-unlimited">
              {comp.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {st.complimentary ? "Save end date" : "Give Unlimited free"}
            </Button>
            {st.complimentary && (
              <Button size="sm" variant="outline" onClick={() => comp.mutate({ action: "remove" })} disabled={comp.isPending} data-testid="button-remove-unlimited">
                Switch back to Free
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
