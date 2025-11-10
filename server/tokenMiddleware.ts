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
  const token = req.query.token as string | undefined;

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
      res.status(401).json({ error: "Invalid or expired master admin session" });
      return;
    }
  }

  if (!token) {
    // No token = default read-only access (except tournament creation for initial setup)
    req.isViewOnlyAccess = true;
    const method = req.method.toUpperCase();
    const isCreatingTournament = method === "POST" && req.path === "/api/tournaments";
    
    if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") {
      // Allow POST /api/tournaments without token (initial tournament creation)
      if (!isCreatingTournament) {
        res.status(403).json({ error: "Write operations require admin access" });
        return;
      }
    }
    next();
    return;
  }

  const result = await storage.getTournamentByToken(token);
  
  if (!result) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

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
    if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") {
      res.status(403).json({ error: "Write operations are not allowed in view-only mode" });
      return;
    }
  }

  // Tournament-specific access will be enforced at the route handler level
  // where we can properly identify the resource's tournament
  next();
}
