# Boules Tournament Manager

## Overview
Boules Tournament Manager is a web application designed to manage multiple boules tournaments. It facilitates team registration, tracks match progress, visualizes tournament brackets across various stages (initial rounds, quarter-finals, semi-finals, finals), and supports bulk data entry via Excel spreadsheet imports. The application features a tournament selection system where users can create and manage multiple tournaments, each with isolated data (teams, matches, results). The application aims for a modern SaaS design, emphasizing clarity and efficient workflows, with the business vision of providing a comprehensive, user-friendly platform for boules tournament management.

## User Preferences
- Preferred communication style: Simple, everyday language.
- All warnings and errors displayed in toasts should be "sticky" (never auto-dismiss) to ensure users see important messages.

## System Architecture

### Frontend
- **Frameworks**: React 18 with TypeScript, Vite, Wouter, TanStack Query.
- **UI/UX**: shadcn/ui components (Radix UI base), Tailwind CSS ("new-york" variant), Inter font for UI, JetBrains Mono for numerical data, consistent spacing, responsive grid layouts, custom CSS variables.
- **State Management**: React Query for server state, React Hook Form with Zod for form state, local component state.

### Backend
- **Framework**: Express.js with TypeScript and Node.js.
- **API Design**: RESTful API with resource-based endpoints.
- **Validation**: Zod schemas.
- **Deployment**: Vite dev server (development), static file serving (production).

### Data Storage
- **ORM & Database**: Drizzle ORM, PostgreSQL via Neon serverless driver.
- **Data Model**:
    - **Teams**: Team name (unique), captain details, optional division, home piste, other players.
    - **Matches**: Team references, up to 3 game scores, stage, status, winner, scheduled date. Unique constraint on team pairs.
    - **Results**: Generated from match outcomes, records match info, date, stage, team name, division (populated from team data), game statistics (games played, won, lost, drawn), points, score for, score against, score difference. Two records per completed match.
- **Match System**: Up to 3 games per match. Winner based on 2+ game wins. Status progression: "scheduled", "in-progress", "completed". Points allocated per game (2 win, 1 draw, 0 loss). Results created on "completed" status. Clearing scores reverts match to "scheduled" and deletes results.
- **Validation**: Shared Zod schemas for client-server consistency.
- **Initialization**: Automatic database initialization for unique constraints.
- **Cascade Deletion**: Enforces data integrity (e.g., deleting a team removes associated matches and results).

### Tournament System
- **Multi-Tournament Support**: Independent tournaments with isolated data.
- **Tournament Selection**: Dropdown in navigation bar; auto-selects latest on load.
- **Cascade Deletion**: Deleting a tournament removes all associated data.
- **Configuration**: Name, number of divisions (default 2), stages (Quarter-finals, Semi-finals, Finals; default Finals only).
- **Tournament Progression**:
    - **Initial Stage**: Round-robin match generation within divisions; incremental generation; requires divisions for teams.
    - **Automatic Stage Advancement**: Generates Quarter-finals, Semi-finals, Finals when preceding stage is complete.
    - **Traditional Seeding**: Playoff pairings (1v8, 2v7, 3v6, 4v5 for QF; 1v4, 2v3 for SF; 1v2 for Finals).
    - **Team Selection**: Based on division count and rankings (e.g., 1 division: top 8 overall; 2 divisions: top 4 from each).
    - **Ranking Calculation**: Based on latest completed stage results, ordered by Points, Score Difference, Score For (all descending).
    - **Safe Re-generation**: Updates scheduled playoff matches if initial stage results change before playoffs, protecting completed matches.

### Features
- **Teams Management**: Add individually or bulk import via Excel. Displays team count. Supports inline editing. Table with sortable columns and horizontal scrolling for mobile.
- **Matches Management & Reporting**: Generate PDF reports of matches grouped by stage. Preview-first design with in-viewer actions (Save, Print, Close). Uses jsPDF with auto-table plugin. Landscape orientation for PDFs.
- **Results Summary & Reports**: View team statistics and match results grouped by division. Summary dialog and PDF reports include tournament name and full date/time timestamp for clarity. Results are displayed in separate sections for each division with collapsible cards.
- **Read-Only Mode (View-Only Sharing)**: Generate shareable URLs (`?view=readonly&tournament={id}`). Auto-selects shared tournament. Hides all editing controls. Preserves query parameters across navigation. Auto-opens Results Summary in read-only mode.

## Recent Changes
- **Division-Based Grouping for Results (October 2025)**: Enhanced Results page and Summary to group by division:
  - Results page displays separate collapsible cards for each division (A, B, C, etc.)
  - Teams without assigned divisions appear in "No Division Assigned" section at bottom
  - Summary dialog groups team statistics by division with separate headers
  - PDF reports (both Match Results and Team Summary) group content by division
  - Added division field to results table schema, populated from team data
  - Fixed bug where teams could be misassigned to "No Division" when playoff matches were processed first
  - Division grouping preserves all existing sorting, filtering, and export functionality

- **Results Page Column Reordering (October 2025)**: Improved readability by reordering columns on Results page:
  - Team name moved to leftmost position
  - Followed by Stage, then Match, then Date
  - PDF exports updated to match on-page column order for consistency
  - All sorting and filtering functionality preserved

- **Android Mobile Compatibility Fix (October 2025)**: Fixed black screen issue on Android mobile when accessing Results page via view-only link:
  - Added 500ms delay before auto-opening Summary dialog in read-only mode
  - Ensures page fully renders before dialog opens, especially on slower mobile browsers
  - Improves compatibility with Android browsers without affecting desktop experience

- **Results Summary Enhancements (October 2025)**: Added tournament name and date/time to both on-screen Summary dialog and PDF reports:
  - Summary dialog shows tournament name and timestamp below title
  - Match Results PDF includes tournament name and full date/time
  - Team Summary Statistics PDF includes tournament name and full date/time
  - Helps users track which tournament and when reports were generated

- **Tournament-Specific Shareable Links (October 2025)**: Enhanced shareable links to include tournament ID:
  - Share links now include both `?view=readonly&tournament={id}` parameters
  - Recipients automatically see the exact tournament that was shared
  - TournamentContext reads tournament ID from URL and auto-selects it on page load
  - Fixed match completion bug: matches now complete when team wins 2 games

## External Dependencies

- **UI Libraries**: Radix UI, Lucide React, class-variance-authority, tailwind-merge, clsx.
- **Form & Validation**: React Hook Form, @hookform/resolvers, Zod, drizzle-zod.
- **Data Import/Export**: xlsx (Excel parsing/generation).
- **PDF Generation**: jsPDF, jspdf-autotable.
- **Email Service**: Resend (via Replit connector).
- **Database & ORM**: @neondatabase/serverless, drizzle-orm, drizzle-kit.
- **Development Tools**: esbuild, tsx, PostCSS, Autoprefixer.
- **Fonts**: Google Fonts (Inter, Architects Daughter, DM Sans, Fira Code, Geist Mono).