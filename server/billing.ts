// Unlimited admin plan, paid through Stripe.
//
// Users start on the free plan (no card needed). Upgrading sends them to
// Stripe's hosted Checkout page; Stripe's Customer Portal handles switching
// between monthly and yearly, changing card and cancelling. A webhook keeps
// each user's plan in the database in step with Stripe.
//
// Test or live: the system admin picks which Stripe mode new upgrades use
// (Users page → Payments). Each subscriber remembers the mode they paid in.
// Keys and webhook secrets: see stripeModes.ts.

import type Stripe from "stripe";
import { getStripeFor, isStripeMode, modeAvailable, dashboardUrl, constructEventAnyMode, webhookConfigured, type StripeMode } from "./stripeModes";
import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { getSessionFromRequest, SYSTEM_ADMIN_EMAIL } from "./sessionAuth";
import { sendPlanEmail } from "./planEmail";
import type { User, Tournament } from "@shared/schema";
import {
  FREE_LIMITS,
  PRICE_LOOKUP_KEYS,
  PLAN_LIMIT_CODE,
  statusGivesUnlimited,
  compGivesUnlimited,
  type BillingStatus,
  type PlanCurrency,
  type PlanInterval,
} from "@shared/plans";


export type AdminPayment = {
  id: string;
  created: string;
  amount: number;
  amountRefunded: number;
  currency: string;
  status: string; // succeeded, failed, pending, refunded, partly_refunded
  description: string | null;
  failureMessage: string | null;
  receiptUrl: string | null;
  card: string | null;
};

const BILLING_MODE_SETTING = "billing_mode";

/**
 * The Stripe mode new Unlimited upgrades use. Chosen by the system admin; until
 * then (or if that mode has no key) test is used when available.
 */
export async function getBillingMode(): Promise<StripeMode> {
  const chosen = await storage.getSetting(BILLING_MODE_SETTING);
  if (isStripeMode(chosen) && modeAvailable(chosen)) return chosen;
  return modeAvailable("test") ? "test" : "live";
}

/** The mode this user's Stripe customer and subscription belong to */
function userMode(user: Pick<User, "billingMode">): StripeMode {
  return isStripeMode(user.billingMode) ? user.billingMode : "test";
}

function isAdminUser(u: Pick<User, "email" | "isSystemAdmin">): boolean {
  return u.isSystemAdmin || u.email === SYSTEM_ADMIN_EMAIL;
}

/** System admins and paying users have no limits */
export function hasUnlimited(u: Pick<User, "email" | "isSystemAdmin" | "subscriptionStatus"> & Partial<Pick<User, "compUnlimited" | "compUntil">>): boolean {
  return isAdminUser(u) || statusGivesUnlimited(u.subscriptionStatus) || compGivesUnlimited(u);
}

// ── Limit checks ─────────────────────────────────────────────────────────────

export type LimitProblem = { code: typeof PLAN_LIMIT_CODE; error: string };

/** Can this user own another tournament? null = yes, otherwise the reason. */
export async function tournamentLimitProblem(userId: string | null | undefined, ownerLabel: "you" | "them" = "you"): Promise<LimitProblem | null> {
  if (!userId) return null;
  const user = await storage.getUserById(userId);
  if (!user || hasUnlimited(user)) return null;
  const owned = await storage.getTournamentsByUserId(userId);
  if (owned.length < FREE_LIMITS.tournaments) return null;
  return {
    code: PLAN_LIMIT_CODE,
    error: ownerLabel === "you"
      ? `The free plan includes ${FREE_LIMITS.tournaments} tournament. Upgrade to Unlimited to run more.`
      : `That person is on the free plan and already has a tournament. They need to upgrade to Unlimited before you can transfer this one to them.`,
  };
}

/**
 * Can `adding` more teams join this tournament? Based on the tournament owner's
 * plan, so it applies however the team is added (by the organiser, an admin
 * link, an import, or a captain registering).
 */
export async function teamLimitProblem(tournament: Pick<Tournament, "id" | "userId">, adding = 1, forCaptain = false): Promise<LimitProblem | null> {
  if (!tournament.userId) return null;
  const owner = await storage.getUserById(tournament.userId);
  if (!owner || hasUnlimited(owner)) return null;
  const current = await storage.countTeams(tournament.id);
  if (current + adding <= FREE_LIMITS.teamsPerTournament) return null;
  return {
    code: PLAN_LIMIT_CODE,
    error: forCaptain
      ? "Sorry, this tournament is full and can't take any more teams. Please contact the organiser."
      : `The free plan allows up to ${FREE_LIMITS.teamsPerTournament} teams per tournament. Upgrade to Unlimited to add more.`,
  };
}

/**
 * Can this tournament be transferred to `targetUserId`? A free-plan receiver can't
 * take it if they already have a tournament, or if it has more teams than the
 * free plan allows.
 */
export async function transferLimitProblem(targetUserId: string, tournamentId: string): Promise<LimitProblem | null> {
  const target = await storage.getUserById(targetUserId);
  if (!target || hasUnlimited(target)) return null;
  const teamCount = await storage.countTeams(tournamentId);
  if (teamCount > FREE_LIMITS.teamsPerTournament) {
    return {
      code: PLAN_LIMIT_CODE,
      error: `${target.email} is on the free plan, which allows up to ${FREE_LIMITS.teamsPerTournament} teams per tournament. This tournament has ${teamCount} teams, so they need to upgrade to Unlimited before it can be transferred to them.`,
    };
  }
  return tournamentLimitProblem(targetUserId, "them");
}

// ── Keeping the database in step with Stripe ────────────────────────────────

function periodEndOf(sub: Stripe.Subscription): Date | null {
  // Billing periods live on the subscription items in current API versions
  const ends = sub.items.data.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
  return ends.length ? new Date(Math.max(...ends) * 1000) : null;
}

async function saveSubscription(user: User, sub: Stripe.Subscription, siteUrl: string): Promise<User | undefined> {
  const price = sub.items.data[0]?.price;
  const saved = await storage.updateUserBilling(user.id, {
    stripeSubscriptionId: sub.id,
    subscriptionStatus: sub.status,
    planInterval: price?.recurring?.interval ?? null,
    planCurrency: sub.currency ?? null,
    planRenewsAt: periodEndOf(sub),
    planCancelAtPeriodEnd: !!sub.cancel_at_period_end || !!sub.cancel_at,
  });
  // A new account that chose Unlimited at sign-up: mark the choice and send the welcome email (once)
  if (statusGivesUnlimited(sub.status) && !user.planChosenAt && (await storage.claimPlanChoice(user.id))) {
    await sendPlanEmail(user.email, user.displayName, {
      plan: "unlimited",
      interval: price?.recurring?.interval === "year" ? "year" : "month",
      currency: sub.currency ?? null,
      renewsAt: periodEndOf(sub),
    }, siteUrl);
    return storage.getUserById(user.id);
  }
  return saved;
}

async function userForCustomer(customerId: string, fallbackUserId: string | null | undefined, mode: StripeMode): Promise<User | undefined> {
  const byCustomer = await storage.getUserByStripeCustomerId(customerId);
  if (byCustomer) return byCustomer;
  if (!fallbackUserId) return undefined;
  const byId = await storage.getUserById(fallbackUserId);
  if (byId && !byId.stripeCustomerId) {
    return storage.updateUserBilling(byId.id, { stripeCustomerId: customerId, billingMode: mode });
  }
  return undefined;
}

/**
 * A user may (rarely) end up with more than one subscription, e.g. after
 * cancelling and re-subscribing. Use the one that gives access, newest first.
 */
async function syncFromStripe(user: User, siteUrl: string): Promise<User | undefined> {
  if (!user.stripeCustomerId) return user;
  const stripe = getStripeFor(userMode(user));
  if (!stripe) return user;
  const subs = await stripe.subscriptions.list({ customer: user.stripeCustomerId, status: "all", limit: 10 });
  const sorted = [...subs.data].sort((a, b) => b.created - a.created);
  const best = sorted.find((s) => statusGivesUnlimited(s.status)) ?? sorted[0];
  if (!best) {
    return storage.updateUserBilling(user.id, { subscriptionStatus: null, stripeSubscriptionId: null, planRenewsAt: null, planCancelAtPeriodEnd: false });
  }
  return saveSubscription(user, best, siteUrl);
}

async function getOrCreateCustomer(stripe: Stripe, user: User, mode: StripeMode): Promise<string> {
  // A customer only exists in the mode it was made in: switching mode needs a new one
  if (user.stripeCustomerId && userMode(user) === mode) return user.stripeCustomerId;
  const customer = await stripe.customers.create(
    {
      email: user.email,
      name: user.displayName || undefined,
      metadata: { btm_user_id: user.id },
    },
    // Stops a double click creating two customers for one user
    { idempotencyKey: `btm-customer-${mode}-${user.id}` },
  );
  await storage.updateUserBilling(user.id, {
    stripeCustomerId: customer.id,
    billingMode: mode,
    stripeSubscriptionId: null,
    subscriptionStatus: null,
    planRenewsAt: null,
    planCancelAtPeriodEnd: false,
  });
  return customer.id;
}

async function statusFor(user: User): Promise<BillingStatus> {
  const owned = await storage.getTournamentsByUserId(user.id);
  const admin = isAdminUser(user);
  const paid = statusGivesUnlimited(user.subscriptionStatus);
  const comp = !paid && compGivesUnlimited(user);
  // Paying users see their own subscription's mode; everyone else the mode upgrades use now
  const mode = paid ? userMode(user) : await getBillingMode();
  return {
    billingEnabled: modeAvailable(mode),
    testMode: mode === "test",
    unlimited: admin || paid || comp,
    plan: paid || comp ? "unlimited" : admin ? "admin" : "free",
    complimentary: comp,
    complimentaryUntil: comp && user.compUntil ? user.compUntil.toISOString() : null,
    status: user.subscriptionStatus,
    interval: (user.planInterval as PlanInterval) ?? null,
    currency: (user.planCurrency as PlanCurrency) ?? null,
    renewsAt: user.planRenewsAt ? user.planRenewsAt.toISOString() : null,
    cancelAtPeriodEnd: user.planCancelAtPeriodEnd,
    canManage: !!user.stripeCustomerId && modeAvailable(userMode(user)),
    limits: FREE_LIMITS,
    usage: { tournaments: owned.length },
  };
}

function siteUrl(req: Request): string {
  const configured = (process.env.PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol).split(",")[0].trim();
  return `${proto}://${req.get("host")}`;
}

async function signedInUser(req: Request, res: Response): Promise<User | null> {
  const session = getSessionFromRequest(req);
  const user = session ? await storage.getUserById(session.userId) : undefined;
  if (!user || user.isBlocked) {
    res.status(401).json({ error: "Please sign in first." });
    return null;
  }
  return user;
}

// ── System admin: changing a user's plan ─────────────────────────────────────

function periodStartOf(sub: Stripe.Subscription): Date | null {
  const starts = sub.items.data.map((i) => i.current_period_start).filter((n): n is number => typeof n === "number");
  return starts.length ? new Date(Math.min(...starts) * 1000) : null;
}

export type RefundPreview = {
  amount: number;        // minor units (pence/cents)
  currency: string;
  unusedDays: number;
  chargeId: string;
};

/**
 * Refund for the unused part of the current period: the latest card payment, scaled by the share
 * of the period still to run (never more than what's left unrefunded on that payment).
 */
async function refundPreviewFor(stripe: Stripe, customerId: string, sub: Stripe.Subscription, now = new Date()): Promise<RefundPreview | null> {
  const start = periodStartOf(sub), end = periodEndOf(sub);
  if (!start || !end || end <= now) return null;
  const charges = await stripe.charges.list({ customer: customerId, limit: 10 });
  const charge = charges.data
    .filter((c) => c.status === "succeeded" && !c.refunded && c.amount - c.amount_refunded > 0)
    .sort((a, b) => b.created - a.created)[0];
  if (!charge) return null;
  const share = Math.min(1, (end.getTime() - now.getTime()) / (end.getTime() - start.getTime()));
  const amount = Math.min(charge.amount - charge.amount_refunded, Math.floor(charge.amount * share));
  if (amount <= 0) return null;
  return { amount, currency: charge.currency, unusedDays: Math.floor((end.getTime() - now.getTime()) / 86_400_000), chargeId: charge.id };
}

/** The subscription that currently gives this user Unlimited, from Stripe */
async function liveSubscription(user: User): Promise<{ stripe: Stripe; sub: Stripe.Subscription } | null> {
  if (!user.stripeSubscriptionId || !statusGivesUnlimited(user.subscriptionStatus)) return null;
  const stripe = getStripeFor(userMode(user));
  if (!stripe) return null;
  const sub = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  return statusGivesUnlimited(sub.status) ? { stripe, sub } : null;
}

// ── Routes ───────────────────────────────────────────────────────────────────

export function registerBillingRoutes(app: Express): void {
  // Current plan, limits and usage, for the plan page and the limit messages
  app.get("/api/billing/status", async (req, res) => {
    try {
      const user = await signedInUser(req, res);
      if (!user) return;
      res.json(await statusFor(user));
    } catch (error) {
      console.error("[BILLING] Status failed:", error);
      res.status(500).json({ error: "Couldn't load your plan." });
    }
  });

  // Called when the user comes back from Checkout, in case the webhook is a
  // moment behind (or not set up yet on a dev machine)
  app.post("/api/billing/sync", async (req, res) => {
    try {
      const user = await signedInUser(req, res);
      if (!user) return;
      const updated = await syncFromStripe(user, siteUrl(req));
      res.json(await statusFor(updated ?? user));
    } catch (error) {
      console.error("[BILLING] Sync failed:", error);
      res.status(500).json({ error: "Couldn't check your plan with Stripe." });
    }
  });

  // Is this tournament full on its owner's plan? Lets the Add Team button say so
  // before the form is filled in (saving still checks too).
  app.get("/api/tournaments/:id/team-capacity", async (req, res) => {
    try {
      const t = await storage.getTournament(String(req.params.id));
      if (!t) return res.status(404).json({ error: "Tournament not found" });
      const problem = await teamLimitProblem(t);
      res.json({ full: !!problem, message: problem?.error ?? null });
    } catch (error) {
      console.error("[BILLING] Team capacity check failed:", error);
      res.status(500).json({ error: "Couldn't check the team limit." });
    }
  });

  // "Start with Free" on the choose-your-plan step at sign-up
  app.post("/api/billing/choose-free", async (req, res) => {
    try {
      const user = await signedInUser(req, res);
      if (!user) return;
      if (!user.planChosenAt && (await storage.claimPlanChoice(user.id))) {
        await sendPlanEmail(user.email, user.displayName, { plan: "free" }, siteUrl(req));
      }
      res.json({ ok: true });
    } catch (error) {
      console.error("[BILLING] Choose free failed:", error);
      res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  });

  // System admin: one user's plan and payment history (read live from Stripe)
  app.get("/api/admin/users/:id/billing", async (req, res) => {
    try {
      const me = await signedInUser(req, res);
      if (!me) return;
      if (!isAdminUser(me)) return res.status(403).json({ error: "System admin access required" });
      const user = await storage.getUserById(String(req.params.id));
      if (!user) return res.status(404).json({ error: "User not found" });

      const mode = userMode(user);
      const stripe = getStripeFor(mode);
      let payments: AdminPayment[] = [];
      let stripeError: string | null = null;
      if (stripe && user.stripeCustomerId) {
        try {
          const charges = await stripe.charges.list({ customer: user.stripeCustomerId, limit: 100 });
          payments = charges.data.map((c) => ({
            id: c.id,
            created: new Date(c.created * 1000).toISOString(),
            amount: c.amount,
            amountRefunded: c.amount_refunded,
            currency: c.currency,
            status: c.refunded ? "refunded" : c.amount_refunded > 0 ? "partly_refunded" : c.status,
            description: c.description,
            failureMessage: c.failure_message,
            receiptUrl: c.receipt_url,
            card: c.payment_method_details?.card ? `${c.payment_method_details.card.brand} •••• ${c.payment_method_details.card.last4}` : null,
          }));
        } catch (error) {
          console.error("[BILLING] Couldn't load payments:", error);
          stripeError = "Couldn't load payments from Stripe.";
        }
      }
      let refundPreview: RefundPreview | null = null;
      try {
        const live = await liveSubscription(user);
        if (live && user.stripeCustomerId) refundPreview = await refundPreviewFor(live.stripe, user.stripeCustomerId, live.sub);
      } catch (error) {
        console.error("[BILLING] Couldn't work out a refund:", error);
      }
      res.json({
        status: await statusFor(user),
        refundPreview: refundPreview && { amount: refundPreview.amount, currency: refundPreview.currency, unusedDays: refundPreview.unusedDays },
        customerId: user.stripeCustomerId,
        mode: user.stripeCustomerId ? mode : null,
        stripeCustomerUrl: user.stripeCustomerId ? dashboardUrl(mode, `customers/${user.stripeCustomerId}`) : null,
        payments,
        stripeError,
      });
    } catch (error) {
      console.error("[BILLING] Admin billing failed:", error);
      res.status(500).json({ error: "Couldn't load this user's billing." });
    }
  });

  // System admin: give Unlimited free (optional end date, YYYY-MM-DD) or take it away
  app.post("/api/admin/users/:id/comp", async (req, res) => {
    try {
      const me = await signedInUser(req, res);
      if (!me) return;
      if (!isAdminUser(me)) return res.status(403).json({ error: "System admin access required" });
      const user = await storage.getUserById(String(req.params.id));
      if (!user) return res.status(404).json({ error: "User not found" });

      if (req.body?.action === "remove") {
        await storage.updateUserBilling(user.id, { compUnlimited: false, compUntil: null });
        console.log(`[BILLING] ${me.email} ended free Unlimited for ${user.email}`);
        return res.json({ ok: true });
      }
      if (req.body?.action !== "give") return res.status(400).json({ error: "Unknown action" });
      if (statusGivesUnlimited(user.subscriptionStatus)) {
        return res.status(400).json({ error: "This user already pays for Unlimited. Cancel their subscription first." });
      }
      const untilRaw = typeof req.body?.until === "string" ? req.body.until.trim() : "";
      let until: Date | null = null;
      if (untilRaw) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(untilRaw)) return res.status(400).json({ error: "Please choose a valid end date." });
        until = new Date(`${untilRaw}T23:59:59Z`); // to the end of that day
        if (until.getTime() <= Date.now()) return res.status(400).json({ error: "The end date must be in the future." });
      }
      await storage.updateUserBilling(user.id, { compUnlimited: true, compUntil: until });
      // Counts as having chosen a plan, so they aren't asked at their next sign-in
      if (!user.planChosenAt) await storage.claimPlanChoice(user.id);
      console.log(`[BILLING] ${me.email} gave ${user.email} free Unlimited${until ? ` until ${untilRaw}` : ""}`);
      res.json({ ok: true });
    } catch (error) {
      console.error("[BILLING] Free Unlimited change failed:", error);
      res.status(500).json({ error: "Couldn't change this user's plan." });
    }
  });

  // System admin: change a paying user's Stripe subscription
  //   switch (interval: month | year) · cancel-at-period-end · resume · cancel-now (refund: boolean)
  app.post("/api/admin/users/:id/subscription", async (req, res) => {
    try {
      const me = await signedInUser(req, res);
      if (!me) return;
      if (!isAdminUser(me)) return res.status(403).json({ error: "System admin access required" });
      const user = await storage.getUserById(String(req.params.id));
      if (!user) return res.status(404).json({ error: "User not found" });
      const live = await liveSubscription(user);
      if (!live) return res.status(400).json({ error: "This user has no active subscription to change." });
      const { stripe, sub } = live;
      const action = String(req.body?.action || "");
      let refunded: { amount: number; currency: string } | null = null;

      if (action === "switch") {
        const interval: PlanInterval = req.body?.interval === "year" ? "year" : "month";
        const item = sub.items.data[0];
        if (item?.price?.recurring?.interval === interval) return res.status(400).json({ error: `They're already ${interval === "year" ? "yearly" : "monthly"}.` });
        const prices = await stripe.prices.list({ lookup_keys: [PRICE_LOOKUP_KEYS[interval]], active: true, limit: 1 });
        const price = prices.data[0];
        if (!price || !item) return res.status(503).json({ error: "That plan isn't available right now." });
        await stripe.subscriptions.update(sub.id, {
          items: [{ id: item.id, price: price.id }],
          proration_behavior: "create_prorations",
        });
      } else if (action === "cancel-at-period-end") {
        await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
      } else if (action === "resume") {
        await stripe.subscriptions.update(sub.id, { cancel_at_period_end: false });
      } else if (action === "cancel-now") {
        // Work out the refund before cancelling, while the period is still current
        const preview = req.body?.refund === true && user.stripeCustomerId
          ? await refundPreviewFor(stripe, user.stripeCustomerId, sub)
          : null;
        await stripe.subscriptions.cancel(sub.id);
        if (preview) {
          await stripe.refunds.create(
            { charge: preview.chargeId, amount: preview.amount, reason: "requested_by_customer", metadata: { btm_user_id: user.id } },
            { idempotencyKey: `btm-refund-${sub.id}` },
          );
          refunded = { amount: preview.amount, currency: preview.currency };
        }
      } else {
        return res.status(400).json({ error: "Unknown action" });
      }

      const fresh = await stripe.subscriptions.retrieve(sub.id);
      await saveSubscription(user, fresh, siteUrl(req));
      console.log(`[BILLING] ${me.email} changed ${user.email}'s subscription: ${action}${refunded ? ` (refunded ${refunded.amount} ${refunded.currency})` : ""}`);
      res.json({ ok: true, refunded });
    } catch (error: any) {
      console.error("[BILLING] Subscription change failed:", error);
      res.status(500).json({ error: error?.message ? `Stripe: ${error.message}` : "Couldn't change the subscription." });
    }
  });

  // System admin: which Stripe mode new Unlimited upgrades use, and which keys are set
  app.get("/api/admin/payment-settings", async (req, res) => {
    try {
      const me = await signedInUser(req, res);
      if (!me) return;
      if (!isAdminUser(me)) return res.status(403).json({ error: "System admin access required" });
      const chosen = await storage.getSetting(BILLING_MODE_SETTING);
      res.json({
        billingMode: await getBillingMode(),
        billingModeChosen: isStripeMode(chosen) ? chosen : null,
        testAvailable: modeAvailable("test"),
        liveAvailable: modeAvailable("live"),
      });
    } catch (error) {
      console.error("[BILLING] Payment settings failed:", error);
      res.status(500).json({ error: "Couldn't load payment settings." });
    }
  });

  app.put("/api/admin/payment-settings", async (req, res) => {
    try {
      const me = await signedInUser(req, res);
      if (!me) return;
      if (!isAdminUser(me)) return res.status(403).json({ error: "System admin access required" });
      const mode = req.body?.billingMode;
      if (!isStripeMode(mode)) return res.status(400).json({ error: "Choose test or live." });
      if (!modeAvailable(mode)) {
        return res.status(400).json({ error: `There's no ${mode} Stripe key yet. Add STRIPE_${mode.toUpperCase()}_SECRET_KEY in Render first.` });
      }
      await storage.setSetting(BILLING_MODE_SETTING, mode);
      console.log(`[BILLING] Unlimited plan payments set to ${mode} by ${me.email}`);
      res.json({ billingMode: mode });
    } catch (error) {
      console.error("[BILLING] Saving payment settings failed:", error);
      res.status(500).json({ error: "Couldn't save payment settings." });
    }
  });

  // Start an upgrade: returns the address of Stripe's Checkout page
  app.post("/api/billing/checkout", async (req, res) => {
    try {
      const user = await signedInUser(req, res);
      if (!user) return;
      const mode = await getBillingMode();
      const stripe = getStripeFor(mode);
      if (!stripe) return res.status(503).json({ error: "Payments aren't set up yet." });
      if (isAdminUser(user) || statusGivesUnlimited(user.subscriptionStatus)) {
        return res.status(400).json({ error: "You already have unlimited access." });
      }

      const interval: PlanInterval = req.body?.interval === "year" ? "year" : "month";
      // From the "choose your plan" step at sign-up: going back returns there
      const fromSignup = req.body?.signup === true;
      const currency: PlanCurrency = ["gbp", "eur", "usd"].includes(req.body?.currency) ? req.body.currency : "gbp";

      const prices = await stripe.prices.list({ lookup_keys: [PRICE_LOOKUP_KEYS[interval]], active: true, limit: 1 });
      const price = prices.data[0];
      if (!price) {
        console.error(`[BILLING] No active Stripe price with lookup key ${PRICE_LOOKUP_KEYS[interval]}`);
        return res.status(503).json({ error: "That plan isn't available right now." });
      }

      const customerId = await getOrCreateCustomer(stripe, user, mode);
      const base = siteUrl(req);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        // Card only (Apple Pay and Google Pay come with it where switched on)
        allowed_payment_method_types: ["card"],
        customer: customerId,
        client_reference_id: user.id,
        line_items: [{ price: price.id, quantity: 1 }],
        currency,
        subscription_data: { metadata: { btm_user_id: user.id } },
        metadata: { btm_user_id: user.id },
        success_url: `${base}/plan?checkout=success`,
        cancel_url: `${base}/${fromSignup ? "choose-plan" : "plan"}?checkout=cancelled`,
      });
      res.json({ url: session.url });
    } catch (error) {
      console.error("[BILLING] Checkout failed:", error);
      res.status(500).json({ error: "Couldn't start the payment. Please try again." });
    }
  });

  // Manage or cancel: returns the address of Stripe's Customer Portal
  app.post("/api/billing/portal", async (req, res) => {
    try {
      const user = await signedInUser(req, res);
      if (!user) return;
      const stripe = getStripeFor(userMode(user));
      if (!stripe || !user.stripeCustomerId) return res.status(400).json({ error: "There's no subscription to manage." });
      const portal = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${siteUrl(req)}/plan`,
      });
      res.json({ url: portal.url });
    } catch (error) {
      console.error("[BILLING] Portal failed:", error);
      res.status(500).json({ error: "Couldn't open subscription settings. Please try again." });
    }
  });

  // Stripe tells us about payments and subscription changes here
  app.post("/api/stripe/webhook", async (req: any, res) => {
    if (!webhookConfigured("account")) return res.status(503).send("Webhook not configured");
    // Test and live events both come here; each is signed with its own mode's secret
    const verified = constructEventAnyMode("account", req.rawBody as Buffer, String(req.headers["stripe-signature"] || ""));
    if (!verified) {
      console.warn("[STRIPE] Webhook signature check failed");
      return res.status(400).send("Bad signature");
    }
    const { event, mode } = verified;

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const s = event.data.object;
          if (s.mode === "subscription" && typeof s.customer === "string") {
            const user = await userForCustomer(s.customer, s.client_reference_id, mode);
            if (user) await syncFromStripe(user, siteUrl(req));
          }
          break;
        }
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
        case "customer.subscription.paused":
        case "customer.subscription.resumed": {
          const sub = event.data.object;
          const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
          const user = await userForCustomer(customerId, sub.metadata?.btm_user_id, mode);
          // Re-read from Stripe rather than trusting event order
          if (user) await syncFromStripe(user, siteUrl(req));
          break;
        }
        default:
          break;
      }
      res.json({ received: true });
    } catch (error) {
      console.error(`[STRIPE] Handling ${event.type} failed:`, error);
      // 500 makes Stripe retry later
      res.status(500).send("Handler error");
    }
  });
}
