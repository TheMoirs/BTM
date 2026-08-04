---
name: Auth system design
description: How the Clerk social/email auth coexists with the legacy URL-token (master admin / tournament tokens) system.
---

# Auth System Design

## Three auth layers coexist

1. **Clerk auth** (primary, new) — Google, Apple, X, email/password via Clerk
   - Clerk session cookie (managed by Clerk, httpOnly)
   - JIT user provisioning: when a Clerk user first hits the API, server calls `clerkClient.users.getUser(clerkUserId)` to get email, then links/creates a local user in the `users` table
   - `users.clerk_user_id` column stores the Clerk user ID for fast lookups
   - `users.password_hash = '__CLERK_AUTH__'` for social-only users (not a valid bcrypt hash, correctly rejects email/password login attempts)
   - `ali@themoirs.co.uk` is auto-promoted to `isSystemAdmin=true` on JIT provision

2. **Legacy email/password login** (kept for backward compat) — `server/sessionAuth.ts`
   - Cookie name: `btm_auth`, signed with `SESSION_SECRET` env var (HMAC-SHA256)
   - 30-day expiry, httpOnly, secure in production
   - Still works for users who don't migrate to Clerk

3. **URL token system** (legacy, unchanged) — `server/tokenMiddleware.ts`
   - `master_xxx` tokens → password-based master admin (in-memory sessions)
   - Tournament admin/view tokens → per-tournament access
   - All stored in localStorage and appended to API requests by `queryClient.ts`

## Token middleware flow (in order)
1. **Clerk** — `getAuth(req)` from `@clerk/express`. If Clerk user found, JIT-provision local user if needed, set `req.sessionUser`.
2. **Legacy cookie** — `getSessionFromRequest(req)` reads `btm_auth` cookie
3. **No URL token + sessionUser** → regular logged-in user (write access to own resources)
4. **No URL token + no sessionUser** → view-only, blocks writes
5. **Tournament token** → tournament-specific access (unchanged)

## JIT provisioning logic (in tokenMiddleware + /api/auth/user route)
- Look up by `clerkUserId` in users table first (fast DB lookup)
- If not found: call `clerkClient.users.getUser(clerkUserId)` to get email + display name
- If email matches existing user: link `clerk_user_id` to that user
- If no existing user: create new one with `__CLERK_AUTH__` placeholder hash
- Race condition handled: createUserFromClerk wrapped in try/catch with fallback getUserByEmail

## Clerk environment
- CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, VITE_CLERK_PUBLISHABLE_KEY auto-provisioned by Replit
- Clerk proxy path: `/api/__clerk` (handled by `server/middlewares/clerkProxyMiddleware.ts`)
- `clerkMiddleware()` mounted in `server/index.ts` AFTER body parsers, BEFORE routes
- Client uses `publishableKeyFromHost(window.location.hostname, env)` from `@clerk/react/internal`
- `clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL` — empty in dev, auto-set in prod

## Enabling social providers
- Google: pre-enabled by default
- Apple, X: must be toggled on in the **Auth pane** in the Replit workspace toolbar
- Facebook: NOT supported by Replit-managed Clerk

## Client auth flow
- `AuthContext.tsx` uses `useUser()` from `@clerk/react`; fetches local user from `/api/auth/user` when Clerk user is signed in
- `logout()` calls Clerk's `signOut()` + clears legacy cookie via `/api/auth/logout`
- `clerkAppearance` is exported from `App.tsx` and imported by `sign-in.tsx` / `sign-up.tsx`
- Routes: `/sign-in/*?` and `/sign-up/*?` (the `/*?` wildcard is required for OAuth callback sub-paths)
- `/login` redirects to `/sign-in` for backward compat

## Why
Autoscale deployment requires stateless sessions. Clerk provides this + social login. Legacy cookie kept so existing users aren't locked out immediately. JIT provisioning by email means existing tournament data is preserved when a user first signs in with Google using the same email they registered with.
