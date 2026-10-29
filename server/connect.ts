// Card payments for team registration fees, through Stripe Connect.
//
// Each organiser connects their OWN Stripe account (Stripe's hosted sign-up).
// Captains then pay by card on Stripe Checkout, and the money goes straight to
// that organiser ("direct charges"): the organiser is the seller, pays Stripe's
// fee, and BTM takes nothing. When the payment goes through, the team is ticked
// as paid automatically.
//
// Test or live is chosen per tournament. Stripe keeps the two apart, so an
// organiser has a separate connected account for each mode they use.
// Keys and webhook secrets: see stripeModes.ts.

import type Stripe from "stripe";
import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { getStripeFor, isStripeMode, modeAvailable, defaultMode, constructEventAnyMode, webhookConfigured, STRIPE_MODES, type StripeMode } from "./stripeModes";
import { getSessionFromRequest, createTeamEditCode, readTeamEditCode } from "./sessionAuth";
import type { User, Tournament } from "@shared/schema";

type ConnectFields = Pick<User, "stripeConnectAccountId" | "stripeConnectReady" | "stripeConnectLiveAccountId" | "stripeConnectLiveReady">;

function siteUrl(req: Request): string {
  const configured = (process.env.PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol).split(",")[0].trim();
  return `${proto}://${req.get("host")}`;
}

/** The mode a tournament's captain payments use: as chosen, else live once a live key is set */
export function tournamentPaymentMode(t: Pick<Tournament, "paymentMode">): StripeMode {
  return isStripeMode(t.paymentMode) ? t.paymentMode : defaultMode();
}

/** The organiser's connected account in one mode */
function accountFor(u: ConnectFields | undefined | null, mode: StripeMode): { id: string | null; ready: boolean } {
  if (!u) return { id: null, ready: false };
  return mode === "live"
    ? { id: u.stripeConnectLiveAccountId, ready: u.stripeConnectLiveReady }
    : { id: u.stripeConnectAccountId, ready: u.stripeConnectReady };
}

function connectUpdate(mode: StripeMode, fields: { id?: string; ready?: boolean }) {
  return mode === "live"
    ? { ...(fields.id !== undefined ? { stripeConnectLiveAccountId: fields.id } : {}), ...(fields.ready !== undefined ? { stripeConnectLiveReady: fields.ready } : {}) }
    : { ...(fields.id !== undefined ? { stripeConnectAccountId: fields.id } : {}), ...(fields.ready !== undefined ? { stripeConnectReady: fields.ready } : {}) };
}

/** The "Pay by card" address for a team, or null if its organiser can't take card payments in this mode */
export function cardPayUrl(owner: ConnectFields | undefined | null, teamId: string, site: string, mode: StripeMode): string | null {
  const acct = accountFor(owner, mode);
  if (!modeAvailable(mode) || !acct.id || !acct.ready) return null;
  return `${site}/api/public/pay/${encodeURIComponent(createTeamEditCode(teamId))}`;
}

/** Re-read the organiser's Stripe account and remember whether it can take card payments */
async function refreshConnectStatus(stripe: Stripe, user: User, mode: StripeMode): Promise<{ ready: boolean; detailsSubmitted: boolean }> {
  const { id, ready: wasReady } = accountFor(user, mode);
  if (!id) return { ready: false, detailsSubmitted: false };
  // Accounts v2: ready once the merchant configuration's card_payments capability is active
  const acct = await stripe.v2.core.accounts.retrieve(id, { include: ["configuration.merchant", "requirements"] });
  const ready = acct.configuration?.merchant?.capabilities?.card_payments?.status === "active";
  if (ready !== wasReady) await storage.updateUserConnect(user.id, connectUpdate(mode, { ready }));
  // Nothing currently due means they've been through Stripe's sign-up
  const detailsSubmitted = ready || !acct.requirements?.entries?.some((e) => e.minimum_deadline?.status === "currently_due");
  return { ready, detailsSubmitted };
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

async function onboardingLink(stripe: Stripe, accountId: string, site: string, mode: StripeMode): Promise<string> {
  const link = await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        refresh_url: `${site}/api/connect/refresh?mode=${mode}`,
        return_url: `${site}/?connect=return&mode=${mode}`,
      },
    },
  });
  return link.url;
}

/** Mark a team paid from a completed Checkout Session on an organiser's account */
async function markPaidFromSession(session: Stripe.Checkout.Session, accountId: string | null, mode: StripeMode): Promise<boolean> {
  const teamId = session.metadata?.btm_team_id;
  if (!teamId || session.payment_status !== "paid") return false;
  const team = await storage.getTeam(teamId);
  if (!team) return false;
  // Only trust a payment made on the account of the organiser who runs this tournament, in its mode
  const t = await storage.getTournament(team.tournamentId);
  const owner = t?.userId ? await storage.getUserById(t.userId) : undefined;
  const acct = accountFor(owner, mode);
  if (!acct.id || (accountId && acct.id !== accountId)) return false;
  if (!team.feePaid) {
    await storage.setTeamFeePaid(team.id, true, "card");
    console.log(`[CONNECT] "${team.name}" paid by card in ${mode} mode (${session.id})`);
  }
  return true;
}

export function registerConnectRoutes(app: Express): void {
  // ── Organiser: connect a Stripe account (one per mode) ─────────────────────
  app.get("/api/connect/status", async (req, res) => {
    try {
      const user = await signedInUser(req, res);
      if (!user) return;
      const modes: Record<string, { available: boolean; connected: boolean; ready: boolean; detailsSubmitted: boolean }> = {};
      for (const mode of STRIPE_MODES) {
        const stripe = getStripeFor(mode);
        const { id } = accountFor(user, mode);
        if (!stripe) modes[mode] = { available: false, connected: false, ready: false, detailsSubmitted: false };
        else if (!id) modes[mode] = { available: true, connected: false, ready: false, detailsSubmitted: false };
        else {
          try {
            modes[mode] = { available: true, connected: true, ...(await refreshConnectStatus(stripe, user, mode)) };
          } catch (error) {
            console.error(`[CONNECT] ${mode} status failed:`, error);
            modes[mode] = { available: true, connected: true, ready: accountFor(user, mode).ready, detailsSubmitted: false };
          }
        }
      }
      res.json({ available: modes.test.available || modes.live.available, modes });
    } catch (error) {
      console.error("[CONNECT] Status failed:", error);
      res.status(500).json({ error: "Couldn't check your Stripe account." });
    }
  });

  // Start (or carry on with) Stripe's sign-up for one mode. Returns the address to send them to.
  app.post("/api/connect/onboard", async (req, res) => {
    try {
      const user = await signedInUser(req, res);
      if (!user) return;
      const mode: StripeMode = isStripeMode(req.body?.mode) ? req.body.mode : defaultMode();
      const stripe = getStripeFor(mode);
      if (!stripe) return res.status(503).json({ error: `${mode === "live" ? "Live" : "Test"} card payments aren't set up yet.` });
      let accountId = accountFor(user, mode).id;
      if (!accountId) {
        // Accounts v2 (Stripe's current API for new platforms): Stripe collects its fees from the
        // organiser and handles losses; the organiser gets the full Stripe Dashboard
        const acct = await stripe.v2.core.accounts.create(
          {
            contact_email: user.email,
            display_name: user.displayName || user.email,
            dashboard: "full",
            identity: { country: "gb" },
            defaults: {
              responsibilities: { fees_collector: "stripe", losses_collector: "stripe" },
              profile: { product_description: "Team registration fees for pétanque tournaments" },
            },
            configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
            include: ["configuration.merchant"],
            metadata: { btm_user_id: user.id },
          } as any,
          { idempotencyKey: `btm-connect-v2-${mode}-${user.id}` },
        );
        accountId = acct.id;
        await storage.updateUserConnect(user.id, connectUpdate(mode, { id: accountId, ready: false }));
      }
      res.json({ url: await onboardingLink(stripe, accountId, siteUrl(req), mode) });
    } catch (error) {
      console.error("[CONNECT] Onboarding failed:", error);
      // Pass on Stripe's own reason (e.g. a platform setting that still needs doing)
      const stripeMessage = (error as any)?.type?.startsWith?.("Stripe") ? String((error as any).message || "") : "";
      res.status(500).json({ error: stripeMessage ? `Stripe said: ${stripeMessage}` : "Couldn't open Stripe's sign-up. Please try again." });
    }
  });

  // Stripe sends people here when an onboarding link has expired: make a fresh one
  app.get("/api/connect/refresh", async (req, res) => {
    const mode: StripeMode = isStripeMode(req.query.mode) ? req.query.mode : "test";
    try {
      const session = getSessionFromRequest(req);
      const user = session ? await storage.getUserById(session.userId) : undefined;
      const stripe = getStripeFor(mode);
      const id = accountFor(user, mode).id;
      if (!id || !stripe) return res.redirect(`/?connect=return&mode=${mode}`);
      res.redirect(await onboardingLink(stripe, id, siteUrl(req), mode));
    } catch (error) {
      console.error("[CONNECT] Refresh failed:", error);
      res.redirect(`/?connect=return&mode=${mode}`);
    }
  });

  // ── Captain: pay the registration fee by card ─────────────────────────────
  // Linked from the registration page and the confirmation email.
  app.get("/api/public/pay/:code", async (req, res) => {
    try {
      const teamId = readTeamEditCode(String(req.params.code));
      const team = teamId ? await storage.getTeam(teamId) : undefined;
      const t = team ? await storage.getTournament(team.tournamentId) : undefined;
      if (!team || !t) return res.status(404).send("This payment link isn't valid any more. Please contact the organiser.");
      const registerPage = `${siteUrl(req)}/register/${encodeURIComponent(t.slug || t.id)}`;
      const code = encodeURIComponent(String(req.params.code));
      if (team.feePaid) return res.redirect(`${registerPage}?paid=${code}`);

      const mode = tournamentPaymentMode(t);
      const owner = t.userId ? await storage.getUserById(t.userId) : undefined;
      const stripe = getStripeFor(mode);
      const acct = accountFor(owner, mode);
      const fee = t.registrationFeeMinor ?? 0;
      if (!stripe || !acct.id || !acct.ready || fee <= 0) {
        return res.redirect(`${registerPage}?pay=unavailable`);
      }

      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          line_items: [{
            quantity: 1,
            price_data: {
              currency: t.registrationFeeCurrency.toLowerCase(),
              unit_amount: fee,
              product_data: { name: `Team registration: ${t.name}`, description: team.name },
            },
          }],
          customer_email: team.captainEmail || undefined,
          client_reference_id: team.id,
          metadata: { btm_team_id: team.id, btm_tournament_id: t.id },
          payment_intent_data: {
            description: `${t.name}: ${team.name}`,
            metadata: { btm_team_id: team.id, btm_tournament_id: t.id },
          },
          success_url: `${registerPage}?paid=${code}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${registerPage}?pay=cancelled&code=${code}`,
        },
        // Direct charge: the payment is made on the organiser's own Stripe account
        { stripeAccount: acct.id },
      );
      res.redirect(303, session.url!);
    } catch (error) {
      console.error("[CONNECT] Starting card payment failed:", error);
      res.status(500).send("Sorry, the card payment couldn't be started. Please try again, or pay by bank transfer.");
    }
  });

  // Back from Checkout: confirm straight away (the webhook may be a moment behind)
  app.get("/api/public/pay/:code/status", async (req, res) => {
    try {
      const teamId = readTeamEditCode(String(req.params.code));
      const team = teamId ? await storage.getTeam(teamId) : undefined;
      if (!team) return res.status(404).json({ error: "Not found" });
      const sessionId = String(req.query.session_id || "");
      if (!team.feePaid && sessionId.startsWith("cs_")) {
        const t = await storage.getTournament(team.tournamentId);
        const owner = t?.userId ? await storage.getUserById(t.userId) : undefined;
        const mode = t ? tournamentPaymentMode(t) : "test";
        const stripe = getStripeFor(mode);
        const acct = accountFor(owner, mode);
        if (stripe && acct.id) {
          const session = await stripe.checkout.sessions.retrieve(sessionId, {}, { stripeAccount: acct.id });
          if (session.metadata?.btm_team_id === team.id) await markPaidFromSession(session, acct.id, mode);
        }
      }
      const fresh = await storage.getTeam(team.id);
      res.json({ teamName: team.name, paid: !!fresh?.feePaid });
    } catch (error) {
      console.error("[CONNECT] Payment status failed:", error);
      res.status(500).json({ error: "Couldn't check the payment." });
    }
  });

  // Events from organisers' Stripe accounts ("Connected accounts" webhook destination),
  // test and live both: each is signed with its own mode's secret
  app.post("/api/stripe/connect-webhook", async (req: any, res) => {
    if (!webhookConfigured("connect")) return res.status(503).send("Webhook not configured");
    const verified = constructEventAnyMode("connect", req.rawBody as Buffer, String(req.headers["stripe-signature"] || ""));
    if (!verified) {
      console.warn("[CONNECT] Webhook signature check failed");
      return res.status(400).send("Bad signature");
    }
    const { event, mode } = verified;
    try {
      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded":
          await markPaidFromSession(event.data.object, event.account ?? null, mode);
          break;
        default:
          break;
      }
      res.json({ received: true });
    } catch (error) {
      console.error(`[CONNECT] Handling ${event.type} failed:`, error);
      res.status(500).send("Handler error");
    }
  });
}
