---
name: Auth system design
description: How the email login system coexists with the existing URL-token (master admin / tournament tokens) system.
---

# Auth System Design

## Two auth layers coexist

1. **Email/password login** (new) — `server/sessionAuth.ts`
   - Cookie name: `btm_auth`, signed with `SESSION_SECRET` env var (HMAC-SHA256)
   - 30-day expiry, httpOnly, secure in production
   - `ali@themoirs.co.uk` is auto-promoted to `isSystemAdmin=true` on register/login
   - System admin via email = `req.isMasterAdmin=true` in token middleware

2. **URL token system** (legacy, unchanged) — `server/tokenMiddleware.ts`
   - `master_xxx` tokens → password-based master admin (in-memory sessions)
   - Tournament admin/view tokens → per-tournament access
   - All stored in localStorage and appended to API requests by `queryClient.ts`

## Token middleware flow
1. Check session cookie → if system admin, set isMasterAdmin=true and return early
2. Check `master_xxx` URL token → existing master admin sessions
3. No token + sessionUser → regular logged-in user, allow write ops
4. No token + no sessionUser → block writes except short-link creation
5. Tournament token → tournament-specific access (unchanged)

## Why
Autoscale deployment requires stateless sessions (no in-memory session store). JWT in cookie avoids a sessions table while staying secure.

## Blocked user handling
Token middleware calls `storage.getUserById()` on every request with a cookie — if blocked, clears cookie and returns 401. This is intentional (immediate effect on block).

## Tournament ownership
- `tournaments.userId` FK → `users.id` ON DELETE CASCADE (deleting user removes all their data)
- Regular users see only their own tournaments; system admin sees all
- Existing tournaments with `userId=null` are only visible to system admin
