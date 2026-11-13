// The free plan and the Unlimited admin plan. Shared by the server (limits)
// and the pages (messages and the plan page).
//
// What's on sale is chosen by the system admin (Users page → Payments): Free,
// Monthly, Annual and One-off can each be switched on or off, and the paid
// options' £/€/$ amounts set there. A one-off payment gives Unlimited with no
// end date.

export const FREE_LIMITS = {
  tournaments: 1,
  teamsPerTournament: 20,
} as const;

/** Billing period of a subscription */
export type PlanInterval = "month" | "year";
/** The ways to pay for Unlimited: a monthly or yearly subscription, or one payment */
export type PaidOption = PlanInterval | "once";
export type PlanCurrency = "gbp" | "eur" | "usd";

export const PAID_OPTIONS: PaidOption[] = ["month", "year", "once"];
export const CURRENCIES: PlanCurrency[] = ["gbp", "eur", "usd"];
export const CURRENCY_SYMBOLS: Record<PlanCurrency, string> = { gbp: "£", eur: "€", usd: "$" };

export const PAID_OPTION_LABELS: Record<PaidOption, string> = {
  month: "Monthly",
  year: "Annual",
  once: "One-off",
};

// Stripe prices are found by these lookup keys, so the price IDs never need
// copying into the code. Each price carries £, € and $ amounts. When the admin
// changes an amount, a new Stripe price takes over the key.
export const PRICE_LOOKUP_KEYS: Record<PaidOption, string> = {
  month: "btm_unlimited_monthly",
  year: "btm_unlimited_yearly",
  once: "btm_unlimited_once",
};

/** Amounts in minor units (pence / cents) */
export type PriceAmounts = Record<PlanCurrency, number>;

export type SellingOptions = {
  free: { enabled: boolean };
} & Record<PaidOption, { enabled: boolean; amounts: PriceAmounts }>;

export const DEFAULT_SELLING_OPTIONS: SellingOptions = {
  free: { enabled: true },
  month: { enabled: false, amounts: { gbp: 500, eur: 600, usd: 700 } },
  year: { enabled: false, amounts: { gbp: 5000, eur: 6000, usd: 7000 } },
  once: { enabled: true, amounts: { gbp: 5000, eur: 6000, usd: 7000 } },
};

/** Stripe won't charge less than this (roughly 50p / 50c) */
export const MIN_AMOUNT = 50;

function validAmount(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= MIN_AMOUNT && v <= 100_000_00;
}

/** Saved settings (or anything) made safe: missing or broken parts fall back to the defaults */
export function normaliseSellingOptions(raw: unknown): SellingOptions {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const out: SellingOptions = {
    free: { enabled: typeof r.free?.enabled === "boolean" ? r.free.enabled : DEFAULT_SELLING_OPTIONS.free.enabled },
  } as SellingOptions;
  for (const o of PAID_OPTIONS) {
    const d = DEFAULT_SELLING_OPTIONS[o];
    const amounts = {} as PriceAmounts;
    for (const c of CURRENCIES) amounts[c] = validAmount(r[o]?.amounts?.[c]) ? r[o].amounts[c] : d.amounts[c];
    out[o] = { enabled: typeof r[o]?.enabled === "boolean" ? r[o].enabled : d.enabled, amounts };
  }
  return out;
}

/** Problems with options the admin wants to save; empty = fine */
export function sellingOptionsProblems(raw: unknown): string[] {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const problems: string[] = [];
  if (typeof r.free?.enabled !== "boolean") problems.push("Free needs to be on or off.");
  for (const o of PAID_OPTIONS) {
    if (typeof r[o]?.enabled !== "boolean") problems.push(`${PAID_OPTION_LABELS[o]} needs to be on or off.`);
    for (const c of CURRENCIES) {
      if (!validAmount(r[o]?.amounts?.[c])) {
        problems.push(`${PAID_OPTION_LABELS[o]}: the ${CURRENCY_SYMBOLS[c]} price must be at least ${CURRENCY_SYMBOLS[c]}0.50.`);
      }
    }
  }
  if (!problems.length && !r.free.enabled && !PAID_OPTIONS.some((o) => r[o].enabled)) {
    problems.push("At least one option must stay on.");
  }
  return problems;
}

/** The paid options currently on sale, in display order */
export function enabledPaidOptions(s: SellingOptions): PaidOption[] {
  return PAID_OPTIONS.filter((o) => s[o].enabled);
}

/** £50, or £4.50 when there are pence */
export function formatAmount(minor: number, currency: PlanCurrency): string {
  const whole = minor % 100 === 0;
  return `${CURRENCY_SYMBOLS[currency]}${whole ? minor / 100 : (minor / 100).toFixed(2)}`;
}

// Stripe statuses that still count as paid up. past_due keeps access while
// Stripe retries a failed card payment.
const UNLIMITED_STATUSES = new Set(["active", "trialing", "past_due"]);

export function statusGivesUnlimited(status: string | null | undefined): boolean {
  return !!status && UNLIMITED_STATUSES.has(status);
}

/** Unlimited given free by the system admin, still in date (no end date = always) */
export function compGivesUnlimited(
  u: { compUnlimited?: boolean | null; compUntil?: Date | string | null },
  now: Date = new Date(),
): boolean {
  if (!u.compUnlimited) return false;
  return !u.compUntil || new Date(u.compUntil).getTime() > now.getTime();
}

/** Unlimited bought with a one-off payment (no end date) */
export function oneOffGivesUnlimited(u: { oneOffPaidAt?: Date | string | null }): boolean {
  return !!u.oneOffPaidAt;
}

/** What the plan page and limit checks need to know about a user's plan */
export type BillingStatus = {
  billingEnabled: boolean;
  // Stripe sandbox: show test card details
  testMode: boolean;
  unlimited: boolean;
  // "admin" for system admins, who never need to pay
  plan: "free" | "unlimited" | "admin";
  // Unlimited given free by the system admin (not paid through Stripe), and its end date if any
  complimentary: boolean;
  complimentaryUntil: string | null;
  // Unlimited paid for once, with no end date
  oneOff: boolean;
  oneOffPaidAt: string | null;
  // The Free plan has been switched off: free accounts can't use the app until they pay
  locked: boolean;
  status: string | null;
  interval: PlanInterval | null;
  currency: PlanCurrency | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  canManage: boolean;
  limits: typeof FREE_LIMITS;
  usage: { tournaments: number };
  // What's on sale now
  selling: SellingOptions;
};

/** Error code the server sends when a free-plan limit is reached */
export const PLAN_LIMIT_CODE = "plan_limit";
