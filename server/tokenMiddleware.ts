import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { masterAdminSessions } from "./masterAdminSessions";
import { getSessionFromRequest, clearAuthCookie } from "./sessionAuth";

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

export async function validateTokenMiddleware(
  req: TokenRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
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

  // ── 2. Check URL-based master admin session token ──────────────────────
  const token = (req.query.token as string || '').trim();

  if (token && token.startsWith('master_')) {
    if (masterAdminSessions.validateSession(token)) {
      req.isMasterAdmin = true;
      req.isAdminAccess = true;
      req.isViewOnlyAccess = false;
      next();
      return;
    } else {
      console.warn(`[SECURITY] Invalid or expired master admin token attempted: ${token.substring(0, 16)}...`);
      res.status(401).json({ error: "Invalid or expired master admin session" });
      return;
    }
  }

  // ── 3. No URL token — check if session user covers write access ────────
  if (!token) {
    if (req.sessionUser) {
      // Regular logged-in user — route handlers enforce per-resource ownership
      req.isAdminAccess = false;
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
