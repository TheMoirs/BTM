# Boules Tournament Manager

## Overview
Boules Tournament Manager is a web application designed to manage multiple boules tournaments. It facilitates team registration, tracks match progress across various stages (initial rounds, quarter-finals, semi-finals, finals), and supports bulk data entry through Excel imports. The application allows users to create and manage independent tournaments, each with isolated data. The business vision is to provide a comprehensive, user-friendly SaaS platform for boules tournament management with a modern design and efficient workflows.

## User Preferences
- Preferred communication style: Simple, everyday language.
- All warnings and errors displayed in toasts should be "sticky" (never auto-dismiss) to ensure users see important messages.

## System Architecture

### UI/UX Decisions
- **Frameworks**: React 18 with TypeScript, Vite, Wouter.
- **Components**: shadcn/ui (Radix UI base).
- **Styling**: Tailwind CSS ("new-york" variant).
- **Typography**: Inter font for UI, JetBrains Mono for numerical data.
- **Layout**: Responsive grid layouts.
- **State Management**: TanStack Query for server state, React Hook Form with Zod for form state.

### Technical Implementations
- **Backend**: Express.js with TypeScript and Node.js, RESTful API, Zod for validation.
- **Data Storage**: PostgreSQL via Neon serverless driver, Drizzle ORM.
- **Data Model**: Includes `Teams`, `Matches`, and `Results` entities.
    - **Teams**: Unique name, captain details, division (defaults to 'A').
    - **Matches**: Up to 3 game scores, stage, status, winner. Unique constraint on team pairs.
    - **Results**: Generated from match outcomes, records match info and game statistics.
- **Match System**: Matches are "completed" when 1 or more complete game results (both teams' scores) are entered. Status progression: "scheduled", "in-progress", "completed". Points allocated per game (2 for win, 1 for draw, 0 for loss).
- **Validation**: Shared Zod schemas for client-server consistency.
- **Data Integrity**: Automatic database initialization for unique constraints, cascade deletion for related records (e.g., deleting a team removes associated matches and results; deleting a tournament removes all its data).

### Feature Specifications
- **Multi-Tournament Support**: Independent tournaments with isolated data, selectable via navigation bar, persistent selection via `localStorage` and URL.
- **Tournament Configuration**: Name, number of divisions (default 2), games per match (1-5, default 3), configurable stages.
- **Tournament Progression**:
    - **Initial Stage**: Round-robin match generation within divisions.
    - **Automatic Stage Advancement**: Generates playoff stages (QF, SF, Finals) when preceding stage is complete.
    - **Seeding**: Traditional playoff pairings based on rankings.
    - **Team Selection for Playoffs**: Division-aware selection rules for Quarter-Finals, Semi-Finals, and Finals based on number of divisions.
    - **Ranking Calculation**: Based on latest completed stage results (Points, Score Difference, Score For).
    - **Safe Re-generation**: Updates scheduled playoff matches if initial stage results change before playoffs, protecting completed matches.
- **Teams Management**: Add individually or bulk import via Excel. Inline editing and "Edit All" mode. Division changes restricted if team has matches. Division filtering.
- **Matches Management & Reporting**: View, edit, track matches. PDF reports grouped by stage. "Edit All" mode with keyboard navigation for score entry.
- **Results Summary & Reports**: View team statistics and match results. Detailed table filterable by stage. Summary dialog always shows all stages grouped by Stage → Division. PDF reports include tournament name and timestamp.
- **Read-Only Mode**: Shareable URLs (`?view=readonly&tournament={id}`) for public viewing without editing controls, auto-opens Results Summary. Tournament selector becomes static in this mode.
- **Team Deletion Warning**: Displays specific counts of affected matches and results before confirming team deletion.
- **PDF Generation**: Data starts near top of page, intelligent page break logic prevents division data from splitting across pages. Dual-mode handling for desktop (preview dialog) and mobile (direct open/share via Web Share API or Data URI).

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