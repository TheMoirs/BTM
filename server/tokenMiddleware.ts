import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";

export interface TokenRequest extends Request {
  isViewOnlyAccess?: boolean;
  viewOnlyTournamentId?: string;
}

export async function validateTokenMiddleware(
  req: TokenRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.query.token as string | undefined;

  if (!token) {
    next();
    return;
  }

  const tournament = await storage.getTournamentByToken(token);
  
  if (!tournament) {
    res.status(401).json({ error: "Invalid view token" });
    return;
  }

  req.isViewOnlyAccess = true;
  req.viewOnlyTournamentId = tournament.id;

  const method = req.method.toUpperCase();
  if (method === "POST" || method === "PATCH" || method === "PUT" || method === "DELETE") {
    res.status(403).json({ error: "Write operations are not allowed in view-only mode" });
    return;
  }

  const requestedTournamentId = req.query.tournamentId as string | undefined 
    || req.params.id 
    || req.body?.tournamentId;

  if (requestedTournamentId && requestedTournamentId !== tournament.id) {
    res.status(403).json({ error: "Access denied: token is only valid for a specific tournament" });
    return;
  }

  next();
}
