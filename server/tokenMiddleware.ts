import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import { masterAdminSessions } from "./masterAdminSessions";

export interface TokenRequest extends Request {
  isViewOnlyAccess?: boolean;
  isAdminAccess?: boolean;
  isMasterAdmin?: boolean;
  tokenTournamentId?: string;
}

export async function validateTokenMiddleware(
  req: TokenRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = (req.query.token as string || '').trim();

  // Check for master admin session
  if (token && token.startsWith('master_')) {
    if (masterAdminSessions.validateSession(token)) {
      req.isMasterAdmin = true;
      req.isAdminAccess = true;
      req.isViewOnlyAccess = false;
      // Master admin has access to all tournaments, no restriction
      next();
      return;
    } else {
      // Invalid or expired master admin token
      console.warn(`[SECURITY] Invalid or expired master admin token attempted: ${token.substring(0, 16)}...`);
      res.status(401).json({ error: "Invalid or expired master admin session" });
      return;
    }
  }

  if (!token) {
    // No token = default read-only access (except tournament creation for initial setup)
    req.isViewOnlyAccess = true;
    const method = req.method.toUpperCase();
    const isCreatingTournament = method === "POST" && req.path === "/api/tournaments";
    const isCreatingShortLink = method === "POST" && req.path === "/api/short-links";
    
    if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") {
      // Allow POST /api/tournaments without token (initial tournament creation)
      // Allow POST /api/short-links for sharing (read-only operation that creates a share link)
      if (!isCreatingTournament && !isCreatingShortLink) {
        res.status(403).json({ error: "Write operations require admin access" });
        return;
      }
    }
    next();
    return;
  }

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
      // Admin token = full access to this tournament only
      req.isAdminAccess = true;
      req.isViewOnlyAccess = false;
    } else {
      // View token = read-only access to this tournament only
      req.isViewOnlyAccess = true;
      req.isAdminAccess = false;
      
      const method = req.method.toUpperCase();
      const isCreatingShortLink = method === "POST" && req.path === "/api/short-links";
      
      if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") {
        // Allow POST /api/short-links for sharing (read-only operation that creates a share link)
        if (!isCreatingShortLink) {
          res.status(403).json({ error: "Write operations are not allowed in view-only mode" });
          return;
        }
      }
    }

    // Tournament-specific access will be enforced at the route handler level
    // where we can properly identify the resource's tournament
    next();
  } catch (error) {
    console.error(`[TOKEN_VALIDATION_ERROR] Unexpected error validating token: ${error instanceof Error ? error.message : error}`);
    res.status(500).json({ error: "Internal server error during token validation" });
  }
}
