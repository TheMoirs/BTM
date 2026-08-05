import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertTeamSchema, insertMatchSchema, updateMatchScoreSchema, insertTournamentSchema, type Team, type Match, type Result, type Tournament } from "@shared/schema";
import { getUncachableResendClient } from "./resend";
import { z } from "zod";
import { validateTokenMiddleware } from "./tokenMiddleware";
import { getAuth, clerkClient } from "@clerk/express";
import bcrypt from "bcryptjs";
import { setAuthCookie, clearAuthCookie, getSessionFromRequest, SYSTEM_ADMIN_EMAIL } from "./sessionAuth";

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
      if (existing) return res.status(409).json({ error: "An account with this email already exists" });

      const isSystemAdmin = normalizedEmail === SYSTEM_ADMIN_EMAIL;
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await storage.createUser(normalizedEmail, passwordHash, displayName?.trim() || null, isSystemAdmin);

      setAuthCookie(res, { userId: user.id, email: user.email, displayName: user.displayName, isSystemAdmin: user.isSystemAdmin });
      console.log(`[AUTH] Registered: ${user.email} (sysAdmin: ${isSystemAdmin})`);
      res.status(201).json({ user: { id: user.id, email: user.email, displayName: user.displayName, isSystemAdmin: user.isSystemAdmin } });
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

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return res.status(401).json({ error: "Invalid email or password" });

      const isSystemAdmin = user.email === SYSTEM_ADMIN_EMAIL || user.isSystemAdmin;
      setAuthCookie(res, { userId: user.id, email: user.email, displayName: user.displayName, isSystemAdmin });
      console.log(`[AUTH] Login: ${user.email}`);
      res.json({ user: { id: user.id, email: user.email, displayName: user.displayName, isSystemAdmin } });
    } catch (error) {
      console.error("[AUTH] Login error:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  app.post("/api/auth/logout", async (_req, res) => {
    clearAuthCookie(res);
    res.json({ success: true });
  });

  app.patch("/api/auth/profile", async (req: any, res) => {
    try {
      const { userId: clerkUserId } = getAuth(req);
      let targetUser: Awaited<ReturnType<typeof storage.getUserById>>;

      if (clerkUserId) {
        targetUser = await storage.getUserByClerkId(clerkUserId);
      } else {
        const session = getSessionFromRequest(req);
        if (!session) return res.status(401).json({ error: "Not authenticated" });
        targetUser = await storage.getUserById(session.userId);
      }

      if (!targetUser || targetUser.isBlocked) return res.status(401).json({ error: "User not found or blocked" });

      const { displayName } = req.body;
      const trimmed = typeof displayName === "string" ? displayName.trim() : null;

      const updated = await storage.updateUserProfile(targetUser.id, trimmed || null);
      if (!updated) return res.status(500).json({ error: "Failed to update profile" });

      // Only refresh legacy cookie when not using Clerk
      if (!clerkUserId) {
        setAuthCookie(res, { userId: updated.id, email: updated.email, displayName: updated.displayName, isSystemAdmin: updated.isSystemAdmin });
      }
      console.log(`[AUTH] Display name updated for: ${updated.email}`);
      res.json({ user: { id: updated.id, email: updated.email, displayName: updated.displayName, isSystemAdmin: updated.isSystemAdmin } });
    } catch (error) {
      console.error("[AUTH] Update profile error:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  app.patch("/api/auth/password", async (req, res) => {
    try {
      const session = getSessionFromRequest(req);
      if (!session) return res.status(401).json({ error: "Not authenticated" });

      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) return res.status(400).json({ error: "Current and new password are required" });
      if (newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });

      const user = await storage.getUserById(session.userId);
      if (!user || user.isBlocked) return res.status(401).json({ error: "User not found or blocked" });

      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) return res.status(400).json({ error: "Current password is incorrect" });

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
      // Check Clerk session first
      const { userId: clerkUserId } = getAuth(req);
      if (clerkUserId) {
        let user = await storage.getUserByClerkId(clerkUserId);
        if (!user) {
          // JIT provision on first /api/auth/user call after social sign-in
          try {
            const clerkUser = await clerkClient.users.getUser(clerkUserId);
            const email = clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase();
            const displayName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ') || null;
            if (email) {
              user = await storage.getUserByEmail(email) ?? undefined;
              if (user) {
                if (!user.clerkUserId) await storage.updateUserClerkId(user.id, clerkUserId);
              } else {
                try {
                  user = await storage.createUserFromClerk(email, clerkUserId, displayName, email === SYSTEM_ADMIN_EMAIL);
                } catch {
                  user = await storage.getUserByEmail(email) ?? undefined;
                }
              }
            }
          } catch (e) {
            console.error('[CLERK] JIT provision in /api/auth/user:', e);
          }
        }
        if (user && !user.isBlocked) {
          return res.json({ user: { id: user.id, email: user.email, displayName: user.displayName, isSystemAdmin: user.isSystemAdmin } });
        }
        return res.json({ user: null });
      }
      // Legacy cookie fallback
      const session = getSessionFromRequest(req);
      if (!session) return res.json({ user: null });
      const user = await storage.getUserById(session.userId);
      if (!user || user.isBlocked) { clearAuthCookie(res); return res.json({ user: null }); }
      res.json({ user: { id: user.id, email: user.email, displayName: user.displayName, isSystemAdmin: user.isSystemAdmin } });
    } catch {
      res.status(500).json({ error: "Failed to get user" });
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
        return res.status(404).json({ error: `No user found with email "${email.trim()}"` });
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
      if (!target) return res.status(404).json({ error: `No user found with email "${email.trim()}"` });
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
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const shareUrl = `${baseUrl}/s/${shortLink.code}`;

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
      res.json(teams);
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
      res.json(team);
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

  // Helper function to calculate team rankings from results
  function calculateTeamRankings(results: Result[], teams: Team[]): Array<{ team: Team; points: number; scoreDifference: number; gamesPlayed: number }> {
    const teamMap = new Map(teams.map(t => [t.id, t]));
    const rankings = new Map<string, { points: number; scoreDifference: number; gamesPlayed: number }>();
    
    results.forEach(result => {
      const teamId = teams.find(t => t.name === result.teamName)?.id;
      if (!teamId) return;
      
      if (!rankings.has(teamId)) {
        rankings.set(teamId, { points: 0, scoreDifference: 0, gamesPlayed: 0 });
      }
      
      const ranking = rankings.get(teamId)!;
      ranking.points += result.points;
      ranking.scoreDifference += result.scoreDifference;
      ranking.gamesPlayed += result.gamesPlayed;
    });
    
    return Array.from(rankings.entries())
      .map(([teamId, stats]) => ({
        team: teamMap.get(teamId)!,
        ...stats
      }))
      .filter(r => r.team) // Filter out any teams not found
      .sort((a, b) => {
        // Sort by points first, then by score difference
        if (b.points !== a.points) return b.points - a.points;
        return b.scoreDifference - a.scoreDifference;
      });
  }

  // Helper function to select top teams based on division count
  function selectTopTeams(
    rankings: Array<{ team: Team; points: number; scoreDifference: number; gamesPlayed: number }>,
    numberOfDivisions: number,
    targetCount: 8 | 4 | 2,
    fromPlayoffStage: boolean = false
  ): Team[] {
    // If selecting from playoff stage, always use overall rankings (divisions no longer matter)
    if (fromPlayoffStage) {
      return rankings.slice(0, targetCount).map(r => r.team);
    }

    // Otherwise, use division-based selection (for initial stage)
    // Group rankings by division
    const divisionRankings = new Map<string, typeof rankings>();
    rankings.forEach(rank => {
      const div = rank.team.division || '';
      if (!divisionRankings.has(div)) {
        divisionRankings.set(div, []);
      }
      divisionRankings.get(div)!.push(rank);
    });

    // Sort divisions by size (descending), then alphabetically
    const sortedDivisions = Array.from(divisionRankings.keys()).sort((a, b) => {
      const sizeA = divisionRankings.get(a)!.length;
      const sizeB = divisionRankings.get(b)!.length;
      if (sizeB !== sizeA) return sizeB - sizeA;
      return a.localeCompare(b);
    });

    const selectedTeams: Team[] = [];

    if (targetCount === 8) {
      // Quarter-finals: Select 8 teams
      if (numberOfDivisions === 1) {
        // Top 8 from single division
        selectedTeams.push(...rankings.slice(0, 8).map(r => r.team));
      } else if (numberOfDivisions === 2) {
        // Top 4 from each division
        sortedDivisions.slice(0, 2).forEach(div => {
          const divRankings = divisionRankings.get(div)!;
          selectedTeams.push(...divRankings.slice(0, 4).map(r => r.team));
        });
      } else if (numberOfDivisions === 3) {
        // Top 4 from largest/first division, top 2 from other two
        const primaryDiv = sortedDivisions[0];
        selectedTeams.push(...divisionRankings.get(primaryDiv)!.slice(0, 4).map(r => r.team));
        
        sortedDivisions.slice(1, 3).forEach(div => {
          const divRankings = divisionRankings.get(div)!;
          selectedTeams.push(...divRankings.slice(0, 2).map(r => r.team));
        });
      } else if (numberOfDivisions >= 4) {
        // Top 2 from each of first 4 divisions
        sortedDivisions.slice(0, 4).forEach(div => {
          const divRankings = divisionRankings.get(div)!;
          selectedTeams.push(...divRankings.slice(0, 2).map(r => r.team));
        });
      }
    } else if (targetCount === 4) {
      // Semi-finals: Select 4 teams
      if (numberOfDivisions === 1) {
        // Top 4 from single division
        selectedTeams.push(...rankings.slice(0, 4).map(r => r.team));
      } else {
        // Top 2 from each of the first 2 divisions
        sortedDivisions.slice(0, 2).forEach(div => {
          const divRankings = divisionRankings.get(div)!;
          selectedTeams.push(...divRankings.slice(0, 2).map(r => r.team));
        });
      }
    } else if (targetCount === 2) {
      // Finals: Select 2 teams
      if (numberOfDivisions === 1) {
        // Top 2 from single division
        selectedTeams.push(...rankings.slice(0, 2).map(r => r.team));
      } else {
        // Top 1 from each of the first 2 divisions
        sortedDivisions.slice(0, 2).forEach(div => {
          const divRankings = divisionRankings.get(div)!;
          selectedTeams.push(...divRankings.slice(0, 1).map(r => r.team));
        });
      }
    }

    return selectedTeams.slice(0, targetCount); // Ensure we don't exceed target
  }

  // Helper function to create traditional seeded pairings
  function createTraditionalPairings(teams: Team[]): Array<[Team, Team]> {
    const pairings: Array<[Team, Team]> = [];
    const count = teams.length;
    
    if (count === 8) {
      // Quarter-finals: 1v8, 2v7, 3v6, 4v5
      pairings.push([teams[0], teams[7]]);
      pairings.push([teams[1], teams[6]]);
      pairings.push([teams[2], teams[5]]);
      pairings.push([teams[3], teams[4]]);
    } else if (count === 4) {
      // Semi-finals: 1v4, 2v3
      pairings.push([teams[0], teams[3]]);
      pairings.push([teams[1], teams[2]]);
    } else if (count === 2) {
      // Finals: 1v2
      pairings.push([teams[0], teams[1]]);
    }
    
    return pairings;
  }

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
      } else if (initialComplete && tournament.hasQuarterFinals && quarterMatches.length === 0) {
        // Generate quarter-finals
        stageToGenerate = "quarter-finals";
        const initialResults = await storage.getResultsByStage(tournamentId, "initial");
        const rankings = calculateTeamRankings(initialResults, teams);
        const topTeams = selectTopTeams(rankings, tournament.numberOfDivisions, 8);

        if (topTeams.length < 8) {
          return res.status(400).json({ 
            error: `Not enough teams qualified. Need 8 teams for quarter-finals, but only ${topTeams.length} teams have results.` 
          });
        }

        const pairings = createTraditionalPairings(topTeams);
        for (const [team1, team2] of pairings) {
          const matchData = {
            tournamentId,
            team1Id: team1.id,
            team2Id: team2.id,
            stage: "quarter-finals" as const,
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
      } else if (quarterComplete && tournament.hasSemiFinals && semiMatches.length === 0) {
        // Generate semi-finals from quarter-finals
        stageToGenerate = "semi-finals";
        const quarterResults = await storage.getResultsByStage(tournamentId, "quarter-finals");
        const rankings = calculateTeamRankings(quarterResults, teams);
        const topTeams = selectTopTeams(rankings, tournament.numberOfDivisions, 4, true);

        if (topTeams.length < 4) {
          return res.status(400).json({ 
            error: `Not enough teams qualified. Need 4 teams for semi-finals, but only ${topTeams.length} teams have results.` 
          });
        }

        const pairings = createTraditionalPairings(topTeams);
        for (const [team1, team2] of pairings) {
          const matchData = {
            tournamentId,
            team1Id: team1.id,
            team2Id: team2.id,
            stage: "semi-finals" as const,
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
      } else if (initialComplete && !tournament.hasQuarterFinals && tournament.hasSemiFinals && semiMatches.length === 0) {
        // Generate semi-finals directly from initial stage (skip quarter-finals)
        stageToGenerate = "semi-finals";
        const initialResults = await storage.getResultsByStage(tournamentId, "initial");
        const rankings = calculateTeamRankings(initialResults, teams);
        const topTeams = selectTopTeams(rankings, tournament.numberOfDivisions, 4);

        if (topTeams.length < 4) {
          return res.status(400).json({ 
            error: `Not enough teams qualified. Need 4 teams for semi-finals, but only ${topTeams.length} teams have results.` 
          });
        }

        const pairings = createTraditionalPairings(topTeams);
        for (const [team1, team2] of pairings) {
          const matchData = {
            tournamentId,
            team1Id: team1.id,
            team2Id: team2.id,
            stage: "semi-finals" as const,
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
      } else if (semiComplete && tournament.hasFinals && finalMatches.length === 0) {
        // Generate finals
        stageToGenerate = "finals";
        const semiResults = await storage.getResultsByStage(tournamentId, "semi-finals");
        const rankings = calculateTeamRankings(semiResults, teams);
        const topTeams = selectTopTeams(rankings, tournament.numberOfDivisions, 2, true);

        if (topTeams.length < 2) {
          return res.status(400).json({ 
            error: `Not enough teams qualified. Need 2 teams for finals, but only ${topTeams.length} teams have results.` 
          });
        }

        const pairings = createTraditionalPairings(topTeams);
        for (const [team1, team2] of pairings) {
          const matchData = {
            tournamentId,
            team1Id: team1.id,
            team2Id: team2.id,
            stage: "finals" as const,
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
      } else if (initialComplete && !tournament.hasQuarterFinals && !tournament.hasSemiFinals && tournament.hasFinals && finalMatches.length === 0) {
        // Generate finals directly from initial stage
        stageToGenerate = "finals";
        const initialResults = await storage.getResultsByStage(tournamentId, "initial");
        const rankings = calculateTeamRankings(initialResults, teams);
        const topTeams = selectTopTeams(rankings, tournament.numberOfDivisions, 2);

        if (topTeams.length < 2) {
          return res.status(400).json({ 
            error: `Not enough teams qualified. Need 2 teams for finals, but only ${topTeams.length} teams have results.` 
          });
        }

        const pairings = createTraditionalPairings(topTeams);
        for (const [team1, team2] of pairings) {
          const matchData = {
            tournamentId,
            team1Id: team1.id,
            team2Id: team2.id,
            stage: "finals" as const,
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
      } else if (quarterComplete && !tournament.hasSemiFinals && tournament.hasFinals && finalMatches.length === 0) {
        // Generate finals from quarter-finals (skip semi-finals)
        stageToGenerate = "finals";
        const quarterResults = await storage.getResultsByStage(tournamentId, "quarter-finals");
        const rankings = calculateTeamRankings(quarterResults, teams);
        const topTeams = selectTopTeams(rankings, tournament.numberOfDivisions, 2, true);

        if (topTeams.length < 2) {
          return res.status(400).json({ 
            error: `Not enough teams qualified. Need 2 teams for finals, but only ${topTeams.length} teams have results.` 
          });
        }

        const pairings = createTraditionalPairings(topTeams);
        for (const [team1, team2] of pairings) {
          const matchData = {
            tournamentId,
            team1Id: team1.id,
            team2Id: team2.id,
            stage: "finals" as const,
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
      } else {
        // Check if we should update existing playoff matches due to ranking changes
        let checkForUpdates = false;
        let sourceStage = "";
        let targetStage: "quarter-finals" | "semi-finals" | "finals" = "quarter-finals";
        let targetMatches: Match[] = [];
        let targetCount: 8 | 4 | 2 = 8;

        // Determine which stage to check for updates
        if (quarterMatches.length > 0 && !quarterComplete && initialComplete) {
          checkForUpdates = true;
          sourceStage = "initial";
          targetStage = "quarter-finals";
          targetMatches = quarterMatches;
          targetCount = 8;
        } else if (semiMatches.length > 0 && !semiComplete && quarterComplete) {
          checkForUpdates = true;
          sourceStage = "quarter-finals";
          targetStage = "semi-finals";
          targetMatches = semiMatches;
          targetCount = 4;
        } else if (semiMatches.length > 0 && !semiComplete && initialComplete && !tournament.hasQuarterFinals) {
          checkForUpdates = true;
          sourceStage = "initial";
          targetStage = "semi-finals";
          targetMatches = semiMatches;
          targetCount = 4;
        } else if (finalMatches.length > 0 && semiComplete) {
          checkForUpdates = true;
          sourceStage = "semi-finals";
          targetStage = "finals";
          targetMatches = finalMatches;
          targetCount = 2;
        } else if (finalMatches.length > 0 && quarterComplete && !tournament.hasSemiFinals) {
          checkForUpdates = true;
          sourceStage = "quarter-finals";
          targetStage = "finals";
          targetMatches = finalMatches;
          targetCount = 2;
        } else if (finalMatches.length > 0 && initialComplete && !tournament.hasQuarterFinals && !tournament.hasSemiFinals) {
          checkForUpdates = true;
          sourceStage = "initial";
          targetStage = "finals";
          targetMatches = finalMatches;
          targetCount = 2;
        }

        if (checkForUpdates && sourceStage && targetMatches.length > 0) {
          stageToGenerate = targetStage;
          
          // Check if any matches have been played (have results or are not scheduled)
          const matchesWithResults = targetMatches.filter(m => m.status !== "scheduled");
          
          if (matchesWithResults.length > 0) {
            warnings.push(`Cannot update ${targetStage} matches. ${matchesWithResults.length} match(es) already have results.`);
          } else {
            // Get rankings from source stage
            const sourceResults = await storage.getResultsByStage(tournamentId, sourceStage);
            const rankings = calculateTeamRankings(sourceResults, teams);
            // Use playoff logic if source is a playoff stage (not initial)
            const isFromPlayoff = sourceStage !== "initial";
            const topTeams = selectTopTeams(rankings, tournament.numberOfDivisions, targetCount, isFromPlayoff);

            if (topTeams.length >= targetCount) {
              // Create expected pairings based on current rankings
              const expectedPairings = createTraditionalPairings(topTeams);
              
              // Check if existing matches match expected pairings
              let matchesNeedUpdate = false;
              const existingTeamPairs = targetMatches.map(m => 
                [m.team1Id, m.team2Id].sort().join('-')
              );

              for (let i = 0; i < expectedPairings.length; i++) {
                const [team1, team2] = expectedPairings[i];
                const expectedPair = [team1.id, team2.id].sort().join('-');
                
                if (!existingTeamPairs.includes(expectedPair)) {
                  matchesNeedUpdate = true;
                  break;
                }
              }

              if (matchesNeedUpdate) {
                // Delete old scheduled matches and create new ones with updated teams
                for (const match of targetMatches) {
                  await storage.deleteMatch(match.id);
                }

                // Create new matches with current top teams
                for (const [team1, team2] of expectedPairings) {
                  const matchData = {
                    tournamentId,
                    team1Id: team1.id,
                    team2Id: team2.id,
                    stage: targetStage,
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
                  updatedMatches.push(match);
                }

                warnings.push(`Updated ${targetStage} matches based on current rankings from ${sourceStage}.`);
              } else {
                warnings.push(`No changes needed. ${targetStage} matches already reflect current rankings.`);
              }
            } else {
              warnings.push(`Cannot update ${targetStage}. Need ${targetCount} teams but only ${topTeams.length} teams have results in ${sourceStage}.`);
            }
          }
        } else {
          warnings.push("No new matches to generate. All enabled tournament stages already have matches.");
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
        validatedData.team2NoShow ?? false
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
        subject: "Boules Tournament - Matches Report",
        html: `
          <h2>Boules Tournament Matches Report</h2>
          <p>Please find attached the matches report generated on ${new Date().toLocaleDateString()}.</p>
          <p>This report contains all match information including schedules, scores, and results.</p>
          <br/>
          <p>Best regards,<br/>Boules Tournament Management</p>
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
