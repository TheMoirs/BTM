import crypto from 'crypto';
import type { Request, Response } from 'express';

export const SYSTEM_ADMIN_EMAIL = 'ali@themoirs.co.uk';
const COOKIE_NAME = 'btm_auth';
const TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionPayload {
  userId: string;
  email: string;
  displayName: string | null;
  isSystemAdmin: boolean;
  exp: number;
}

function getSecret(): string {
  return process.env.SESSION_SECRET || 'dev-secret-btm-change-in-prod';
}

export function createAuthToken(payload: Omit<SessionPayload, 'exp'>): string {
  const full: SessionPayload = { ...payload, exp: Date.now() + TOKEN_EXPIRY_MS };
  const data = Buffer.from(JSON.stringify(full)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

export function parseAuthToken(token: string): SessionPayload | null {
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return null;
  const data = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  try {
    const sigBuf = Buffer.from(sig, 'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length) return null;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString()) as SessionPayload;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function setAuthCookie(res: Response, payload: Omit<SessionPayload, 'exp'>): void {
  res.cookie(COOKIE_NAME, createAuthToken(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TOKEN_EXPIRY_MS,
    path: '/',
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

export function getSessionFromRequest(req: Request): SessionPayload | null {
  const cookies = (req as any).cookies;
  const token = cookies?.[COOKIE_NAME];
  if (!token) return null;
  return parseAuthToken(token);
}

// ── Accounts without a BTM password ─────────────────────────────────────────
// Accounts created through Google sign-in (or the old Clerk login) store a
// placeholder instead of a bcrypt hash. They can sign in with Google, or set a
// password via "Forgot password".
export const GOOGLE_ONLY_PASSWORD = '__GOOGLE_AUTH__';

export function hasUsablePassword(passwordHash: string | null | undefined): boolean {
  return !!passwordHash && !passwordHash.startsWith('__');
}

// ── Password reset links ────────────────────────────────────────────────────
// Signed, expiring token. It includes a fingerprint of the current password
// hash, so a link stops working once it has been used (or the password changes).
const RESET_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function passwordFingerprint(passwordHash: string): string {
  return crypto.createHash('sha256').update(passwordHash).digest('base64url').slice(0, 16);
}

export function createResetToken(userId: string, passwordHash: string): string {
  const payload = { purpose: 'reset', userId, fp: passwordFingerprint(passwordHash), exp: Date.now() + RESET_EXPIRY_MS };
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  return `${data}.${sig}`;
}

/** Decode a reset token. The caller must still check `fp` against the user's current password hash. */
export function decodeResetToken(token: string): { userId: string; fp: string } | null {
  const lastDot = token.lastIndexOf('.');
  if (lastDot === -1) return null;
  const data = token.slice(0, lastDot);
  const sig = token.slice(lastDot + 1);
  const expected = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  try {
    const a = Buffer.from(sig, 'base64url');
    const b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (payload.purpose !== 'reset' || payload.exp < Date.now()) return null;
    return { userId: payload.userId, fp: payload.fp };
  } catch {
    return null;
  }
}

export function resetTokenMatches(fp: string, passwordHash: string): boolean {
  return passwordFingerprint(passwordHash) === fp;
}

// ── Team registration edit links ─────────────────────────────────────────
// Sent in the registration confirmation email so a captain can reopen the form
// with their details filled in. "<teamId>.<signature>": the signature stops
// anyone editing a team just by guessing or changing the id.
function teamEditSignature(teamId: string): string {
  return crypto.createHmac('sha256', getSecret()).update(`team-edit:${teamId}`).digest('base64url').slice(0, 22);
}

export function createTeamEditCode(teamId: string): string {
  return `${teamId}.${teamEditSignature(teamId)}`;
}

/** The team id an edit code belongs to, or null if the code isn't genuine. */
export function readTeamEditCode(code: string): string | null {
  const dot = code.lastIndexOf('.');
  if (dot <= 0) return null;
  const teamId = code.slice(0, dot);
  const a = Buffer.from(code.slice(dot + 1));
  const b = Buffer.from(teamEditSignature(teamId));
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? teamId : null;
}
