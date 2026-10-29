// Stripe test (sandbox) and live mode, side by side.
//
// Stripe keeps test and live completely separate: different keys, customers,
// subscriptions and connected accounts. BTM holds both keys, and picks one:
//   - Unlimited plan: the mode the system admin chooses (Users page → Payments),
//     used for new upgrades; each subscriber remembers the mode they paid in.
//   - Captain card payments: the mode chosen on each tournament.
//
// Settings (environment variables):
//   STRIPE_TEST_SECRET_KEY  sk_test_…   STRIPE_LIVE_SECRET_KEY  sk_live_…
//   STRIPE_SECRET_KEY       older single key; counts as test or live by its prefix
//   STRIPE_WEBHOOK_SECRET_TEST / _LIVE           "Your account" webhook (Unlimited plan)
//   STRIPE_CONNECT_WEBHOOK_SECRET_TEST / _LIVE   "Connected accounts" webhook (captain payments)
//   (STRIPE_WEBHOOK_SECRET and STRIPE_CONNECT_WEBHOOK_SECRET still work too)

import Stripe from "stripe";

export type StripeMode = "test" | "live";
export const STRIPE_MODES: StripeMode[] = ["test", "live"];

export function isStripeMode(v: unknown): v is StripeMode {
  return v === "test" || v === "live";
}

function env(name: string): string {
  return (process.env[name] || "").trim();
}

export function keyFor(mode: StripeMode): string {
  const own = env(mode === "test" ? "STRIPE_TEST_SECRET_KEY" : "STRIPE_LIVE_SECRET_KEY");
  if (own) return own;
  const single = env("STRIPE_SECRET_KEY");
  return single.startsWith(mode === "test" ? "sk_test_" : "sk_live_") ? single : "";
}

export function modeAvailable(mode: StripeMode): boolean {
  return !!keyFor(mode);
}

const clients = new Map<string, Stripe>();

export function getStripeFor(mode: StripeMode): Stripe | null {
  const key = keyFor(mode);
  if (!key) return null;
  let client = clients.get(key);
  if (!client) {
    client = new Stripe(key, { appInfo: { name: "Boules Tournament Manager" } });
    clients.set(key, client);
  }
  return client;
}

/** The mode new tournaments use when none is chosen: live once a live key is set */
export function defaultMode(): StripeMode {
  return modeAvailable("live") ? "live" : "test";
}

/** Dashboard address for a Stripe object, in the right mode */
export function dashboardUrl(mode: StripeMode, path: string): string {
  return `https://dashboard.stripe.com/${mode === "test" ? "test/" : ""}${path.replace(/^\//, "")}`;
}

/**
 * Check a webhook's signature against every signing secret we have for it, so one
 * endpoint can take both test and live events. The event says which mode it's from.
 */
export function constructEventAnyMode(kind: "account" | "connect", rawBody: Buffer, signature: string): { event: Stripe.Event; mode: StripeMode } | null {
  const base = kind === "account" ? "STRIPE_WEBHOOK_SECRET" : "STRIPE_CONNECT_WEBHOOK_SECRET";
  const secrets = [env(`${base}_TEST`), env(`${base}_LIVE`), env(base)].filter(Boolean);
  for (const secret of secrets) {
    try {
      const event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
      return { event, mode: event.livemode ? "live" : "test" };
    } catch {
      /* try the next secret */
    }
  }
  return null;
}

export function webhookConfigured(kind: "account" | "connect"): boolean {
  const base = kind === "account" ? "STRIPE_WEBHOOK_SECRET" : "STRIPE_CONNECT_WEBHOOK_SECRET";
  return !!(env(`${base}_TEST`) || env(`${base}_LIVE`) || env(base));
}
