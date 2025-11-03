# Boules Tournament Manager

## Overview
Boules Tournament Manager is a web application for managing multiple boules tournaments. It handles team registration, tracks match progress through various stages (initial rounds, quarter-finals, semi-finals, finals), and supports bulk data entry via Excel imports. The application allows users to create and manage independent tournaments, each with isolated data. The business vision is to provide a comprehensive, user-friendly SaaS platform for boules tournament management with a modern design and efficient workflows.

## User Preferences
- Preferred communication style: Simple, everyday language.
- All warnings and errors displayed in toasts should be "sticky" (never auto-dismiss) to ensure users see important messages.

## System Architecture

### Frontend
- **Frameworks**: React 18 with TypeScript, Vite, Wouter, TanStack Query.
- **UI/UX**: shadcn/ui components (Radix UI base), Tailwind CSS ("new-york" variant), Inter font for UI, JetBrains Mono for numerical data, responsive grid layouts.
- **State Management**: React Query for server state, React Hook Form with Zod for form state.

### Backend
- **Framework**: Express.js with TypeScript and Node.js.
- **API Design**: RESTful API.
- **Validation**: Zod schemas.

### Data Storage
- **ORM & Database**: Drizzle ORM, PostgreSQL via Neon serverless driver.
- **Data Model**: Includes `Teams`, `Matches`, and `Results` entities with defined fields and relationships.
    - **Teams**: Unique name, captain details. Division defaults to 'A'.
    - **Matches**: Up to 3 game scores, stage, status, winner. Unique constraint on team pairs.
    - **Results**: Generated from match outcomes, records match info and game statistics.
- **Match System**: Up to 3 games per match. Auto-completion based on `gamesPerMatch` setting. Status progression: "scheduled", "in-progress", "completed". Points allocated per game.
- **Validation**: Shared Zod schemas for client-server consistency.
- **Initialization**: Automatic database initialization for unique constraints.
- **Cascade Deletion**: Enforces data integrity (e.g., deleting a team removes associated matches and results).

### Tournament System
- **Multi-Tournament Support**: Independent tournaments with isolated data.
- **Tournament Selection**: Dropdown in navigation bar; persists selection via `localStorage` and URL parameters.
- **Cascade Deletion**: Deleting a tournament removes all associated data.
- **Configuration**: Name, number of divisions (default 2), games per match (1-5, default 3), stages (e.g., Quarter-finals, Semi-finals, Finals).
- **Tournament Progression**:
    - **Initial Stage**: Round-robin match generation within divisions.
    - **Automatic Stage Advancement**: Generates playoff stages (QF, SF, Finals) when preceding stage is complete.
    - **Seeding**: Traditional playoff pairings based on rankings.
    - **Team Selection**: Division-aware selection based on tournament configuration:
        - **Quarter-Finals (8 teams)**: 1 div → top 8; 2 divs → top 4 from each; 3 divs → top 4 from largest, top 2 from others; 4+ divs → top 2 from each of first 4
        - **Semi-Finals (4 teams)**: 1 div → top 4; 2+ divs → top 2 from each of first 2 divisions
        - **Finals (2 teams)**: 1 div → top 2; 2+ divs → top 1 from each of first 2 divisions
    - **Ranking Calculation**: Based on latest completed stage results (Points, Score Difference, Score For).
    - **Safe Re-generation**: Updates scheduled playoff matches if initial stage results change before playoffs, protecting completed matches.

### Features
- **Teams Management**: Add individually or bulk import via Excel. Supports inline editing and "Edit All" mode for bulk updates. Division changes are prevented once a team has any matches.
- **Matches Management & Reporting**: View, edit, track matches. Generate PDF reports grouped by stage. Edit All mode with keyboard navigation for efficient score entry.
- **Results Summary & Reports**: View team statistics and match results grouped by Stage, then Division. PDF reports include tournament name and timestamp.
- **Read-Only Mode (View-Only Sharing)**: Generate shareable URLs (`?view=readonly&tournament={id}`) for public viewing without editing controls. Auto-opens Results Summary in read-only mode.

## Recent Changes

### Keyboard Navigation for Match Scores (November 2025)
Enhanced data entry workflow in Matches Edit All mode:
- Removed spinner arrows from number input fields for cleaner interface
- Arrow key navigation through score fields: Left/Right moves between fields in same row, Up/Down moves to same field in adjacent rows
- Navigation scoped to division boundaries (doesn't jump between division groups)
- Field order: Date → Team 1 Game 1-3 → Team 2 Game 1-3
- Prevents default arrow key behavior to avoid accidental value changes
- Improves speed and accuracy when entering multiple match scores

### Loading Indicators for Bulk Operations (November 2025)
Added clear visual feedback during save operations:
- "Updating - Please Wait" toast notifications display during all bulk operations
- Teams "Save All" button disables during save, shows "Saving..." text
- Matches "Save All" button disables during save, shows "Saving..." text
- Results "Clear All Results" button disables during clear, shows "Clearing..." text
- Toast messages include operation details (e.g., "Saving 12 team(s)...")
- Loading state properly managed with finally blocks to prevent stuck buttons
- Improves user experience by providing clear feedback for operations that may take time

## External Dependencies

- **UI Libraries**: Radix UI, Lucide React, class-variance-authority, tailwind-merge, clsx.
- **Form & Validation**: React Hook Form, @hookform/resolvers, Zod, drizzle-zod.
- **Data Import/Export**: xlsx.
- **PDF Generation**: jsPDF, jspdf-autotable.
- **Email Service**: Resend (via Replit connector).
- **Database & ORM**: @neondatabase/serverless, drizzle-orm, drizzle-kit.
- **Development Tools**: esbuild, tsx, PostCSS, Autoprefixer.
- **Fonts**: Google Fonts (Inter, Architects Daughter, DM Sans, Fira Code, Geist Mono).