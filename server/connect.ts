// Card payments for team registration fees, through Stripe Connect.
//
// Each organiser connects their OWN Stripe account (Stripe's hosted sign-up).
// Captains then pay by card on Stripe Checkout, and the money goes straight to
// that organiser ("direct charges"): the organiser is the seller, pays Stripe's
// fee, and BTM takes nothing. When the payment goes through, the team is ticked
// as paid automatically.
//
// Settings (environment variables):
//   STRIPE_SECRET_KEY               the platform key (same as for the Unlimited plan)
//   STRIPE_CONNECT_WEBHOOK_SECRET   whsec_… of the "Connected accounts" webhook destination

import type Stripe from "stripe";
import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import { getStripe, isStripeTestMode } from "./billing";
import { getSessionFromRequest, createTeamEditCode, readTeamEditCode } from "./sessionAuth";
import type { User } from "@shared/schema";

function siteUrl(req: Request): string {
  const configured = (process.env.PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol).split(",")[0].trim();
  return `${proto}://${req.get("host")}`;
}

/** The "Pay by card" address for a team, or null if its organiser can't take card payments */
export function cardPayUrl(owner: Pick<User, "stripeConnectAccountId" | "stripeConnectReady"> | undefined | null, teamId: string, site: string): string | null {
  if (!getStripe() || !owner?.stripeConnectAccountId || !owner.stripeConnectReady) return null;
  return `${site}/api/public/pay/${encodeURIComponent(createTeamEditCode(teamId))}`;
}

/** Re-read the organiser's Stripe account and remember whether it can take card payments */
async function refreshConnectStatus(stripe: Stripe, user: User): Promise<{ ready: boolean; detailsSubmitted: boolean }> {
  if (!user.stripeConnectAccountId) return { ready: false, detailsSubmitted: false };
  // Accounts v2: ready once the merchant configuration's card_payments capability is active
  const acct = await stripe.v2.core.accounts.retrieve(user.stripeConnectAccountId, {
    include: ["configuration.merchant", "requirements"],
  });
  const ready = acct.configuration?.merchant?.capabilities?.card_payments?.status === "active";
  if (ready !== user.stripeConnectReady) await storage.updateUserConnect(user.id, { stripeConnectReady: ready });
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

async function onboardingLink(stripe: Stripe, accountId: string, site: string): Promise<string> {
  const link = await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        refresh_url: `${site}/api/connect/refresh`,
        return_url: `${site}/?connect=return`,
      },
    },
  });
  return link.url;
}

/** Mark a team paid from a completed Checkout Session on an organiser's account */
async function markPaidFromSession(session: Stripe.Checkout.Session, accountId: string | null): Promise<boolean> {
  const teamId = session.metadata?.btm_team_id;
  if (!teamId || session.payment_status !== "paid") return false;
  const team = await storage.getTeam(teamId);
  if (!team) return false;
  // Only trust a payment made on the account of the organiser who runs this tournament
  const t = await storage.getTournament(team.tournamentId);
  const owner = t?.userId ? await storage.getUserById(t.userId) : undefined;
  if (!owner?.stripeConnectAccountId || (accountId && owner.stripeConnectAccountId !== accountId)) return false;
  if (!team.feePaid) {
    await storage.setTeamFeePaid(team.id, true, "card");
    console.log(`[CONNECT] "${team.name}" paid by card (${session.id})`);
  }
  return true;
}

export function registerConnectRoutes(app: Express): void {
  // ── Organiser: connect a Stripe account ───────────────────────────────────
  app.get("/api/connect/status", async (req, res) => {
    try {
      const user = await signedInUser(req, res);
      if (!user) return;
      const stripe = getStripe();
      if (!stripe) return res.json({ available: false, connected: false, ready: false, detailsSubmitted: false });
      const testMode = isStripeTestMode();
      if (!user.stripeConnectAccountId) return res.json({ available: true, testMode, connected: false, ready: false, detailsSubmitted: false });
      const s = await refreshConnectStatus(stripe, user);
      res.json({ available: true, testMode, connected: true, ...s });
    } catch (error) {
      console.error("[CONNECT] Status failed:", error);
      res.status(500).json({ error: "Couldn't check your Stripe account." });
    }
  });

  // Start (or carry on with) Stripe's sign-up. Returns the address to send them to.
  app.post("/api/connect/onboard", async (req, res) => {
    try {
      const user = await signedInUser(req, res);
      if (!user) return;
      const stripe = getStripe();
      if (!stripe) return res.status(503).json({ error: "Card payments aren't set up yet." });
      let accountId = user.stripeConnectAccountId;
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
          { idempotencyKey: `btm-connect-v2-${user.id}` },
        );
        accountId = acct.id;
        await storage.updateUserConnect(user.id, { stripeConnectAccountId: accountId, stripeConnectReady: false });
      }
      res.json({ url: await onboardingLink(stripe, accountId, siteUrl(req)) });
    } catch (error) {
      console.error("[CONNECT] Onboarding failed:", error);
      // Pass on Stripe's own reason (e.g. a platform setting that still needs doing)
      const stripeMessage = (error as any)?.type?.startsWith?.("Stripe") ? String((error as any).message || "") : "";
      res.status(500).json({ error: stripeMessage ? `Stripe said: ${stripeMessage}` : "Couldn't open Stripe's sign-up. Please try again." });
    }
  });

  // Stripe sends people here when an onboarding link has expired: make a fresh one
  app.get("/api/connect/refresh", async (req, res) => {
    try {
      const session = getSessionFromRequest(req);
      const user = session ? await storage.getUserById(session.userId) : undefined;
      const stripe = getStripe();
      if (!user?.stripeConnectAccountId || !stripe) return res.redirect("/?connect=return");
      res.redirect(await onboardingLink(stripe, user.stripeConnectAccountId, siteUrl(req)));
    } catch (error) {
      console.error("[CONNECT] Refresh failed:", error);
      res.redirect("/?connect=return");
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

      const owner = t.userId ? await storage.getUserById(t.userId) : undefined;
      const stripe = getStripe();
      const fee = t.registrationFeeMinor ?? 0;
      if (!stripe || !owner?.stripeConnectAccountId || !owner.stripeConnectReady || fee <= 0) {
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
        { stripeAccount: owner.stripeConnectAccountId },
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
        const stripe = getStripe();
        if (stripe && owner?.stripeConnectAccountId) {
          const session = await stripe.checkout.sessions.retrieve(sessionId, {}, { stripeAccount: owner.stripeConnectAccountId });
          if (session.metadata?.btm_team_id === team.id) await markPaidFromSession(session, owner.stripeConnectAccountId);
        }
      }
      const fresh = await storage.getTeam(team.id);
      res.json({ teamName: team.name, paid: !!fresh?.feePaid });
    } catch (error) {
      console.error("[CONNECT] Payment status failed:", error);
      res.status(500).json({ error: "Couldn't check the payment." });
    }
  });

  // Events from organisers' Stripe accounts ("Connected accounts" webhook destination)
  app.post("/api/stripe/connect-webhook", async (req: any, res) => {
    const stripe = getStripe();
    const secret = (process.env.STRIPE_CONNECT_WEBHOOK_SECRET || "").trim();
    if (!stripe || !secret) return res.status(503).send("Webhook not configured");
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody as Buffer, String(req.headers["stripe-signature"] || ""), secret);
    } catch (error) {
      console.warn("[CONNECT] Webhook signature check failed:", error instanceof Error ? error.message : error);
      return res.status(400).send("Bad signature");
    }
    try {
      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded":
          await markPaidFromSession(event.data.object, event.account ?? null);
          break;
        case "account.updated": {
          const acct = event.data.object;
          const user = await storage.getUserByConnectAccountId(acct.id);
          if (user && user.stripeConnectReady !== !!acct.charges_enabled) {
            await storage.updateUserConnect(user.id, { stripeConnectReady: !!acct.charges_enabled });
          }
          break;
        }
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
