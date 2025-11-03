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
    - **Team Selection**: Based on division count and rankings.
    - **Ranking Calculation**: Based on latest completed stage results (Points, Score Difference, Score For).
    - **Safe Re-generation**: Updates scheduled playoff matches if initial stage results change before playoffs, protecting completed matches.

### Features
- **Teams Management**: Add individually or bulk import via Excel. Supports inline editing and "Edit All" mode for bulk updates. Division changes are prevented once a team has any matches.
- **Matches Management & Reporting**: View, edit, track matches. Generate PDF reports grouped by stage.
- **Results Summary & Reports**: View team statistics and match results grouped by Stage, then Division. PDF reports include tournament name and timestamp.
- **Read-Only Mode (View-Only Sharing)**: Generate shareable URLs (`?view=readonly&tournament={id}`) for public viewing without editing controls. Auto-opens Results Summary in read-only mode.

## External Dependencies

- **UI Libraries**: Radix UI, Lucide React, class-variance-authority, tailwind-merge, clsx.
- **Form & Validation**: React Hook Form, @hookform/resolvers, Zod, drizzle-zod.
- **Data Import/Export**: xlsx.
- **PDF Generation**: jsPDF, jspdf-autotable.
- **Email Service**: Resend (via Replit connector).
- **Database & ORM**: @neondatabase/serverless, drizzle-orm, drizzle-kit.
- **Development Tools**: esbuild, tsx, PostCSS, Autoprefixer.
- **Fonts**: Google Fonts (Inter, Architects Daughter, DM Sans, Fira Code, Geist Mono).