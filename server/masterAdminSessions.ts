import crypto from "crypto";

interface MasterAdminSession {
  token: string;
  createdAt: number;
  expiresAt: number;
}

class MasterAdminSessionStore {
  private sessions: Map<string, MasterAdminSession> = new Map();
  private readonly SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

  createSession(): string {
    this.cleanupExpiredSessions();
    
    const token = `master_${crypto.randomBytes(32).toString('hex')}`;
    const now = Date.now();
    
    this.sessions.set(token, {
      token,
      createdAt: now,
      expiresAt: now + this.SESSION_DURATION_MS
    });
    
    console.log(`[AUDIT] Created master admin session: ${token.substring(0, 16)}...`);
    return token;
  }

  validateSession(token: string): boolean {
    const session = this.sessions.get(token);
    
    if (!session) {
      console.warn(`[SECURITY] Invalid master admin token attempted: ${token.substring(0, 16)}...`);
      return false;
    }
    
    if (session.expiresAt < Date.now()) {
      console.warn(`[SECURITY] Expired master admin token attempted: ${token.substring(0, 16)}...`);
      this.sessions.delete(token);
      return false;
    }
    
    return true;
  }

  revokeSession(token: string): boolean {
    const result = this.sessions.delete(token);
    if (result) {
      console.log(`[AUDIT] Revoked master admin session: ${token.substring(0, 16)}...`);
    }
    return result;
  }

  revokeAllSessions(): void {
    const count = this.sessions.size;
    this.sessions.clear();
    console.log(`[AUDIT] Revoked all ${count} master admin sessions`);
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let cleaned = 0;
    
    const entries = Array.from(this.sessions.entries());
    for (const [token, session] of entries) {
      if (session.expiresAt < now) {
        this.sessions.delete(token);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[AUDIT] Cleaned up ${cleaned} expired master admin sessions`);
    }
  }

  getActiveSessionCount(): number {
    this.cleanupExpiredSessions();
    return this.sessions.size;
  }
}

export const masterAdminSessions = new MasterAdminSessionStore();
