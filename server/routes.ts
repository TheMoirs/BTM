import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTeamSchema, insertMatchSchema, updateMatchScoreSchema, insertTournamentSchema, type Team, type Match, type Result, type Tournament } from "@shared/schema";
import { formatFee, paymentReference, buildPayNowUrl, payeeDetailsProblem, normaliseSortCode, normaliseIban, formatSortCode, formatIban, describePaymentLink } from "@shared/payments";
import { getUncachableResendClient } from "./resend";
import { z } from "zod";
import { validateTokenMiddleware } from "./tokenMiddleware";
import bcrypt from "bcryptjs";
import { setAuthCookie, clearAuthCookie, getSessionFromRequest, SYSTEM_ADMIN_EMAIL, GOOGLE_ONLY_PASSWORD, hasUsablePassword, createResetToken, decodeResetToken, resetTokenMatches, createTeamEditCode, readTeamEditCode } from "./sessionAuth";
import { computeStandings, selectAndSeedQualifiers, firstRoundPairings, nextRoundPairings } from "./knockout";
import { knockoutStages, type KnockoutStage } from "@shared/knockoutFormat";
import { publicRegistrationSchema, REGISTRATION_CONTACT, type PublicRegistration } from "@shared/registration";

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// Confirmation email sent to a team captain after they register (or update) via /register/<tournament>
// What teams see about paying the registration fee (null when there's no fee)
type FeePayment = {
  amount: string;          // e.g. "£10"
  minor: number;
  currency: string;
  reference: string;       // e.g. "BATH BOMBERS"
  payNowUrl: string | null;
  payNowLabel: string | null;
  bank: { accountName: string | null; sortCode: string | null; accountNumber: string | null; iban: string | null } | null;
};

async function feePaymentFor(t: { registrationFeeMinor: number | null; registrationFeeCurrency: string; userId: string | null }, teamName: string | null): Promise<FeePayment | null> {
  if (!t.registrationFeeMinor || t.registrationFeeMinor <= 0) return null;
  const owner = t.userId ? await storage.getUserById(t.userId) : undefined;
  const reference = paymentReference(teamName || "TEAM FEE");
  const link = owner?.paymentLink ? describePaymentLink(owner.paymentLink) : null;
  const hasBank = !!(owner?.payeeSortCode || owner?.payeeIban);
  return {
    amount: formatFee(t.registrationFeeMinor, t.registrationFeeCurrency),
    minor: t.registrationFeeMinor,
    currency: t.registrationFeeCurrency,
    reference,
    payNowUrl: owner?.paymentLink ? buildPayNowUrl(owner.paymentLink, t.registrationFeeMinor, t.registrationFeeCurrency, reference) : null,
    payNowLabel: link ? (link.kind === "monzo" ? "Monzo" : link.kind === "paypal" ? "PayPal" : null) : null,
    bank: hasBank && owner
      ? {
          accountName: owner.payeeAccountName,
          sortCode: owner.payeeSortCode ? formatSortCode(owner.payeeSortCode) : null,
          accountNumber: owner.payeeAccountNumber,
          iban: owner.payeeIban ? formatIban(owner.payeeIban) : null,
        }
      : null,
  };
}

export function feeEmailHtml(p: FeePayment): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:0 12px 0 0;color:#555;white-space:nowrap">${label}</td><td style="padding:0"><strong>${escapeHtml(value)}</strong></td></tr>`;
  const bankRows = p.bank
    ? [
        p.bank.accountName && row("Account name", p.bank.accountName),
        p.bank.sortCode && row("Sort code", p.bank.sortCode),
        p.bank.accountNumber && row("Account number", p.bank.accountNumber),
        p.bank.iban && row("IBAN", p.bank.iban),
        row("Reference", p.reference),
      ].filter(Boolean).join("")
    : "";
  return `<div style="margin:16px 0;padding:12px 14px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc">
<p style="margin:0 0 8px"><strong>Registration fee: ${escapeHtml(p.amount)}</strong></p>
${p.payNowUrl ? `<p style="margin:0 0 10px"><a href="${p.payNowUrl}" style="display:inline-block;padding:8px 14px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">PAY NOW${p.payNowLabel ? ` (${p.payNowLabel})` : ""}</a></p>` : ""}
${bankRows ? `<p style="margin:0 0 4px">${p.payNowUrl ? "Or pay by bank transfer:" : "Please pay by bank transfer:"}</p><table cellpadding="0" cellspacing="0" style="border-collapse:collapse">${bankRows}</table>` : ""}
${!p.payNowUrl && !bankRows ? `<p style="margin:0">The organiser will let you know how to pay.</p>` : ""}
</div>`;
}

export function registrationEmailHtml(tournamentName: string, d: PublicRegistration, updated: boolean, siteUrl: string, editUrl: string | null, fee: FeePayment | null = null): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:0 12px 0 0;margin:0;line-height:1.4;color:#555;vertical-align:top;white-space:nowrap">${label}</td><td style="padding:0;margin:0;line-height:1.4;vertical-align:top"><strong>${value}</strong></td></tr>`;
  const c = REGISTRATION_CONTACT;
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:560px">
<p>Hello ${escapeHtml(d.captainName)},</p>
<p>${updated ? "Your registration details have been updated" : "Thank you for registering"} — <strong>${escapeHtml(d.name)}</strong> ${updated ? "is" : "is now"} registered for <strong>${escapeHtml(tournamentName)}</strong>.</p>
<p>These are the details we have for your team:</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 16px">${[
  row("Team name", escapeHtml(d.name)),
  row("Captain", escapeHtml(d.captainName)),
  row("Phone", escapeHtml(d.captainPhone)),
  row("Email", escapeHtml(d.captainEmail)),
  row("Home piste", escapeHtml(d.homePiste)),
  row("Other players", d.otherPlayers.map(escapeHtml).join("<br>")),
].join("")}</table>
${fee ? feeEmailHtml(fee) : ""}
${editUrl
  ? `<p style="margin:20px 0"><strong>Need to change your details?</strong> <a href="${editUrl}" style="display:inline-block;margin-left:6px;padding:8px 14px;background:#1f6f4a;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">CLICK HERE</a></p>
<p style="color:#555;font-size:14px">Any questions? Contact ${c.name} by email at <a href="mailto:${c.email}">${c.email}</a> or on WhatsApp at <a href="https://wa.me/${c.whatsappIntl}">${c.whatsapp}</a>.</p>`
  : `<p>If you need to change any of these details, please contact ${c.name}:<br>
Email: <a href="mailto:${c.email}">${c.email}</a><br>
WhatsApp: <a href="https://wa.me/${c.whatsappIntl}">${c.whatsapp}</a></p>`}
<p>Good luck in the tournament!</p>
<p style="color:#888;font-size:13px">Pétanque Tournament Manager · <a href="${siteUrl}" style="color:#888">${siteUrl.replace(/^https?:\/\//, "")}</a></p>
</div>`;
}

// Let the tournament's organiser know a team has registered (or changed its details),
// including whether the registration fee has been marked as paid.
export function organiserEmailHtml(
  tournamentName: string, d: PublicRegistration, updated: boolean, siteUrl: string, teamsUrl: string,
  fee: { amount: string; reference: string } | null, feePaid: boolean,
): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:0 12px 0 0;margin:0;line-height:1.4;color:#555;vertical-align:top;white-space:nowrap">${label}</td><td style="padding:0;margin:0;line-height:1.4;vertical-align:top"><strong>${value}</strong></td></tr>`;
  const paidBadge = feePaid
    ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#dcfce7;color:#166534;font-weight:bold">Paid</span>`
    : `<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#fef3c7;color:#92400e;font-weight:bold">Not paid yet</span>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:560px">
<p><strong>${escapeHtml(d.name)}</strong> ${updated ? "has updated its registration for" : "has registered for"} <strong>${escapeHtml(tournamentName)}</strong>.</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 16px">${[
  row("Team name", escapeHtml(d.name)),
  row("Captain", escapeHtml(d.captainName)),
  row("Phone", escapeHtml(d.captainPhone)),
  row("Email", escapeHtml(d.captainEmail)),
  row("Home piste", escapeHtml(d.homePiste)),
  row("Other players", d.otherPlayers.map(escapeHtml).join("<br>")),
  fee ? row("Registration fee", `${escapeHtml(fee.amount)} &nbsp;${paidBadge}`) : "",
  fee ? row("Payment reference", escapeHtml(fee.reference)) : "",
].join("")}</table>
${fee && !feePaid ? `<p style="color:#555;font-size:14px">When the payment arrives, tick <strong>Paid</strong> for this team on the Teams page.</p>` : ""}
<p><a href="${teamsUrl}" style="display:inline-block;padding:8px 14px;background:#1f6f4a;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">OPEN TEAMS</a></p>
<p style="color:#888;font-size:13px">Pétanque Tournament Manager · <a href="${siteUrl}" style="color:#888">${siteUrl.replace(/^https?:\/\//, "")}</a></p>
</div>`;
}

async function sendOrganiserEmail(
  req: any, t: { id: string; name: string; userId: string | null }, data: PublicRegistration, updated: boolean, teamId: string, fee: FeePayment | null,
): Promise<void> {
  if (!process.env.RESEND_API_KEY || !t.userId) return;
  try {
    const owner = await storage.getUserById(t.userId);
    if (!owner?.email) return;
    const team = await storage.getTeam(teamId);
    const { client, fromEmail } = await getUncachableResendClient();
    const siteUrl = baseUrlOf(req);
    const teamsUrl = `${siteUrl}/edit/teams?tournament=${encodeURIComponent(t.id)}`;
    const subject = `${updated ? "Registration updated" : "New team registered"}: ${data.name} – ${t.name}`;
    const result = await client.emails.send({
      from: fromEmail, to: owner.email, replyTo: data.captainEmail, subject,
      html: organiserEmailHtml(t.name, data, updated, siteUrl, teamsUrl, fee, !!team?.feePaid),
    });
    if (result.error) throw new Error(result.error.message);
  } catch (e) {
    console.error("[REGISTER] Failed to email the organiser:", e);
  }
}

// Send the captain their confirmation (with an edit link), and if the contact email changed,
// let the previous address know. Returns whether the captain's email was sent.
// Registration still counts if sending fails.
async function sendRegistrationEmails(
  req: any, tournamentName: string, data: PublicRegistration, updated: boolean, teamId: string, previousEmail?: string | null, fee: FeePayment | null = null,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) return false;
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    const siteUrl = baseUrlOf(req);
    const editUrl = `${siteUrl}/register/${encodeURIComponent(String(req.params.slug))}?edit=${encodeURIComponent(createTeamEditCode(teamId))}`;
    const subject = `${updated ? "Registration updated" : "You're registered"}: ${tournamentName}`;
    const result = await client.emails.send({
      from: fromEmail, to: data.captainEmail, replyTo: REGISTRATION_CONTACT.email, subject,
      html: registrationEmailHtml(tournamentName, data, updated, siteUrl, editUrl, fee),
    });
    if (result.error) throw new Error(result.error.message);

    const oldEmail = previousEmail?.trim();
    if (updated && oldEmail && oldEmail.toLowerCase() !== data.captainEmail.toLowerCase()) {
      // No edit link for the previous contact: they should go through the organiser
      await client.emails.send({
        from: fromEmail, to: oldEmail, replyTo: REGISTRATION_CONTACT.email, subject, html:
          `<p style="font-family:Arial,Helvetica,sans-serif">You are receiving this because you were previously the contact for this team. If you didn't expect this change, please contact ${REGISTRATION_CONTACT.name}.</p>` +
          registrationEmailHtml(tournamentName, data, updated, siteUrl, null),
      }).catch(e => console.error("[REGISTER] Failed to notify previous captain:", e));
    }
    return true;
  } catch (e) {
    console.error("[REGISTER] Failed to send confirmation email:", e);
    return false;
  }
}

// What the browser is told about the signed-in user
function publicUser(u: { id: string; email: string; displayName: string | null; isSystemAdmin: boolean; passwordHash: string }) {
  return { id: u.id, email: u.email, displayName: u.displayName, isSystemAdmin: u.isSystemAdmin, hasPassword: hasUsablePassword(u.passwordHash) };
}

// Public address of this site, used in links BTM hands out (share links, reset emails).
// PUBLIC_URL (e.g. https://btm.themoirs.uk) wins; otherwise use the address the request came in on
// (Render sits behind a proxy, so trust its forwarded protocol).
function publicUrlSetting(): string | null {
  const v = (process.env.PUBLIC_URL || "").trim().replace(/\/+$/, "");
  return v || null;
}

function baseUrlOf(req: { protocol: string; get(name: string): string | undefined; headers: Record<string, any> }) {
  const configured = publicUrlSetting();
  if (configured) return configured;
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol).split(",")[0].trim();
  return `${proto}://${req.get("host")}`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Short URL redirect endpoint (before token middleware - no auth required)
  app.get("/s/:code", async (req, res) => {
    try {
      const { code } = req.params;
      const shortLink = await storage.getShortLinkByCode(code);
      
      if (!shortLink) {
        return res.status(404).send("Link not found");
      }
      
      // Get the tournament to retrieve the appropriate token
      const tournament = await storage.getTournament(shortLink.tournamentId);
      if (!tournament) {
        return res.status(404).send("Tournament not found");
      }
      
      // Build the redirect URL with the appropriate token
      const token = shortLink.accessType === 'admin' ? tournament.adminToken : tournament.viewToken;
      // Handle 'home' target page as root path
      const targetPath = shortLink.targetPage === 'home' ? '/' : `/${shortLink.targetPage}`;
      const redirectUrl = `${targetPath}?token=${token}&tournament=${tournament.id}`;
      
      console.log(`[SHORT_LINK] Redirecting ${code} -> ${targetPath} for tournament ${tournament.id}`);
      res.redirect(redirectUrl);
    } catch (error) {
      console.error("[ERROR] Short link redirect failed:", error);
      res.status(500).send("Internal server error");
    }
  });

  // ── Email/password auth routes (before token middleware) ─────────────────
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, displayName } = req.body;
      if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
      if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

      const normalizedEmail = email.toLowerCase().trim();
      const existing = await storage.getUserByEmail(normalizedEmail);
      if (existing) {
        return res.status(409).json({
          error: hasUsablePassword(existing.passwordHash)
            ? "An account with this email already exists. Please sign in instead."
            : "An account with this email already exists. Sign in with Google, or use \"Forgot password?\" to set a password.",
        });
      }

      const isSystemAdmin = normalizedEmail === SYSTEM_ADMIN_EMAIL;
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await storage.createUser(normalizedEmail, passwordHash, displayName?.trim() || null, isSystemAdmin);

      setAuthCookie(res, { userId: user.id, email: user.email, displayName: user.displayName, isSystemAdmin: user.isSystemAdmin });
      console.log(`[AUTH] Registered: ${user.email} (sysAdmin: ${isSystemAdmin})`);
      res.status(201).json({ user: publicUser(user) });
    } catch (error) {
      console.error("[AUTH] Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      if (!user) return res.status(401).json({ error: "Invalid email or password" });
      if (user.isBlocked) return res.status(401).json({ error: "Your account has been blocked. Please contact the administrator." });

      if (!hasUsablePassword(user.passwordHash)) {
        return res.status(401).json({
          error: "This account doesn't have a PTM password yet. Sign in with Google, or use \"Forgot password?\" to set one.",
        });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return res.status(401).json({ error: "Invalid email or password" });

      const isSystemAdmin = user.email === SYSTEM_ADMIN_EMAIL || user.isSystemAdmin;
      setAuthCookie(res, { userId: user.id, email: user.email, displayName: user.displayName, isSystemAdmin });
      console.log(`[AUTH] Login: ${user.email}`);
      res.json({ user: { ...publicUser(user), isSystemAdmin } });
    } catch (error) {
      console.error("[AUTH] Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // ── Google sign-in ───────────────────────────────────────────────────────
  // The browser uses Google's own "Sign in with Google" button (client ID from
  // GOOGLE_CLIENT_ID) and sends us the ID token it gets back. We check it with
  // Google, then sign the person in, creating an account on first use.
  app.get("/api/auth/google-client-id", (_req, res) => {
    res.json({ clientId: process.env.GOOGLE_CLIENT_ID || null });
  });

  app.post("/api/auth/google", async (req, res) => {
    try {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      if (!clientId) return res.status(503).json({ error: "Google sign-in is not set up on this server." });
      const { credential } = req.body || {};
      if (!credential) return res.status(400).json({ error: "Missing Google credential." });

      const verify = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
      if (!verify.ok) return res.status(401).json({ error: "Couldn't verify that Google sign-in. Please try again." });
      const info = await verify.json() as Record<string, any>;
      const validIssuer = info.iss === "accounts.google.com" || info.iss === "https://accounts.google.com";
      const notExpired = Number(info.exp) * 1000 > Date.now();
      if (info.aud !== clientId || !validIssuer || !notExpired) {
        return res.status(401).json({ error: "Couldn't verify that Google sign-in. Please try again." });
      }
      if (info.email_verified !== true && info.email_verified !== "true") {
        return res.status(401).json({ error: "Your Google account's email address isn't verified." });
      }

      const email = String(info.email).toLowerCase().trim();
      let user = await storage.getUserByEmail(email);
      if (!user) {
        const name = typeof info.name === "string" && info.name.trim() ? info.name.trim() : null;
        user = await storage.createUser(email, GOOGLE_ONLY_PASSWORD, name, email === SYSTEM_ADMIN_EMAIL);
        console.log(`[AUTH] Registered via Google: ${email}`);
      }
      if (user.isBlocked) return res.status(401).json({ error: "Your account has been blocked. Please contact the administrator." });

      const isSystemAdmin = user.email === SYSTEM_ADMIN_EMAIL || user.isSystemAdmin;
      setAuthCookie(res, { userId: user.id, email: user.email, displayName: user.displayName, isSystemAdmin });
      console.log(`[AUTH] Google login: ${user.email}`);
      res.json({ user: { ...publicUser(user), isSystemAdmin } });
    } catch (error) {
      console.error("[AUTH] Google login error:", error);
      res.status(500).json({ error: "Google sign-in failed" });
    }
  });

  // ── Forgot / reset password ─────────────────────────────────────────────
  app.post("/api/auth/forgot", async (req, res) => {
    try {
      const email = String(req.body?.email || "").toLowerCase().trim();
      if (!email) return res.status(400).json({ error: "Email is required" });
      if (!process.env.RESEND_API_KEY) {
        return res.status(503).json({ error: "Password reset emails aren't set up yet. Please contact the administrator." });
      }

      const user = await storage.getUserByEmail(email);
      // Always give the same answer, so this can't be used to find out who has an account
      if (user && !user.isBlocked) {
        const token = createResetToken(user.id, user.passwordHash);
        // Uses ?code= (not ?token=, which the app reserves for tournament share links)
        const link = `${baseUrlOf(req)}/reset-password?code=${encodeURIComponent(token)}`;
        try {
          const { client, fromEmail } = await getUncachableResendClient();
          await client.emails.send({
            from: fromEmail,
            to: user.email,
            subject: "Reset your Pétanque Tournament Manager password",
            html: `<p>Hello${user.displayName ? ` ${user.displayName}` : ""},</p>
<p>Someone (hopefully you) asked to ${hasUsablePassword(user.passwordHash) ? "reset" : "set"} the password for your Pétanque Tournament Manager account.</p>
<p><a href="${link}">Click here to choose a new password</a></p>
<p>This link works once and expires in 1 hour. If you didn't ask for this, you can ignore this email.</p>`,
          });
          console.log(`[AUTH] Password reset email sent to ${user.email}`);
        } catch (e) {
          console.error("[AUTH] Failed to send reset email:", e);
        }
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[AUTH] Forgot password error:", error);
      res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  });

  app.post("/api/auth/reset", async (req, res) => {
    try {
      const { token, password } = req.body || {};
      if (!token || !password) return res.status(400).json({ error: "Token and new password are required" });
      if (String(password).length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

      const decoded = decodeResetToken(String(token));
      const user = decoded ? await storage.getUserById(decoded.userId) : undefined;
      if (!decoded || !user || !resetTokenMatches(decoded.fp, user.passwordHash)) {
        return res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
      }
      if (user.isBlocked) return res.status(401).json({ error: "Your account has been blocked. Please contact the administrator." });

      const newHash = await bcrypt.hash(String(password), 12);
      await storage.updateUserPassword(user.id, newHash);
      const isSystemAdmin = user.email === SYSTEM_ADMIN_EMAIL || user.isSystemAdmin;
      setAuthCookie(res, { userId: user.id, email: user.email, displayName: user.displayName, isSystemAdmin });
      console.log(`[AUTH] Password reset for: ${user.email}`);
      res.json({ user: { ...publicUser({ ...user, passwordHash: newHash }), isSystemAdmin } });
    } catch (error) {
      console.error("[AUTH] Reset password error:", error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  app.post("/api/auth/logout", async (_req, res) => {
    clearAuthCookie(res);
    res.json({ success: true });
  });

  app.patch("/api/auth/profile", async (req: any, res) => {
    try {
      const session = getSessionFromRequest(req);
      if (!session) return res.status(401).json({ error: "Not authenticated" });
      const targetUser = await storage.getUserById(session.userId);
      if (!targetUser || targetUser.isBlocked) return res.status(401).json({ error: "User not found or blocked" });

      const { displayName } = req.body;
      const trimmed = typeof displayName === "string" ? displayName.trim() : null;

      const updated = await storage.updateUserProfile(targetUser.id, trimmed || null);
      if (!updated) return res.status(500).json({ error: "Failed to update profile" });

      setAuthCookie(res, { userId: updated.id, email: updated.email, displayName: updated.displayName, isSystemAdmin: updated.isSystemAdmin });
      console.log(`[AUTH] Display name updated for: ${updated.email}`);
      res.json({ user: publicUser(updated) });
    } catch (error) {
      console.error("[AUTH] Update profile error:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // ── Organiser's payment details for registration fees ──────────────────────
  app.get("/api/auth/payment-details", async (req: any, res) => {
    const session = getSessionFromRequest(req);
    if (!session) return res.status(401).json({ error: "Not authenticated" });
    const u = await storage.getUserById(session.userId);
    if (!u) return res.status(401).json({ error: "Not authenticated" });
    res.json({
      accountName: u.payeeAccountName ?? "",
      sortCode: u.payeeSortCode ? formatSortCode(u.payeeSortCode) : "",
      accountNumber: u.payeeAccountNumber ?? "",
      iban: u.payeeIban ? formatIban(u.payeeIban) : "",
      paymentLink: u.paymentLink ?? "",
    });
  });

  app.put("/api/auth/payment-details", async (req: any, res) => {
    try {
      const session = getSessionFromRequest(req);
      if (!session) return res.status(401).json({ error: "Not authenticated" });
      const u = await storage.getUserById(session.userId);
      if (!u || u.isBlocked) return res.status(401).json({ error: "User not found or blocked" });
      const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
      const d = {
        accountName: str(req.body?.accountName, 70),
        sortCode: str(req.body?.sortCode, 12),
        accountNumber: str(req.body?.accountNumber, 12),
        iban: str(req.body?.iban, 50),
        paymentLink: str(req.body?.paymentLink, 300),
      };
      const problem = payeeDetailsProblem(d);
      if (problem) return res.status(400).json({ error: problem });
      const link = d.paymentLink ? describePaymentLink(d.paymentLink) : null;
      await storage.updatePayeeDetails(u.id, {
        payeeAccountName: d.accountName,
        payeeSortCode: d.sortCode ? normaliseSortCode(d.sortCode) : null,
        payeeAccountNumber: d.accountNumber ? d.accountNumber.replace(/\s/g, "") : null,
        payeeIban: d.iban ? normaliseIban(d.iban) : null,
        paymentLink: link ? link.url : null,
      });
      console.log(`[AUTH] Payment details updated for: ${u.email}`);
      res.json({ success: true });
    } catch (error) {
      console.error("[AUTH] Payment details error:", error);
      res.status(500).json({ error: "Failed to save payment details" });
    }
  });

  app.patch("/api/auth/password", async (req, res) => {
    try {
      const session = getSessionFromRequest(req);
      if (!session) return res.status(401).json({ error: "Not authenticated" });

      const { currentPassword, newPassword } = req.body;
      if (!newPassword) return res.status(400).json({ error: "New password is required" });
      if (newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });

      const user = await storage.getUserById(session.userId);
      if (!user || user.isBlocked) return res.status(401).json({ error: "User not found or blocked" });

      // Accounts that sign in with Google can set a first password without a current one
      if (hasUsablePassword(user.passwordHash)) {
        if (!currentPassword) return res.status(400).json({ error: "Current password is required" });
        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) return res.status(400).json({ error: "Current password is incorrect" });
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      await storage.updateUserPassword(user.id, newHash);
      console.log(`[AUTH] Password changed for: ${user.email}`);
      res.json({ success: true });
    } catch (error) {
      console.error("[AUTH] Change password error:", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  app.get("/api/auth/user", async (req: any, res) => {
    try {
      const session = getSessionFromRequest(req);
      if (!session) return res.json({ user: null });
      const user = await storage.getUserById(session.userId);
      if (!user || user.isBlocked) { clearAuthCookie(res); return res.json({ user: null }); }
      res.json({ user: publicUser(user) });
    } catch {
      res.status(500).json({ error: "Failed to get user" });
    }
  });

  // ── Public tournament addresses: /teams/<slug> and /leaderboard/<slug> ──────
  // Turns a tournament's readable address into its view-only access code, so the
  // page can load read-only data without the code showing in the address bar.
  app.get("/api/public/config", (_req, res) => {
    res.json({ publicUrl: publicUrlSetting() });
  });

  // ── Show a PDF made in the browser under a proper file name ───────────────
  // The page posts the PDF here (into its preview frame or a new tab) and gets it
  // straight back, so the browser's PDF viewer saves it as e.g.
  // "Summer League - Leaderboard - 2026-10-21.pdf" rather than a random name.
  // Only accepted from this site's own pages, and only real PDFs; nothing is stored.
  app.post("/api/pdf/:filename", (req, res) => {
    const origin = String(req.get("origin") || req.get("referer") || "");
    let sameSite = false;
    try {
      sameSite = !!origin && new URL(origin).host === req.get("host");
    } catch {
      sameSite = false;
    }
    if (!sameSite) return res.status(403).send("Not allowed");

    const data = typeof req.body?.pdf === "string" ? req.body.pdf : "";
    const pdf = Buffer.from(data, "base64");
    if (pdf.length < 5 || pdf.length > 8 * 1024 * 1024 || pdf.subarray(0, 5).toString("latin1") !== "%PDF-") {
      return res.status(400).send("Not a PDF");
    }

    const wanted = String(req.params.filename || "report.pdf").replace(/[\\/:*?"<>|\r\n]+/g, "-").slice(0, 150);
    const filename = /\.pdf$/i.test(wanted) ? wanted : `${wanted}.pdf`;
    const asciiName = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.send(pdf);
  });

  // ── Web app manifest for "Add to home screen / desktop" shortcuts ─────────
  // /api/public/manifest?name=Summer League-Leaderboard&start=/leaderboard/summer-league
  // The shortcut is named after the tournament and page, and opens that page.
  app.get("/api/public/manifest", (req, res) => {
    const rawName = String(req.query.name || "").trim().slice(0, 100);
    const rawStart = String(req.query.start || "/").trim();
    // Only same-site paths: must start with a single "/" (not "//host")
    const start = /^\/(?!\/)[^\s]{0,500}$/.test(rawStart) ? rawStart : "/";
    const name = rawName || "Pétanque Tournament Manager";
    // Each shortcut covers only its own page (e.g. /teams/<tournament>), so the
    // Teams and Leaderboard pages, and different tournaments, install separately.
    // A shortcut covering the whole site would stop Chrome offering the others.
    const scope = start.split(/[?#]/)[0] || "/";
    // Bracket-to-Boule icons: people = Teams, ranked rows = Leaderboard, sliders = Teams Edit (organisers)
    const iconKinds = ["teams", "leaderboard", "teams-edit"];
    const iconKind = iconKinds.includes(String(req.query.icon)) ? String(req.query.icon) : null;
    const icons = iconKind
      ? [
          { src: `/icons/${iconKind}-192.png?v=4`, sizes: "192x192", type: "image/png", purpose: "any" },
          { src: `/icons/${iconKind}-512.png?v=4`, sizes: "512x512", type: "image/png", purpose: "any" },
        ]
      : [
          { src: "/icon-192.png?v=4", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png?v=4", sizes: "512x512", type: "image/png", purpose: "any" },
        ];
    res.type("application/manifest+json");
    res.set("Cache-Control", "no-cache");
    res.send(
      JSON.stringify({
        id: start,
        name,
        short_name: name,
        description: "Pétanque Tournament Manager",
        // Marked so the app knows the shortcut exists (it then hides the "Add Shortcut" button)
        start_url: `${start}${start.includes("?") ? "&" : "?"}from=shortcut`,
        scope,
        display: "minimal-ui",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons,
      }),
    );
  });

  // ── Score Flip (/coin-toss/): tournaments, divisions and team names ──────
  // Public on purpose (agreed with Ali): only names, divisions and team names,
  // never captains, phone numbers or emails. Newest tournament first.
  app.get("/api/public/score-flip", async (_req, res) => {
    try {
      const [allTournaments, allTeams] = await Promise.all([storage.getAllTournaments(), storage.getAllTeams()]);
      const byTournament = new Map<string, Record<string, string[]>>();
      for (const team of allTeams) {
        const divisions = byTournament.get(team.tournamentId) ?? {};
        const division = (team.division || "").trim();
        (divisions[division] ??= []).push(team.name);
        byTournament.set(team.tournamentId, divisions);
      }
      const tournaments = allTournaments.map((t) => {
        const divisions = byTournament.get(t.id) ?? {};
        Object.values(divisions).forEach((names) => names.sort((a, b) => a.localeCompare(b)));
        return { key: t.slug || t.id, name: t.name, divisions };
      });
      res.set("Cache-Control", "no-cache");
      res.json({ tournaments });
    } catch (error) {
      console.error("[PUBLIC] Score Flip list failed:", error);
      res.status(500).json({ error: "Failed to load tournaments" });
    }
  });

  // Score Flip install file that opens on the tournament it was installed from
  // (/coin-toss/?t=<tournament>). Same app id, so re-installing just updates it.
  app.get("/api/public/score-flip-manifest", (req, res) => {
    const key = String(req.query.t || "").trim().slice(0, 120);
    const safeKey = /^[A-Za-z0-9_-]+$/.test(key) ? key : "";
    res.type("application/manifest+json");
    res.set("Cache-Control", "no-cache");
    res.send(JSON.stringify({
      id: "/coin-toss/",
      name: "PTM Score Flip",
      short_name: "Score Flip",
      description: "Pétanque Tournament Manager - Score Flip: coin flip, match score keeper and game timer.",
      start_url: safeKey ? `/coin-toss/?from=app&t=${encodeURIComponent(safeKey)}` : "/coin-toss/?from=app",
      scope: "/coin-toss/",
      display: "standalone",
      orientation: "portrait",
      background_color: "#b9a888",
      theme_color: "#b9a888",
      icons: [
        { src: "/coin-toss/icon-192.png?v=8", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/coin-toss/icon-512.png?v=8", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/coin-toss/icon-512.png?v=8", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    }));
  });

  app.get("/api/public/tournament/:slug", async (req, res) => {
    try {
      const t = await storage.getTournamentBySlug(String(req.params.slug));
      if (!t) return res.status(404).json({ error: "Tournament not found" });
      res.json({
        tournamentId: t.id, name: t.name, viewToken: t.viewToken, registrationDeadline: t.registrationDeadline ?? null,
        registrationFee: t.registrationFeeMinor && t.registrationFeeMinor > 0 ? formatFee(t.registrationFeeMinor, t.registrationFeeCurrency) : null,
      });
    } catch (error) {
      console.error("[PUBLIC] Slug lookup failed:", error);
      res.status(500).json({ error: "Failed to look up tournament" });
    }
  });

  // ── Public team registration: /register/<slug> ─────────────────────────────
  // Captains enter their own team details. If the team name is already taken,
  // the existing details come back (409) so the captain can choose to update
  // them (resubmit with action "update") or discard their changes.
  // Load a team's details for the edit link in the confirmation email (?code=<teamId>.<signature>)
  app.get("/api/public/register/:slug/team", async (req, res) => {
    try {
      const t = await storage.getTournamentBySlug(String(req.params.slug));
      if (!t) return res.status(404).json({ error: "Tournament not found" });
      const teamId = readTeamEditCode(String(req.query.code || ""));
      const team = teamId ? await storage.getTeam(teamId) : undefined;
      if (!team || team.tournamentId !== t.id) {
        return res.status(404).json({ error: "This link isn't valid any more. Please register again or contact the organiser." });
      }
      res.json({
        name: team.name,
        captainName: team.captainName,
        captainPhone: team.captainPhone,
        captainEmail: team.captainEmail || "",
        homePiste: team.homePiste || "",
        otherPlayers: team.otherPlayers || [],
      });
    } catch (error) {
      console.error("[REGISTER] Edit lookup failed:", error);
      res.status(500).json({ error: "Failed to load your registration" });
    }
  });

  app.post("/api/public/register/:slug", async (req, res) => {
    try {
      const t = await storage.getTournamentBySlug(String(req.params.slug));
      if (!t) return res.status(404).json({ error: "Tournament not found" });

      // Hidden "website" field that people never see: bots fill it in. Pretend it worked.
      if (req.body?.website) return res.json({ status: "created", emailSent: true });

      const parsed = publicRegistrationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.errors[0]?.message || "Please check your details" });
      }
      const data = parsed.data;
      const action = req.body?.action === "update" ? "update" : req.body?.action === "edit" ? "edit" : "create";

      // Editing via the link in the confirmation email: update that exact team
      if (action === "edit") {
        const teamId = readTeamEditCode(String(req.body?.editCode || ""));
        const team = teamId ? await storage.getTeam(teamId) : undefined;
        if (!team || team.tournamentId !== t.id) {
          return res.status(404).json({ error: "This link isn't valid any more. Please register again or contact the organiser." });
        }
        const clash = await storage.findTeamByName(t.id, data.name);
        if (clash && clash.id !== team.id) {
          return res.status(400).json({ error: `Another team is already registered as "${clash.name}". Please choose a different team name.` });
        }
        await storage.updateTeamRegistration(team.id, data);
        console.log(`[REGISTER] Edited "${data.name}" for "${t.name}" via email link`);
        const fee = await feePaymentFor(t, data.name);
        const emailSent = await sendRegistrationEmails(req, t.name, data, true, team.id, team.captainEmail, fee);
        await sendOrganiserEmail(req, t, data, true, team.id, fee);
        return res.json({ status: "updated", emailSent, fee });
      }

      const existing = await storage.findTeamByName(t.id, data.name);

      const existingDetails = existing && {
        id: existing.id,
        name: existing.name,
        captainName: existing.captainName,
        captainPhone: existing.captainPhone,
        captainEmail: existing.captainEmail || "",
        homePiste: existing.homePiste || "",
        otherPlayers: existing.otherPlayers || [],
      };

      let updated = false;
      let teamId: string;
      if (existing) {
        // Only overwrite the exact team the captain was shown
        if (action !== "update" || req.body?.existingTeamId !== existing.id) {
          return res.status(409).json({ conflict: true, existing: existingDetails });
        }
        await storage.updateTeamRegistration(existing.id, data);
        teamId = existing.id;
        updated = true;
      } else {
        if (action === "update") {
          // The team was removed or renamed in the meantime: register it as new
          console.log(`[REGISTER] Team to update no longer exists; creating "${data.name}" instead`);
        }
        teamId = (await storage.createTeam({ ...data, tournamentId: t.id, division: "A", teamDisplayId: null })).id;
      }
      console.log(`[REGISTER] ${updated ? "Updated" : "Registered"} "${data.name}" for "${t.name}"`);

      const fee = await feePaymentFor(t, data.name);
      const emailSent = await sendRegistrationEmails(req, t.name, data, updated, teamId, existingDetails?.captainEmail, fee);
      await sendOrganiserEmail(req, t, data, updated, teamId, fee);
      res.json({ status: updated ? "updated" : "created", emailSent, fee });
    } catch (error) {
      console.error("[REGISTER] Registration failed:", error);
      res.status(500).json({ error: "Something went wrong saving your registration. Please try again." });
    }
  });

  app.use(validateTokenMiddleware);

  // ── Admin routes (system admin only) ──────────────────────────────────────
  app.get("/api/admin/users", async (req: any, res) => {
    if (!req.isMasterAdmin) return res.status(403).json({ error: "System admin access required" });
    try {
      const allUsers = await storage.getAllUsers();
      const withCounts = await Promise.all(allUsers.map(async u => {
        const ts = await storage.getTournamentsByUserId(u.id);
        const { passwordHash: _ph, ...safe } = u;
        return { ...safe, tournamentCount: ts.length };
      }));
      res.json(withCounts);
    } catch {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.patch("/api/admin/users/:id/block", async (req: any, res) => {
    if (!req.isMasterAdmin) return res.status(403).json({ error: "System admin access required" });
    try {
      const { isBlocked } = req.body;
      const user = await storage.setUserBlocked(req.params.id, isBlocked);
      if (!user) return res.status(404).json({ error: "User not found" });
      res.json(user);
    } catch {
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  app.post("/api/admin/users/:id/reset-password", async (req: any, res) => {
    if (!req.isMasterAdmin) return res.status(403).json({ error: "System admin access required" });
    try {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });
      const user = await storage.getUserById(req.params.id);
      if (!user) return res.status(404).json({ error: "User not found" });
      const newHash = await bcrypt.hash(newPassword, 12);
      await storage.updateUserPassword(user.id, newHash);
      console.log(`[AUDIT] Admin reset password for: ${user.email}`);
      res.json({ success: true });
    } catch {
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  app.delete("/api/admin/users/:id", async (req: any, res) => {
    if (!req.isMasterAdmin) return res.status(403).json({ error: "System admin access required" });
    try {
      if (req.sessionUser?.userId === req.params.id) return res.status(400).json({ error: "Cannot delete your own account" });
      const deleted = await storage.deleteUser(req.params.id);
      if (!deleted) return res.status(404).json({ error: "User not found" });
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  // Tournament routes
  app.get("/api/tournaments", async (req: any, res) => {
    try {
      if (req.isMasterAdmin) {
        // System admin / master admin sees all
        const ts = await storage.getAllTournaments();
        res.json(ts.map(({ adminToken, viewToken, ...t }) => t));
      } else if (req.tokenTournamentId) {
        // Token-based share link — only the specific tournament
        const t = await storage.getTournament(req.tokenTournamentId);
        if (!t) return res.status(404).json({ error: "Tournament not found" });
        const { viewToken, adminToken, ...withoutTokens } = t;
        res.json([withoutTokens]);
      } else if (req.sessionUser) {
        // Logged-in regular user sees owned + shared-with-them tournaments
        const [owned, shared] = await Promise.all([
          storage.getTournamentsByUserId(req.sessionUser.userId),
          storage.getTournamentsSharedWithUserId(req.sessionUser.userId),
        ]);
        // Deduplicate by id, mark shared ones
        const seen = new Set<string>();
        const all: Array<Omit<Tournament, 'adminToken' | 'viewToken'> & { isShared?: boolean }> = [];
        for (const t of owned) {
          if (!seen.has(t.id)) { seen.add(t.id); const { adminToken, viewToken, ...rest } = t; all.push(rest); }
        }
        for (const t of shared) {
          if (!seen.has(t.id)) { seen.add(t.id); const { adminToken, viewToken, ...rest } = t; all.push({ ...rest, isShared: true }); }
        }
        res.json(all);
      } else {
        // No auth — empty list
        res.json([]);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tournaments" });
    }
  });

  app.get("/api/tournaments/latest", async (req: any, res) => {
    try {
      // If accessing with a token, return the associated tournament instead of latest
      if (req.tokenTournamentId) {
        const tournament = await storage.getTournament(req.tokenTournamentId);
        if (!tournament) {
          return res.status(404).json({ error: "Tournament not found" });
        }
        const { viewToken, adminToken, ...tournamentWithoutTokens } = tournament;
        res.json(tournamentWithoutTokens);
      } else {
        const tournament = await storage.getLatestTournament();
        if (!tournament) {
          return res.status(404).json({ error: "No tournament found" });
        }
        // Strip sensitive tokens from response
        const { adminToken, viewToken, ...tournamentWithoutTokens } = tournament;
        res.json(tournamentWithoutTokens);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch latest tournament" });
    }
  });

  app.get("/api/tournaments/:id", async (req: any, res) => {
    try {
      // Enforce tournament-specific access when using tokens
      if (req.tokenTournamentId && req.params.id !== req.tokenTournamentId) {
        return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
      }
      
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      // Strip sensitive tokens from response when accessed with any token
      if (req.tokenTournamentId) {
        const { viewToken, adminToken, ...tournamentWithoutTokens } = tournament;
        res.json(tournamentWithoutTokens);
      } else {
        res.json(tournament);
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch tournament" });
    }
  });

  app.post("/api/tournaments", async (req: any, res) => {
    try {
      // Allow master admin OR any logged-in user
      if (!req.isMasterAdmin && !req.sessionUser) {
        console.warn("[SECURITY] Unauthorized attempt to create tournament");
        return res.status(403).json({ error: "Access denied: login required to create tournaments" });
      }

      const validatedData = insertTournamentSchema.parse(req.body);
      const userId = req.sessionUser?.userId || null;
      const tournament = await storage.createTournament(validatedData, userId);
      res.status(201).json(tournament);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to create tournament" });
      }
    }
  });

  app.patch("/api/tournaments/:id", async (req: any, res) => {
    try {
      if (!req.isAdminAccess) {
        return res.status(403).json({ error: "Access denied: login required" });
      }
      // Master admin can update any tournament
      if (!req.isMasterAdmin) {
        // Token-based access: token must match this tournament
        if (req.tokenTournamentId && req.params.id !== req.tokenTournamentId) {
          return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
        }
        // Session-based access: user must own or be a collaborator on this tournament
        if (req.sessionUser && !req.tokenTournamentId) {
          const tournament = await storage.getTournament(req.params.id);
          if (!tournament) {
            return res.status(404).json({ error: "Tournament not found" });
          }
          const isOwner = tournament.userId === req.sessionUser.userId;
          const isCollab = !isOwner && await storage.isCollaborator(req.params.id, req.sessionUser.userId);
          if (!isOwner && !isCollab) {
            return res.status(403).json({ error: "Access denied: you do not own this tournament" });
          }
        }
      }
      const validatedData = insertTournamentSchema.parse(req.body);
      const tournament = await storage.updateTournament(req.params.id, validatedData);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      res.json(tournament);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to update tournament" });
      }
    }
  });

  app.post("/api/tournaments/:id/recalculate-results", async (req: any, res) => {
    try {
      const tournamentId = req.params.id;
      if (!req.isMasterAdmin && req.sessionUser) {
        const tournament = await storage.getTournament(tournamentId);
        if (!tournament) return res.status(404).json({ error: "Tournament not found" });
        const isOwner = tournament.userId === req.sessionUser.userId;
        const isCollab = !isOwner && await storage.isCollaborator(tournamentId, req.sessionUser.userId);
        if (!isOwner && !isCollab) return res.status(403).json({ error: "Access denied" });
      }

      const allMatches = await storage.getAllMatches(tournamentId);
      const completedMatches = allMatches.filter(m => m.status === "completed");

      let recalculated = 0;
      for (const match of completedMatches) {
        await storage.updateMatchScore(
          match.id,
          match.team1Game1Score,
          match.team2Game1Score,
          match.team1Game2Score,
          match.team2Game2Score,
          match.team1Game3Score,
          match.team2Game3Score,
          match.matchDate,
          (match as any).team1NoShow ?? false,
          (match as any).team2NoShow ?? false,
        );
        recalculated++;
      }

      res.json({ recalculated });
    } catch (error) {
      res.status(500).json({ error: "Failed to recalculate results" });
    }
  });

  app.patch("/api/tournaments/:id/transfer", async (req: any, res) => {
    try {
      const tournamentId = req.params.id;

      // Allow master admin OR the logged-in user who owns this tournament
      const isTournamentOwner = req.sessionUser && (() => {
        // We'll verify ownership after fetching the tournament
        return true;
      })();

      if (!req.isMasterAdmin && !isTournamentOwner) {
        return res.status(403).json({ error: "Access denied: master admin or tournament owner required" });
      }

      const tournament = await storage.getTournament(tournamentId);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      // Non-master-admin users must own the tournament
      if (!req.isMasterAdmin) {
        if (!req.sessionUser || tournament.userId !== req.sessionUser.userId) {
          return res.status(403).json({ error: "Access denied: you do not own this tournament" });
        }
      }

      const { email } = req.body;
      if (typeof email !== "string" || !email.trim()) {
        return res.status(400).json({ error: "A valid email address is required" });
      }

      const targetUser = await storage.getUserByEmail(email.trim());
      if (!targetUser) {
        return res.status(404).json({ error: `${email.trim()} does not have a PTM account. Get them to create one before transferring ownership to them.` });
      }

      if (targetUser.isBlocked) {
        return res.status(400).json({ error: "Cannot transfer to a blocked user account" });
      }

      const updated = await storage.transferTournamentOwnership(tournamentId, targetUser.id);
      if (!updated) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      console.log(`[AUDIT] Tournament ${tournamentId} (${tournament.name}) ownership transferred to user ${targetUser.id} (${targetUser.email})`);
      res.json({ success: true, newOwnerEmail: targetUser.email, newOwnerDisplayName: targetUser.displayName });
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to transfer tournament ownership" });
      }
    }
  });

  // ── Collaborator routes ────────────────────────────────────────────────────

  // GET collaborators — owner or master admin only
  app.get("/api/tournaments/:id/collaborators", async (req: any, res) => {
    try {
      if (!req.sessionUser && !req.isMasterAdmin) {
        return res.status(403).json({ error: "Access denied: login required" });
      }
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });
      if (!req.isMasterAdmin && tournament.userId !== req.sessionUser?.userId) {
        return res.status(403).json({ error: "Access denied: owner only" });
      }
      const collaborators = await storage.getCollaborators(req.params.id);
      res.json(collaborators.map(({ passwordHash, ...u }) => u));
    } catch {
      res.status(500).json({ error: "Failed to fetch collaborators" });
    }
  });

  // POST add collaborator by email — owner or master admin only
  app.post("/api/tournaments/:id/collaborators", async (req: any, res) => {
    try {
      if (!req.sessionUser && !req.isMasterAdmin) {
        return res.status(403).json({ error: "Access denied: login required" });
      }
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });
      if (!req.isMasterAdmin && tournament.userId !== req.sessionUser?.userId) {
        return res.status(403).json({ error: "Access denied: owner only" });
      }
      const { email } = req.body;
      if (typeof email !== "string" || !email.trim()) {
        return res.status(400).json({ error: "A valid email address is required" });
      }
      const target = await storage.getUserByEmail(email.trim().toLowerCase());
      if (!target) return res.status(404).json({ error: `${email.trim()} does not have a PTM account. Get them to create one before setting them as a co-editor.` });
      if (target.isBlocked) return res.status(400).json({ error: "Cannot add a blocked user as co-editor" });
      if (target.id === tournament.userId) {
        return res.status(400).json({ error: "That user already owns this tournament" });
      }
      await storage.addCollaborator(req.params.id, target.id);
      const { passwordHash, ...safeUser } = target;
      res.status(201).json(safeUser);
    } catch {
      res.status(500).json({ error: "Failed to add co-editor" });
    }
  });

  // DELETE remove collaborator — owner or master admin only
  app.delete("/api/tournaments/:id/collaborators/:userId", async (req: any, res) => {
    try {
      if (!req.sessionUser && !req.isMasterAdmin) {
        return res.status(403).json({ error: "Access denied: login required" });
      }
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });
      if (!req.isMasterAdmin && tournament.userId !== req.sessionUser?.userId) {
        return res.status(403).json({ error: "Access denied: owner only" });
      }
      const removed = await storage.removeCollaborator(req.params.id, req.params.userId);
      if (!removed) return res.status(404).json({ error: "Co-editor not found" });
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "Failed to remove co-editor" });
    }
  });

  app.delete("/api/tournaments/:id", async (req: any, res) => {
    try {
      if (!req.isAdminAccess) {
        return res.status(403).json({ error: "Access denied: login required" });
      }
      if (!req.isMasterAdmin) {
        // Token-based access: token must match this tournament
        if (req.tokenTournamentId && req.params.id !== req.tokenTournamentId) {
          return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
        }
        // Session-based access: user must own this tournament
        if (req.sessionUser && !req.tokenTournamentId) {
          const tournament = await storage.getTournament(req.params.id);
          if (!tournament || tournament.userId !== req.sessionUser.userId) {
            return res.status(403).json({ error: "Access denied: you do not own this tournament" });
          }
        }
      }
      const deleted = await storage.deleteTournament(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete tournament" });
    }
  });

  // Check current token's access level
  app.get("/api/auth/check-access", async (req: any, res) => {
    res.json({
      isMasterAdmin: req.isMasterAdmin || false,
      isAdminAccess: req.isAdminAccess || false,
      isViewOnlyAccess: req.isViewOnlyAccess || false,
      tournamentId: req.tokenTournamentId || null,
      user: req.sessionUser ? {
        id: req.sessionUser.userId,
        email: req.sessionUser.email,
        displayName: req.sessionUser.displayName,
        isSystemAdmin: req.sessionUser.isSystemAdmin,
      } : null,
    });
  });

  // Master admin only: retrieve admin credentials for a tournament
  app.get("/api/tournaments/:id/admin-credentials", async (req: any, res) => {
    try {
      // CRITICAL: Only master admins can access this endpoint
      if (!req.isMasterAdmin) {
        console.warn(`[SECURITY] Unauthorized attempt to access admin credentials for tournament ${req.params.id}`);
        return res.status(403).json({ error: "Access denied: master admin access required" });
      }

      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      console.log(`[AUDIT] Master admin retrieved admin credentials for tournament ${req.params.id} (${tournament.name})`);
      
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      
      // Get or create short links for admin and view access
      let adminShortLink = await storage.getShortLinkForTournament(tournament.id, 'admin', 'home');
      if (!adminShortLink) {
        adminShortLink = await storage.createShortLink(tournament.id, 'admin', 'home');
      }
      
      let viewShortLink = await storage.getShortLinkForTournament(tournament.id, 'view', 'home');
      if (!viewShortLink) {
        viewShortLink = await storage.createShortLink(tournament.id, 'view', 'home');
      }
      
      res.json({
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        adminUrl: `${baseUrl}/s/${adminShortLink.code}`,
        viewUrl: `${baseUrl}/s/${viewShortLink.code}`
      });
    } catch (error) {
      console.error(`[ERROR] Failed to retrieve admin credentials:`, error);
      res.status(500).json({ error: "Failed to retrieve admin credentials" });
    }
  });

  // Rules PDF endpoints
  app.post("/api/tournaments/:id/rules", async (req: any, res) => {
    try {
      if (!req.isAdminAccess) return res.status(403).json({ error: "Access denied" });
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });
      if (!req.isMasterAdmin) {
        const isOwner = tournament.userId === req.sessionUser?.userId;
        const isCollab = !isOwner && await storage.isCollaborator(req.params.id, req.sessionUser?.userId);
        if (!isOwner && !isCollab) return res.status(403).json({ error: "Access denied" });
      }
      const { pdfData, pdfName } = req.body;
      if (!pdfData || !pdfName) return res.status(400).json({ error: "pdfData and pdfName are required" });
      if (typeof pdfData !== "string" || pdfData.length > 14_000_000) {
        return res.status(400).json({ error: "PDF too large (max ~7MB)" });
      }
      await storage.updateTournamentRules(req.params.id, pdfData, pdfName);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to save rules PDF" });
    }
  });

  app.get("/api/tournaments/:id/rules", async (req: any, res) => {
    try {
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament || !tournament.rulesPdfData) return res.status(404).json({ error: "No rules PDF found" });
      const pdf = Buffer.from(tournament.rulesPdfData, "base64");
      const filename = tournament.rulesPdfName || "rules.pdf";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
      res.setHeader("Content-Length", pdf.length);
      res.send(pdf);
    } catch (error) {
      res.status(500).json({ error: "Failed to retrieve rules PDF" });
    }
  });

  app.delete("/api/tournaments/:id/rules", async (req: any, res) => {
    try {
      if (!req.isAdminAccess) return res.status(403).json({ error: "Access denied" });
      const tournament = await storage.getTournament(req.params.id);
      if (!tournament) return res.status(404).json({ error: "Tournament not found" });
      if (!req.isMasterAdmin) {
        const isOwner = tournament.userId === req.sessionUser?.userId;
        const isCollab = !isOwner && await storage.isCollaborator(req.params.id, req.sessionUser?.userId);
        if (!isOwner && !isCollab) return res.status(403).json({ error: "Access denied" });
      }
      await storage.clearTournamentRules(req.params.id);
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove rules PDF" });
    }
  });

  app.post("/api/tournaments/:id/regenerate-token", async (req: any, res) => {
    try {
      // Require admin access or master admin for token regeneration
      if (!req.isAdminAccess && !req.isMasterAdmin) {
        return res.status(403).json({ error: "Access denied: admin token required" });
      }
      // Master admin can regenerate tokens for any tournament, otherwise verify tournament ownership
      if (!req.isMasterAdmin && req.params.id !== req.tokenTournamentId) {
        return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
      }
      const tournament = await storage.regenerateViewToken(req.params.id);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      res.json({ viewToken: tournament.viewToken });
    } catch (error) {
      res.status(500).json({ error: "Failed to regenerate token" });
    }
  });

  // Short link creation endpoint
  app.post("/api/short-links", async (req: any, res) => {
    try {
      const { tournamentId, accessType, targetPage } = req.body;
      
      if (!tournamentId || !targetPage) {
        return res.status(400).json({ error: "tournamentId and targetPage are required" });
      }
      
      // Only allow view access type for security (no admin short links from public API)
      const safeAccessType = 'view';
      
      // Enforce tournament-specific access when using tokens
      if (req.tokenTournamentId && tournamentId !== req.tokenTournamentId) {
        return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
      }
      
      // Verify the tournament exists before creating a short link
      const tournament = await storage.getTournament(tournamentId);
      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }
      
      // Check if a short link already exists for this combination
      let shortLink = await storage.getShortLinkForTournament(tournamentId, safeAccessType, targetPage);
      
      if (!shortLink) {
        // Create a new short link
        shortLink = await storage.createShortLink(tournamentId, safeAccessType, targetPage);
      }
      
      // Build the internal short URL
      const shareUrl = `${baseUrlOf(req)}/s/${shortLink.code}`;

      res.json({ 
        code: shortLink.code,
        shortUrl: shareUrl,
        targetPage: shortLink.targetPage
      });
    } catch (error) {
      console.error("[ERROR] Failed to create short link:", error);
      res.status(500).json({ error: "Failed to create short link" });
    }
  });

  // Team routes
  // Whether a team has paid is for organisers only: never sent to view-only visitors (e.g. captains)
  const forViewer = (req: any, team: Team) => {
    if (req.isAdminAccess) return team;
    const { feePaid: _hidden, ...rest } = team as Team & { feePaid?: boolean };
    return rest;
  };

  app.get("/api/teams", async (req: any, res) => {
    try {
      let tournamentId = req.query.tournamentId as string | undefined;
      
      // Enforce tournament-specific access when using tokens
      if (req.tokenTournamentId) {
        if (tournamentId && tournamentId !== req.tokenTournamentId) {
          return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
        }
        // Default to the token's tournament if no tournamentId specified
        tournamentId = req.tokenTournamentId;
      }
      
      const teams = await storage.getAllTeams(tournamentId);
      res.json(teams.map((t) => forViewer(req, t)));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch teams" });
    }
  });

  app.get("/api/teams/:id", async (req: any, res) => {
    try {
      const team = await storage.getTeam(req.params.id);
      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }
      // Enforce tournament-specific access when using tokens
      if (req.tokenTournamentId && team.tournamentId !== req.tokenTournamentId) {
        return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
      }
      res.json(forViewer(req, team));
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch team" });
    }
  });

  app.post("/api/teams", async (req: any, res) => {
    try {
      const validatedData = insertTeamSchema.parse(req.body);
      // Enforce tournament-specific access when using tokens
      if (req.tokenTournamentId && validatedData.tournamentId !== req.tokenTournamentId) {
        return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
      }
      const team = await storage.createTeam(validatedData);
      res.status(201).json(team);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to create team" });
      }
    }
  });

  app.patch("/api/teams/:id", async (req: any, res) => {
    try {
      // Load existing team first
      const existing = await storage.getTeam(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Team not found" });
      }
      // Verify existing tournament ownership
      if (req.tokenTournamentId && existing.tournamentId !== req.tokenTournamentId) {
        return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
      }
      const validatedData = insertTeamSchema.parse(req.body);
      // Also verify new tournament in payload
      if (req.tokenTournamentId && validatedData.tournamentId !== req.tokenTournamentId) {
        return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
      }
      const team = await storage.updateTeam(req.params.id, validatedData);
      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }
      res.json(team);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to update team" });
      }
    }
  });

  // Organisers tick a team's registration fee as paid (or not)
  app.patch("/api/teams/:id/paid", async (req: any, res) => {
    try {
      if (!req.isAdminAccess) return res.status(403).json({ error: "Access denied" });
      if (typeof req.body?.paid !== "boolean") return res.status(400).json({ error: "paid must be true or false" });
      const team = await storage.getTeam(req.params.id);
      if (!team) return res.status(404).json({ error: "Team not found" });
      if (req.tokenTournamentId && team.tournamentId !== req.tokenTournamentId) {
        return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
      }
      if (!req.isMasterAdmin && req.sessionUser && !req.tokenTournamentId) {
        const tournament = await storage.getTournament(team.tournamentId);
        const isOwner = tournament?.userId === req.sessionUser.userId;
        const isCollab = !isOwner && (await storage.isCollaborator(team.tournamentId, req.sessionUser.userId));
        if (!isOwner && !isCollab) return res.status(403).json({ error: "Access denied" });
      }
      const updated = await storage.setTeamFeePaid(team.id, req.body.paid);
      res.json(updated);
    } catch (error) {
      console.error("[TEAMS] Update paid failed:", error);
      res.status(500).json({ error: "Failed to update payment status" });
    }
  });

  app.get("/api/teams/:id/deletion-impact", async (req: any, res) => {
    try {
      // Load team first to verify ownership
      const team = await storage.getTeam(req.params.id);
      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }
      // Verify tournament ownership
      if (req.tokenTournamentId && team.tournamentId !== req.tokenTournamentId) {
        return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
      }
      const impact = await storage.getTeamDeletionImpact(req.params.id);
      res.json(impact);
    } catch (error) {
      res.status(500).json({ error: "Failed to get deletion impact" });
    }
  });

  app.delete("/api/teams/:id", async (req: any, res) => {
    try {
      // Load team first to verify ownership
      const team = await storage.getTeam(req.params.id);
      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }
      // Verify tournament ownership before deleting
      if (req.tokenTournamentId && team.tournamentId !== req.tokenTournamentId) {
        return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
      }
      const deleted = await storage.deleteTeam(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Team not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete team" });
    }
  });

  app.delete("/api/teams", async (req: any, res) => {
    try {
      // Require admin access for bulk team deletion
      if (!req.isAdminAccess) {
        return res.status(403).json({ error: "Access denied: admin token required" });
      }
      // Use token's tournament ID and reject mismatched query params
      const queryTournamentId = req.query.tournamentId as string | undefined;
      if (queryTournamentId && queryTournamentId !== req.tokenTournamentId) {
        return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
      }
      // Default to token's tournament if no query param provided
      const tournamentId = req.tokenTournamentId;
      await storage.deleteAllTeams(tournamentId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete all teams" });
    }
  });

  app.get("/api/matches", async (req: any, res) => {
    try {
      let tournamentId = req.query.tournamentId as string | undefined;
      
      // Enforce tournament-specific access when using tokens
      if (req.tokenTournamentId) {
        if (tournamentId && tournamentId !== req.tokenTournamentId) {
          return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
        }
        // Default to the token's tournament if no tournamentId specified
        tournamentId = req.tokenTournamentId;
      }
      
      const matches = await storage.getAllMatches(tournamentId);
      res.json(matches);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch matches" });
    }
  });

  app.get("/api/matches/:id", async (req: any, res) => {
    try {
      const match = await storage.getMatch(req.params.id);
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }
      // Verify tournament ownership
      if (req.tokenTournamentId && match.tournamentId !== req.tokenTournamentId) {
        return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
      }
      res.json(match);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch match" });
    }
  });

  app.post("/api/matches", async (req: any, res) => {
    try {
      const validatedData = insertMatchSchema.parse(req.body);
      // Verify tournament in payload
      if (req.tokenTournamentId && validatedData.tournamentId !== req.tokenTournamentId) {
        return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
      }
      const match = await storage.createMatch(validatedData);
      res.status(201).json(match);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to create match" });
      }
    }
  });

  app.post("/api/matches/generate", async (req, res) => {
    try {
      const tournamentId = req.body.tournamentId as string;
      
      if (!tournamentId) {
        return res.status(400).json({ error: "Tournament ID is required" });
      }

      // Get tournament configuration, teams, matches, and results
      const [tournament, teams, existingMatches, allResults] = await Promise.all([
        storage.getTournament(tournamentId),
        storage.getAllTeams(tournamentId),
        storage.getAllMatches(tournamentId),
        storage.getAllResults(tournamentId)
      ]);

      if (!tournament) {
        return res.status(404).json({ error: "Tournament not found" });
      }

      if (teams.length < 2) {
        return res.status(400).json({ 
          error: "Not enough teams. You need at least 2 teams to generate matches." 
        });
      }

      const warnings: string[] = [];
      let stageToGenerate: "initial" | "quarter-finals" | "semi-finals" | "finals" = "initial";
      let createdMatches: Match[] = [];
      let updatedMatches: Match[] = [];
      let skippedCount = 0;

      // Determine which stage to generate based on completed stages
      const initialMatches = existingMatches.filter(m => m.stage === "initial");
      const quarterMatches = existingMatches.filter(m => m.stage === "quarter-finals");
      const semiMatches = existingMatches.filter(m => m.stage === "semi-finals");
      const finalMatches = existingMatches.filter(m => m.stage === "finals");

      const initialComplete = initialMatches.length > 0 && initialMatches.every(m => m.status === "completed");
      const quarterComplete = quarterMatches.length > 0 && quarterMatches.every(m => m.status === "completed");
      const semiComplete = semiMatches.length > 0 && semiMatches.every(m => m.status === "completed");

      // Helper function to check if match exists between two teams
      const matchExists = (team1Id: string, team2Id: string, stage: string) => {
        return existingMatches.some(m => 
          m.stage === stage && 
          ((m.team1Id === team1Id && m.team2Id === team2Id) ||
           (m.team1Id === team2Id && m.team2Id === team1Id))
        );
      };

      // Check if there are teams with divisions that have no initial stage matches
      const teamsWithInitialMatches = new Set<string>();
      initialMatches.forEach(m => {
        teamsWithInitialMatches.add(m.team1Id);
        teamsWithInitialMatches.add(m.team2Id);
      });
      const teamsWithDivisions = teams.filter(t => t.division);
      const teamsWithoutMatches = teamsWithDivisions.filter(t => !teamsWithInitialMatches.has(t.id));
      const needsInitialGeneration = !initialComplete || teamsWithoutMatches.length > 0;

      // Determine what to generate
      if (needsInitialGeneration) {
        // Generate initial stage (or add missing matches if teams were added)
        stageToGenerate = "initial";
        
        let teamsWithoutDivision = 0;
        const teamsByDivision: Record<string, typeof teams> = {};
        
        teams.forEach(team => {
          if (!team.division) {
            teamsWithoutDivision++;
            return;
          }
          const div = team.division;
          if (!teamsByDivision[div]) {
            teamsByDivision[div] = [];
          }
          teamsByDivision[div].push(team);
        });

        if (teamsWithoutDivision > 0) {
          warnings.push(`${teamsWithoutDivision} team(s) without division assignment will be excluded from match generation.`);
        }

        // Generate round-robin matches within each division
        for (const division in teamsByDivision) {
          const divTeams = teamsByDivision[division];
          
          if (divTeams.length < 2) {
            warnings.push(`Division ${division} has only ${divTeams.length} team. Need at least 2 teams per division.`);
            continue;
          }

          for (let i = 0; i < divTeams.length; i++) {
            for (let j = i + 1; j < divTeams.length; j++) {
              // Check if match already exists
              if (matchExists(divTeams[i].id, divTeams[j].id, "initial")) {
                skippedCount++;
                continue;
              }

              const matchData = {
                tournamentId,
                team1Id: divTeams[i].id,
                team2Id: divTeams[j].id,
                stage: "initial" as const,
                status: "scheduled" as const,
                matchDate: null,
                team1Game1Score: null,
                team2Game1Score: null,
                team1Game2Score: null,
                team2Game2Score: null,
                team1Game3Score: null,
                team2Game3Score: null,
                winnerId: null,
              };

              const match = await storage.createMatch(matchData);
              createdMatches.push(match);
            }
          }
        }
      } else {
        // ── Knockout stages ────────────────────────────────────────────────
        // The current stage is the first enabled knockout stage that isn't complete.
        // Its teams come from the stage before it (the group stage for the first round).
        const stageMatches: Record<string, Match[]> = {
          initial: initialMatches,
          "quarter-finals": quarterMatches,
          "semi-finals": semiMatches,
          finals: finalMatches,
        };
        const isStageComplete = (stage: string) =>
          stageMatches[stage].length > 0 && stageMatches[stage].every(m => m.status === "completed");
        const stageSize: Record<KnockoutStage, number> = { "quarter-finals": 8, "semi-finals": 4, finals: 2 };
        const stageName: Record<KnockoutStage, string> = { "quarter-finals": "quarter-finals", "semi-finals": "semi-finals", finals: "final" };

        let sourceStage = "initial";
        let targetStage: KnockoutStage | null = null;
        for (const stage of knockoutStages(tournament)) {
          if (!isStageComplete(stage)) { targetStage = stage; break; }
          sourceStage = stage;
        }

        if (!targetStage) {
          warnings.push("No new matches to generate. All enabled tournament stages already have matches.");
        } else {
          stageToGenerate = targetStage;
          const size = stageSize[targetStage];

          // Work out the pairings (in bracket order) for the target stage
          const sourceResults = await storage.getResultsByStage(tournamentId, sourceStage);
          let pairings: Array<[Team, Team]> = [];
          let pairingError: string | null = null;
          if (sourceStage === "initial") {
            const seeded = selectAndSeedQualifiers(computeStandings(sourceResults, teams), size);
            if (seeded.length < size) {
              pairingError = `Not enough teams qualified. Need ${size} teams for the ${stageName[targetStage]}, but only ${seeded.length} teams have results.`;
            } else {
              pairings = firstRoundPairings(seeded);
            }
          } else {
            pairings = nextRoundPairings(stageMatches[sourceStage], sourceResults, teams, size);
            if (pairings.length * 2 < size) {
              pairingError = `Not enough teams qualified. Need ${size} teams for the ${stageName[targetStage]}.`;
            }
          }

          const createKnockoutMatches = async (into: Match[]) => {
            for (let i = 0; i < pairings.length; i++) {
              const [team1, team2] = pairings[i];
              const match = await storage.createMatch({
                tournamentId,
                team1Id: team1.id,
                team2Id: team2.id,
                stage: targetStage!,
                status: "scheduled" as const,
                matchDate: null,
                team1Game1Score: null,
                team2Game1Score: null,
                team1Game2Score: null,
                team2Game2Score: null,
                team1Game3Score: null,
                team2Game3Score: null,
                winnerId: null,
                bracketPosition: i,
              });
              into.push(match);
            }
          };

          const existing = stageMatches[targetStage];
          if (existing.length === 0) {
            // First time: create the stage
            if (pairingError) {
              return res.status(400).json({ error: pairingError });
            }
            await createKnockoutMatches(createdMatches);
          } else {
            // Stage already drawn: redraw only if nothing has been played and the draw has changed
            const played = existing.filter(m => m.status !== "scheduled");
            if (played.length > 0) {
              warnings.push(`Cannot update ${stageName[targetStage]} matches. ${played.length} match(es) already have results.`);
            } else if (pairingError) {
              warnings.push(`Cannot update ${stageName[targetStage]}. ${pairingError}`);
            } else {
              const pairKey = (a: string, b: string) => [a, b].sort().join("-");
              const existingByPosition = new Map(existing.map(m => [m.bracketPosition, pairKey(m.team1Id, m.team2Id)]));
              const drawChanged =
                existing.length !== pairings.length ||
                pairings.some(([a, b], i) => existingByPosition.get(i) !== pairKey(a.id, b.id));
              if (drawChanged) {
                for (const match of existing) {
                  await storage.deleteMatch(match.id);
                }
                await createKnockoutMatches(updatedMatches);
                warnings.push(`Updated ${stageName[targetStage]} matches based on the latest ${sourceStage === "initial" ? "group stage standings" : `${stageName[sourceStage as KnockoutStage]} results`}.`);
              } else {
                warnings.push(`No changes needed. ${stageName[targetStage]} matches already reflect current rankings.`);
              }
            }
          }
        }
      }

      res.json({
        created: createdMatches.length,
        updated: updatedMatches.length,
        skipped: skippedCount,
        warnings,
        stage: stageToGenerate,
        matches: [...createdMatches, ...updatedMatches]
      });
    } catch (error) {
      console.error("Error generating matches:", error);
      if (error instanceof Error) {
        res.status(500).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to generate matches" });
      }
    }
  });

  app.patch("/api/matches/:id/score", async (req: any, res) => {
    try {
      // Load existing match first
      const existing = await storage.getMatch(req.params.id);
      if (!existing) {
        return res.status(404).json({ error: "Match not found" });
      }
      // Verify tournament ownership before updating
      if (req.tokenTournamentId && existing.tournamentId !== req.tokenTournamentId) {
        return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
      }
      const validatedData = updateMatchScoreSchema.parse(req.body);
      const match = await storage.updateMatchScore(
        req.params.id,
        validatedData.team1Game1Score,
        validatedData.team2Game1Score,
        validatedData.team1Game2Score,
        validatedData.team2Game2Score,
        validatedData.team1Game3Score,
        validatedData.team2Game3Score,
        validatedData.matchDate ?? null,
        validatedData.team1NoShow ?? false,
        validatedData.team2NoShow ?? false,
        validatedData.pisteId ?? null
      );
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }
      res.json(match);
    } catch (error) {
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to update match score" });
      }
    }
  });

  app.get("/api/results", async (req: any, res) => {
    try {
      let tournamentId = req.query.tournamentId as string | undefined;
      
      // Enforce tournament-specific access when using tokens
      if (req.tokenTournamentId) {
        if (tournamentId && tournamentId !== req.tokenTournamentId) {
          return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
        }
        // Default to the token's tournament if no tournamentId specified
        tournamentId = req.tokenTournamentId;
      }
      
      const results = await storage.getAllResults(tournamentId);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch results" });
    }
  });

  app.delete("/api/results", async (req, res) => {
    try {
      const tournamentId = req.query.tournamentId as string | undefined;
      await storage.deleteAllResults(tournamentId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete results" });
    }
  });

  app.delete("/api/matches/:id", async (req: any, res) => {
    try {
      // Load match first to verify ownership
      const match = await storage.getMatch(req.params.id);
      if (!match) {
        return res.status(404).json({ error: "Match not found" });
      }
      // Verify tournament ownership before deleting
      if (req.tokenTournamentId && match.tournamentId !== req.tokenTournamentId) {
        return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
      }
      const deleted = await storage.deleteMatch(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Match not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete match" });
    }
  });

  app.delete("/api/matches", async (req: any, res) => {
    try {
      // Require admin access for bulk match deletion
      if (!req.isAdminAccess) {
        return res.status(403).json({ error: "Access denied: admin token required" });
      }
      // Use token's tournament ID and reject mismatched query params
      const queryTournamentId = req.query.tournamentId as string | undefined;
      if (queryTournamentId && queryTournamentId !== req.tokenTournamentId) {
        return res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
      }
      // Default to token's tournament if no query param provided
      const tournamentId = req.tokenTournamentId;
      await storage.deleteAllMatches(tournamentId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete all matches" });
    }
  });

  const emailPdfSchema = z.object({
    recipientEmail: z.string().email(),
    pdfBase64: z.string(),
    filename: z.string().optional().default("matches-report.pdf"),
  });

  app.post("/api/email-pdf", async (req, res) => {
    try {
      const validatedData = emailPdfSchema.parse(req.body);
      
      const { client, fromEmail } = await getUncachableResendClient();
      
      // Convert base64 to buffer
      const pdfBuffer = Buffer.from(validatedData.pdfBase64, 'base64');
      
      // Send email with PDF attachment
      const result = await client.emails.send({
        from: fromEmail,
        to: validatedData.recipientEmail,
        subject: "Pétanque Tournament - Matches Report",
        html: `
          <h2>Pétanque Tournament Matches Report</h2>
          <p>Please find attached the matches report generated on ${new Date().toLocaleDateString()}.</p>
          <p>This report contains all match information including schedules, scores, and results.</p>
          <br/>
          <p>Best regards,<br/>Pétanque Tournament Manager</p>
        `,
        attachments: [
          {
            filename: validatedData.filename,
            content: pdfBuffer,
          },
        ],
      });
      
      res.json({ success: true, emailId: result.data?.id });
    } catch (error) {
      console.error("Error sending email:", error);
      if (error instanceof Error) {
        res.status(400).json({ error: error.message });
      } else {
        res.status(500).json({ error: "Failed to send email" });
      }
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
