// Welcome email sent once, when a new organiser chooses their plan at sign-up.
// Free: what the plan includes and an Upgrade button (Plan & billing page, then
// Stripe Checkout), with the prices on sale now. Unlimited: confirms the plan
// (monthly, yearly or one-off), with a link to manage it.

import { getUncachableResendClient } from "./resend";
import { getSellingOptions } from "./selling";
import { emailLogo } from "./emailLogo";
import {
  DEFAULT_SELLING_OPTIONS,
  FREE_LIMITS,
  enabledPaidOptions,
  formatAmount,
  type PaidOption,
  type PlanCurrency,
  type SellingOptions,
} from "@shared/plans";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type PlanEmail =
  | { plan: "free" }
  | { plan: "unlimited"; option: PaidOption; currency: string | null; renewsAt: Date | null };

const PER: Record<PaidOption, string> = { month: " a month", year: " a year", once: " once" };

/** "£5 a month, £50 a year or £50 once", from what's on sale now */
function priceList(selling: SellingOptions): string {
  const parts = enabledPaidOptions(selling).map((o) => `${formatAmount(selling[o].amounts.gbp, "gbp")}${PER[o]}`);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} or ${parts[parts.length - 1]}`;
}

export function planEmailSubject(p: PlanEmail): string {
  return p.plan === "free" ? "Welcome to PTM – you're on the Free plan" : "Welcome to PTM Unlimited";
}

export function planEmailHtml(p: PlanEmail, name: string | null, siteUrl: string, selling: SellingOptions = DEFAULT_SELLING_OPTIONS): string {
  const planUrl = `${siteUrl}/plan`;
  const hello = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  const button = (href: string, label: string) =>
    `<p style="margin:20px 0"><a href="${href}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">${label}</a></p>`;
  const li = (t: string) => `<li style="margin:0 0 4px">${t}</li>`;

  let body: string;
  if (p.plan === "free") {
    const prices = priceList(selling);
    const onlyOnce = enabledPaidOptions(selling).every((o) => o === "once");
    const upgrade = prices
      ? `<p style="margin:16px 0 4px"><strong>Need more?</strong> Unlimited lets you run as many tournaments, with as many teams, as you like, for ${prices} (also available in € and $). Pay securely by card with Stripe${onlyOnce ? "; there's no end date" : " and cancel any time"}.</p>
${button(planUrl, "UPGRADE TO UNLIMITED")}`
      : "";
    body = `
<p>Thanks for signing up to Pétanque Tournament Manager. You're on the <strong>Free plan</strong>, which includes:</p>
<ul style="padding-left:20px;margin:0 0 12px">
${li(`${FREE_LIMITS.tournaments} tournament`)}
${li(`Up to ${FREE_LIMITS.teamsPerTournament} teams`)}
${li("No time limit and no adverts")}
</ul>
${upgrade}`;
  } else {
    const lower = (p.currency || "gbp").toLowerCase();
    const cur: PlanCurrency = lower === "eur" || lower === "usd" ? lower : "gbp";
    const price = formatAmount(selling[p.option].amounts[cur], cur);
    const planName = p.option === "once" ? "Unlimited, one-off payment" : `Unlimited, ${p.option === "year" ? "yearly" : "monthly"}`;
    const priceText = p.option === "once" ? `${price}, paid once (no end date)` : `${price}${PER[p.option]}`;
    const renews = p.renewsAt
      ? p.renewsAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : null;
    body = `
<p>Thanks for signing up to Pétanque Tournament Manager. You're on the <strong>Unlimited plan</strong>: run as many tournaments, with as many teams, as you like.</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 12px">
<tr><td style="padding:0 12px 4px 0;color:#555">Plan</td><td style="padding:0 0 4px"><strong>${planName}</strong></td></tr>
<tr><td style="padding:0 12px 4px 0;color:#555">Price</td><td style="padding:0 0 4px"><strong>${escapeHtml(priceText)}</strong></td></tr>
${renews ? `<tr><td style="padding:0 12px 4px 0;color:#555">Renews</td><td style="padding:0 0 4px"><strong>${renews}</strong></td></tr>` : ""}
</table>
<p>Stripe will email your receipt separately. ${p.option === "once"
  ? "Your Unlimited plan has no end date, so there's nothing to renew. You can see your receipt any time from Plan &amp; billing in the menu."
  : "You can switch between monthly and yearly, change your card or cancel at any time from Plan &amp; billing in the menu."}</p>
${button(planUrl, "MANAGE YOUR PLAN")}`;
  }

  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#14212b;max-width:560px">
${emailLogo(siteUrl)}
<p>${hello}</p>
${body}
<p><a href="${siteUrl}" style="color:#2563eb">Open PTM</a> and create your first tournament to get started.</p>
<p style="color:#888;font-size:13px">Pétanque Tournament Manager · <a href="${siteUrl}" style="color:#888">${siteUrl.replace(/^https?:\/\//, "")}</a></p>
</div>`;
}

/** Sends the welcome email. Never throws: signing up still works if email fails. */
export async function sendPlanEmail(to: string, name: string | null, p: PlanEmail, siteUrl: string): Promise<void> {
  if (!process.env.RESEND_API_KEY) return;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const selling = await getSellingOptions();
    const result = await client.emails.send({ from: fromEmail, to, subject: planEmailSubject(p), html: planEmailHtml(p, name, siteUrl, selling) });
    if (result.error) throw new Error(result.error.message);
    console.log(`[BILLING] Sent ${p.plan} plan welcome email to ${to}`);
  } catch (e) {
    console.error("[BILLING] Failed to send plan welcome email:", e);
  }
}
