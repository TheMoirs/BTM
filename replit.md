# Boules Tournament Manager

## Overview
Boules Tournament Manager is a web application designed to manage multiple boules tournaments. It facilitates team registration, tracks match progress across various stages (initial rounds, quarter-finals, semi-finals, finals), and supports bulk data entry through Excel imports. The application allows users to create and manage independent tournaments, each with isolated data. The business vision is to provide a comprehensive, user-friendly SaaS platform for boules tournament management with a modern design and efficient workflows.

## User Preferences
- Preferred communication style: Simple, everyday language.
- All warnings and errors displayed in toasts should be "sticky" (never auto-dismiss) to ensure users see important messages.
- Mobile-responsive navigation with three-row layout for better visibility on small screens.

## System Architecture

### UI/UX Decisions
- **Frameworks**: React 18 with TypeScript, Vite, Wouter.
- **Components**: shadcn/ui (Radix UI base).
- **Styling**: Tailwind CSS ("new-york" variant).
- **Typography**: Inter font for UI, JetBrains Mono for numerical data.
- **Layout**: Responsive grid layouts. Mobile-optimized navigation with three-row stacked layout.
- **State Management**: TanStack Query for server state, React Hook Form with Zod for form state.

### Technical Implementations
- **Backend**: Express.js with TypeScript and Node.js, RESTful API, Zod for validation.
- **Data Storage**: PostgreSQL via Neon serverless driver, Drizzle ORM.
- **Data Model**: Includes `Teams`, `Matches`, and `Results` entities.
    - **Teams**: Unique name, optional Team ID (teamDisplayId), captain details, division (defaults to 'A').
    - **Matches**: Up to 3 game scores, stage, status, winner. Unique constraint on team pairs.
    - **Results**: Generated from match outcomes, records match info and game statistics.
- **Match System**: Matches are "completed" when 1 or more complete game results (both teams' scores) are entered. Status progression: "scheduled", "in-progress", "completed". Points allocated per game using tournament-specific point values (configurable Win/Draw/Loss, defaults: 2, 1, 0).
- **Validation**: Shared Zod schemas for client-server consistency.
- **Data Integrity**: Automatic database initialization for unique constraints, cascade deletion for related records (e.g., deleting a team removes associated matches and results; deleting a tournament removes all its data).

### Feature Specifications
- **Multi-Tournament Support**: Independent tournaments with isolated data, selectable via navigation bar, persistent selection via `localStorage` and URL.
- **Tournament Configuration**: Name, number of divisions (default 2), games per match (1-5, default 3), configurable stages, customizable point values (Win/Draw/Loss defaults: 2, 1, 0).
- **Tournament Progression**:
    - **Initial Stage**: Round-robin match generation within divisions.
    - **Automatic Stage Advancement**: Generates playoff stages (QF, SF, Finals) when preceding stage is complete.
    - **Seeding**: Traditional playoff pairings based on rankings.
    - **Team Selection for Playoffs**: Division-aware selection rules for Quarter-Finals, Semi-Finals, and Finals based on number of divisions.
    - **Ranking Calculation**: Based on latest completed stage results (Points, Score Difference, Score For).
    - **Safe Re-generation**: Updates scheduled playoff matches if initial stage results change before playoffs, protecting completed matches.
- **Teams Management**: Add individually or bulk import via Excel. Inline editing and "Edit All" mode. Division changes restricted if team has matches. Division filtering. Share View button creates link to view-only Teams page (visitors can email/WhatsApp captains). Leaderboard button navigates to standings page.
    - **Team ID**: Optional custom identifier field (teamDisplayId) for teams. Displayed as "ID - Team Name" format on Matches, Results, and Leaderboard pages. Searchable via the Find & Edit search on Matches page. Included in PDF and Excel exports. Supported in Excel imports (columns: "Team ID", "teamid", "team_id", "id").
- **Matches Management & Reporting**: View, edit, track matches. PDF reports grouped by stage. "Edit All" mode with keyboard navigation for score entry. Date validation requires match date when entering scores (focuses on empty date field if missing). Find & Edit search supports searching for a specific match between two teams using "Team1 v Team2" or "Team1 vs Team2" format (e.g., "10 vs 20" finds the match between team 10 and team 20).
- **Results Summary & Reports**: View team statistics and match results. Detailed table filterable by stage. Summary dialog always shows all stages grouped by Stage → Division. PDF reports include tournament name and timestamp.
    - **Inline Leaderboard View**: Toggle buttons on Results page allow switching between: Detailed Results (original table), Team Leaderboard (rankings by stage/division with clickable team names), and All Match Results (matches grouped by division). Clicking a team name drills down to show only that team's matches with "Back to Leaderboard" button.
- **Standalone Leaderboard with Match Results**: Share leaderboard link shows team standings with toggle button to display match results. Matches grouped by division, sorted by status (completed first, then in-progress, then scheduled) with latest matches by date at top. Displays team names, game scores, status, stage, and date for each match.
- **Internal Short URL System**: Self-hosted short links for sharing leaderboard and other pages.
    - **Database**: `short_links` table stores code, tournamentId, accessType, targetPage, createdAt
    - **Endpoints**:
        - GET `/s/:code` - Redirects to target page with proper token and tournament params
        - POST `/api/short-links` - Creates short links (available to all users including view-only)
    - **Features**:
        - Reuses existing short links for same tournament/page/access combination
        - Generates cryptographically secure 6-character codes
        - Share buttons visible to all users (not just admins)
        - Tournament existence validated before link creation
- **Three-Tier Security System**: Comprehensive access control with Master Admin, Admin tokens, and View tokens.
    - **Master Admin**: Password-based authentication using `MASTER_ADMIN_PASSWORD` environment variable.
        - Full control over ALL tournaments (view, edit, delete any tournament)
        - Can retrieve admin URLs for any tournament via dedicated endpoint
        - Session-based authentication with `master_` prefixed tokens
        - Bypasses all tournament-specific access restrictions
        - UI shows "Master Admin" badge in navigation
        - Special endpoint GET `/api/tournaments/:id/admin-credentials` (master admin only):
            - Returns shareable admin and view URLs containing tokens
            - URLs are designed to be distributed to tournament organizers and viewers
            - Includes audit logging for security
            - Protected by strict master admin verification
        - Access verification endpoint GET `/api/auth/check-access`:
            - Returns current token's access level (master admin, admin, or view-only)
            - Used by frontend to determine UI permissions
            - Enables proper access control without exposing token validation logic
    - **Admin Tokens**: Full write access to specific tournament. Required for all modifications (teams, matches, tournament settings, token regeneration).
    - **View Tokens**: Read-only access to specific tournament. Can view all data but cannot modify anything.
    - **Default (No Token)**: Read-only access with no tournament-specific restrictions.
    - Each tournament has two unique tokens (cryptographically secure 32-character random strings):
        - `adminToken`: Created on tournament creation, retrievable only by master admin
        - `viewToken`: Created on tournament creation, shareable for public viewing
    - **Token Usage**: Tokens included as query parameter: `?token={adminToken|viewToken|master_session}&tournament={id}`
    - **Token Persistence**: Tokens stored in localStorage to survive SPA navigation and page reloads
    - **Tournament Locking**: When accessing via admin/view token URL, tournament selection is automatically locked to prevent 403 errors:
        - TournamentProvider queries `/api/auth/check-access` to get token's associated tournament ID
        - Tournament selection prioritizes locked tournament (highest priority in selection logic)
        - selectTournament function blocks switching to different tournaments when locked
        - UI displays "Locked to access link" indicator in tournament selector
        - Tournament dropdown hidden when locked (displays as read-only)
        - Prevents token/tournament mismatch that caused 403 errors during match editing
    - **Server-Side Enforcement**:
        - Middleware validates tokens and sets access level flags (`isAdminAccess`, `isViewOnlyAccess`, `isMasterAdmin`, `tokenTournamentId`)
        - All write operations require admin token or master admin (403 for view tokens or missing tokens)
        - All routes verify tournament ownership before allowing access (403 for cross-tournament attempts)
        - Master admin bypasses tournament ownership checks
        - PATCH operations verify both existing resource and new payload belong to token's tournament
        - Bulk operations derive tournament ID from token, reject mismatched query parameters
    - **Tournament Management Routes**:
        - POST /api/tournaments - Requires master admin ONLY (tournament creation)
        - PATCH /api/tournaments/:id - Requires admin token + ownership OR master admin
        - DELETE /api/tournaments/:id - Requires admin token + ownership OR master admin
        - POST /api/tournaments/:id/regenerate-token - Requires admin token + ownership OR master admin
        - DELETE /api/teams (bulk) - Requires admin token + ownership OR master admin
        - DELETE /api/matches (bulk) - Requires admin token + ownership OR master admin
    - **Error Handling**: Invalid tokens return 401; cross-tournament access returns 403; missing resources return 404
    - **Token Regeneration**: Admin tokens can regenerate view tokens via `/api/tournaments/:id/regenerate-token`
    - **UI Integration**: Automatically detects token presence, hides editing controls in view-only mode, displays access level badges (Master Admin, Admin Access, View Only)
    - **Master Admin Features**:
        - Login/logout UI in navigation bar
        - Link icon button next to each tournament in selector (master admin only)
        - Dialog displaying both admin and view URLs with copy buttons
        - Can switch between any tournament without restrictions
    - **Security Guarantees**:
        - Cannot bypass security by removing token
        - Each token grants access to only one specific tournament
        - Cross-tournament access completely blocked at all levels
        - Multi-layer defense: middleware + route handlers enforce isolation
        - Master admin sessions use cryptographically secure tokens with 24h expiration
        - Master admin endpoint includes audit logging for all credential retrievals
        - Master admin can retrieve shareable URLs to distribute to tournament organizers
- **Team Deletion Warning**: Displays specific counts of affected matches and results before confirming team deletion.
- **Tournament Deletion Warning**: Shows counts of teams and matches that will be deleted, with disabled submit button until counts load.
- **PDF Generation**: Data starts near top of page, intelligent page break logic prevents division data from splitting across pages. Dual-mode handling for desktop (preview dialog) and mobile (direct open/share via Web Share API or Data URI).
- **Mobile Optimization**: Navigation uses three-row responsive layout (title row, tournament selector row, nav items row) to ensure all content is visible on mobile screens.

### System Design Choices
- Loading indicators for bulk operations provide visual feedback.
- Team deletion impact is clearly communicated to the user.
- Keyboard navigation implemented for efficient match score entry.

## External Dependencies

- **UI Libraries**: Radix UI, Lucide React, class-variance-authority, tailwind-merge, clsx.
- **Form & Validation**: React Hook Form, @hookform/resolvers, Zod, drizzle-zod.
- **Data Import/Export**: xlsx.
- **PDF Generation**: jsPDF, jspdf-autotable.
- **Email Service**: Resend (via Replit connector).
- **Database & ORM**: @neondatabase/serverless, drizzle-orm, drizzle-kit.
- **Development Tools**: esbuild, tsx, PostCSS, Autoprefixer.
- **Fonts**: Google Fonts (Inter, Architects Daughter, DM Sans, Fira Code, Geist Mono).