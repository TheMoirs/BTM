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
