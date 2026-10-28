import { useQuery } from "@tanstack/react-query";
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
  customerId: string | null;
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
  const s = u.subscriptionStatus;
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
                {st.plan === "admin" ? "System admin (free)" : st.plan === "unlimited" ? `Unlimited, ${st.interval === "year" ? "yearly" : "monthly"}` : "Free"}
              </dd>
              {st.status && (
                <>
                  <dt className="text-muted-foreground">Stripe status</dt>
                  <dd>{st.status.replace(/_/g, " ")}</dd>
                </>
              )}
              {st.renewsAt && st.plan === "unlimited" && (
                <>
                  <dt className="text-muted-foreground">{st.cancelAtPeriodEnd ? "Ends" : "Renews"}</dt>
                  <dd>{day(st.renewsAt)}</dd>
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
