// The free plan and the Unlimited admin plan. Shared by the server (limits)
// and the pages (messages and the plan page).

export const FREE_LIMITS = {
  tournaments: 1,
  teamsPerTournament: 10,
} as const;

export type PlanInterval = "month" | "year";
export type PlanCurrency = "gbp" | "eur" | "usd";

// Stripe prices are found by these lookup keys, so the price IDs never need
// copying into the code. Each price carries £, € and $ amounts.
export const PRICE_LOOKUP_KEYS: Record<PlanInterval, string> = {
  month: "btm_unlimited_monthly",
  year: "btm_unlimited_yearly",
};

// Shown on the plan page. Stripe holds the real amounts; keep these matching.
export const PLAN_PRICES: Record<PlanCurrency, Record<PlanInterval, string>> = {
  gbp: { month: "£5", year: "£50" },
  eur: { month: "€6", year: "€60" },
  usd: { month: "$7", year: "$70" },
};

// Stripe statuses that still count as paid up. past_due keeps access while
// Stripe retries a failed card payment.
const UNLIMITED_STATUSES = new Set(["active", "trialing", "past_due"]);

export function statusGivesUnlimited(status: string | null | undefined): boolean {
  return !!status && UNLIMITED_STATUSES.has(status);
}

/** What the plan page and limit checks need to know about a user's plan */
export type BillingStatus = {
  billingEnabled: boolean;
  unlimited: boolean;
  // "admin" for system admins, who never need to pay
  plan: "free" | "unlimited" | "admin";
  status: string | null;
  interval: PlanInterval | null;
  currency: PlanCurrency | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  canManage: boolean;
  limits: typeof FREE_LIMITS;
  usage: { tournaments: number };
};

/** Error code the server sends when a free-plan limit is reached */
export const PLAN_LIMIT_CODE = "plan_limit";
