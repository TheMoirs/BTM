import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { storage } from "./storage";
import { getSessionFromRequest, clearAuthCookie, SYSTEM_ADMIN_EMAIL } from "./sessionAuth";

export interface SessionUser {
  userId: string;
  email: string;
  displayName: string | null;
  isSystemAdmin: boolean;
}

export interface TokenRequest extends Request {
  isViewOnlyAccess?: boolean;
  isAdminAccess?: boolean;
  isMasterAdmin?: boolean;
  tokenTournamentId?: string;
  sessionUser?: SessionUser;
}

async function jitProvisionClerkUser(clerkUserId: string) {
  try {
    const clerkUser = await clerkClient.users.getUser(clerkUserId);
    const email = clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase();
    const displayName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null;
    if (!email) return null;
    let user = await storage.getUserByEmail(email);
    if (user) {
      if (!user.clerkUserId) await storage.updateUserClerkId(user.id, clerkUserId);
      return user;
    }
    try {
      return await storage.createUserFromClerk(email, clerkUserId, displayName, email === SYSTEM_ADMIN_EMAIL);
    } catch {
      return await storage.getUserByEmail(email) ?? null;
    }
  } catch (e) {
    console.error('[CLERK] JIT provision error:', e);
    return null;
  }
}

export async function validateTokenMiddleware(
  req: TokenRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // ── 0. Check Clerk session (social / email via Clerk) ──────────────────
  const { userId: clerkUserId } = getAuth(req as any);
  if (clerkUserId) {
    let user = await storage.getUserByClerkId(clerkUserId);
    if (!user) user = await jitProvisionClerkUser(clerkUserId) ?? undefined;
    if (user) {
      if (user.isBlocked) {
        res.status(401).json({ error: "Your account has been blocked. Please contact the administrator." });
        return;
      }
      req.sessionUser = { userId: user.id, email: user.email, displayName: user.displayName, isSystemAdmin: user.isSystemAdmin };
      if (user.isSystemAdmin) {
        req.isMasterAdmin = true;
        req.isAdminAccess = true;
        req.isViewOnlyAccess = false;
        next();
        return;
      }
    }
  }

  // ── 1. Check session cookie (email-based login) ────────────────────────
  const session = getSessionFromRequest(req);
  if (session) {
    const user = await storage.getUserById(session.userId);
    if (!user) {
      // User was deleted — clear stale cookie and continue unauthenticated
      clearAuthCookie(res);
    } else if (user.isBlocked) {
      clearAuthCookie(res);
      res.status(401).json({ error: "Your account has been blocked. Please contact the administrator." });
      return;
    } else {
      req.sessionUser = {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        isSystemAdmin: user.isSystemAdmin,
      };
      if (user.isSystemAdmin) {
        // System admin via email login = full master admin access
        req.isMasterAdmin = true;
        req.isAdminAccess = true;
        req.isViewOnlyAccess = false;
        next();
        return;
      }
    }
  }

  // ── 2. No URL token — check if session user covers write access ────────
  const token = (req.query.token as string || '').trim();
  if (!token) {
    if (req.sessionUser) {
      // Regular logged-in user — has admin-level access to their own resources.
      // Per-resource ownership is enforced inside each route handler.
      req.isAdminAccess = true;
      req.isViewOnlyAccess = false;
      next();
      return;
    }

    // No auth at all — read-only with limited write exceptions
    req.isViewOnlyAccess = true;
    const method = req.method.toUpperCase();
    const isCreatingShortLink = method === "POST" && req.path === "/api/short-links";

    if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") {
      if (!isCreatingShortLink) {
        res.status(403).json({ error: "Write operations require authentication" });
        return;
      }
    }
    next();
    return;
  }

  // ── 4. Validate tournament-specific token ──────────────────────────────
  try {
    const result = await storage.getTournamentByToken(token);

    if (!result) {
      console.warn(`[TOKEN_VALIDATION_FAILED] Invalid token lookup - token: ${token.substring(0, 8)}..., path: ${req.path}, method: ${req.method}`);
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    console.log(`[TOKEN_VALIDATION_SUCCESS] Token validated - tournament: ${result.tournament.id}, type: ${result.isAdmin ? 'admin' : 'view'}, path: ${req.path}`);

    const { tournament, isAdmin } = result;
    req.tokenTournamentId = tournament.id;

    if (isAdmin) {
      req.isAdminAccess = true;
      req.isViewOnlyAccess = false;
    } else {
      req.isViewOnlyAccess = true;
      req.isAdminAccess = false;

      const method = req.method.toUpperCase();
      const isCreatingShortLink = method === "POST" && req.path === "/api/short-links";

      if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") {
        if (!isCreatingShortLink) {
          res.status(403).json({ error: "Write operations are not allowed in view-only mode" });
          return;
        }
      }
    }

    next();
  } catch (error) {
    console.error(`[TOKEN_VALIDATION_ERROR] Unexpected error validating token: ${error instanceof Error ? error.message : error}`);
    res.status(500).json({ error: "Internal server error during token validation" });
  }
}
