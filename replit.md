# Boules League Manager

## Overview
Boules League Manager is a web application designed to manage multiple boules league tournaments. It facilitates team registration, tracks match progress, visualizes tournament brackets across various stages (initial rounds, quarter-finals, semi-finals, finals), and supports bulk data entry via Excel spreadsheet imports. The application features a tournament selection system where users can create and manage multiple tournaments, each with isolated data (teams, matches, results). The application aims for a modern SaaS design, emphasizing clarity and efficient workflows.

## Tournament System
- **Multi-Tournament Support**: Application supports multiple independent tournaments with isolated data
- **Tournament Selection**: Users select active tournament via dropdown in navigation bar
- **Auto-Select Latest**: On initial load, automatically selects the most recently created tournament
- **Cascade Deletion**: Deleting a tournament removes all associated teams, matches, and results
- **Tournament Configuration**:
  - Name (required)
  - Number of divisions (default: 2)
  - Tournament stages: Quarter-finals, Semi-finals, Finals (default: Finals only)
- **Data Isolation**: All teams, matches, and results are scoped to the selected tournament

## User Preferences
- Preferred communication style: Simple, everyday language.
- All warnings and errors displayed in toasts should be "sticky" (never auto-dismiss) to ensure users see important messages.

## System Architecture

### Frontend
- **Frameworks**: React 18 with TypeScript, Vite for bundling, Wouter for routing, TanStack Query for server state management.
- **UI/UX**: shadcn/ui components built on Radix UI, styled with Tailwind CSS using a "new-york" design variant.
- **Design System**: Inter font for UI, JetBrains Mono for numerical data, consistent spacing, responsive grid layouts, and custom CSS variables for them.
- **State Management**: React Query for server state, React Hook Form with Zod for form state, local component state for UI.

### Backend
- **Framework**: Express.js with TypeScript and Node.js.
- **API Design**: RESTful API with resource-based endpoints (`/api/teams`, `/api/matches`, `/api/results`).
- **Validation**: Zod schemas for request validation.
- **Deployment**: Vite dev server for development; static file serving of client assets for production.

### Data Storage
- **ORM & Database**: Drizzle ORM for type-safe queries, PostgreSQL via Neon serverless driver.
- **Data Model**:
    - **Teams**: Stores team name (unique), captain details (name, phone, email), optional division (A-Z), optional home piste (playing location), and optional other players (array of player names).
    - **Matches**: Stores team references, up to 3 game scores (6 fields: team1Game1Score through team3Game3Score), stage, status, winner, and an optional scheduled date. Features a unique constraint on team pairs to prevent duplicate matches.
    - **Results**: Automatically generated from match outcomes, recording match info, date, stage, team name, game statistics (games played, games won, games lost, games drawn), points (sum of individual game points: 2 per game win, 1 per draw, 0 per loss), score for (team's total game score), score against (opponent's total game score), and score difference (scoreFor - scoreAgainst). Two result records per completed match. Stage field enables filtering and summary statistics by tournament stage. Game statistics track individual games (1-3 games per match) rather than overall match outcomes.
- **Match System**:
    - Each match consists of up to 3 games
    - Winner determination: Team that wins 2+ games wins the match
    - Match status progression:
        - "scheduled": No scores entered yet
        - "in-progress": Games being played but no team has won 2 games yet
        - "completed": One team has won 2+ games OR all 3 games played
    - Point allocation (based on individual game results):
        - Each game awards points independently: 2 points for win, 1 point for draw, 0 points for loss
        - Example: Team wins Games 1 & 2, draws Game 3 = 2 + 2 + 1 = 5 points total
        - Opponent gets: 0 + 0 + 1 = 1 point total
    - Results are created when match status is "completed" and include total scores and points from all played games
    - Clearing all scores reverts match to "scheduled" and deletes associated results
- **Validation**: Shared Zod schemas ensure client-server consistency.
- **Initialization**: Automatic database initialization for unique constraints on startup.
- **Cascade Deletion**: Data integrity enforced through cascade deletion:
    - Deleting a team removes all matches involving that team and all results for those matches
    - Deleting all teams removes all matches and all results
    - Deleting a match removes all results for that match
    - Deleting all matches removes all results (teams remain)
- **Tournament Progression**: Comprehensive multi-stage progression system:
    - **Initial Stage**: Generate Matches creates round-robin matches within divisions
      - Incremental generation: If new teams added, generates missing matches only
      - Division requirements: Teams must have divisions assigned to participate
      - Odd team warning: Alerts when divisions have odd number of teams (one team will have bye)
      - Duplicate prevention: Skips matches that already exist between team pairs
    - **Automatic Stage Advancement**: System detects completed stages and generates next stage
      - Quarter-finals: Generated when initial stage is complete (all matches have results)
      - Semi-finals: Generated when quarter-finals are complete
      - Finals: Generated when semi-finals (or quarter-finals if SF disabled) are complete
    - **Traditional Seeding**: Playoff pairings follow standard seeding (1v8, 2v7, 3v6, 4v5 for QF; 1v4, 2v3 for SF; 1v2 for Finals)
    - **Team Selection Logic**: Teams advance based on division count and rankings:
      - 1 division: Top 8 teams overall advance to quarter-finals
      - 2 divisions: Top 4 from each division advance to quarter-finals
      - 3 divisions: Top 4 from largest + top 2 from others advance to quarter-finals
      - 4+ divisions: Top 2 from first 4 divisions advance to quarter-finals
      - Division priority: Largest first, then alphabetical order (A, B, C)
    - **Ranking Calculation**: Team rankings based on latest completed stage results
      - Finals use semi-final results (or quarter-final if SF disabled, or initial if both disabled)
      - Semi-finals use quarter-final results (or initial if QF disabled)
      - Quarter-finals use initial stage results
      - Rankings ordered by: Points (desc) → Score Difference (desc) → Score For (desc)
    - **Safe Re-generation**: If initial stage results change before playoffs start:
      - Regenerate updates playoff team pairings based on new rankings
      - Only updates matches still in "scheduled" status (no results)
      - Protects completed playoff matches from deletion
      - Warns user if matches cannot be updated due to existing results
    - **User Feedback**: Clear messages show matches created, updated, skipped, and warnings

## Features

### Teams Management
- **Registration**: Add teams individually via form or bulk import via Excel
- **Team Count Display**: Badge showing total number of registered teams appears next to page title
- **Team Information**: 
  - Team name (required, unique)
  - Division (optional, A-Z)
  - Home Piste (optional, playing location)
  - Other Players (optional, array of player names)
  - Captain contact details (name, phone, email - all required)
- **Excel Import**: Upload Excel file to create/update teams in bulk. Column headers must match: `name`, `division`, `homePiste`, `otherPlayers` (comma-separated), `captainName`, `captainPhone`, `captainEmail`
- **Inline Editing**: Click edit icon to modify team details directly in the table
- **Table Layout**: 
  - Unified table layout for all screen sizes
  - Horizontal scrolling on mobile devices to view all columns
  - All columns are sortable: Division, Team Name, Home Piste, Captain Name, Phone, Email, Other Players
  - Empty values (division, home piste, other players) are pushed to the end of sorted results
  - Inline row editing within the table

### Matches Management & Reporting
- **PDF Reports**: Generate comprehensive match reports with preview-first workflow
  - **Preview-First Design**: View PDF on screen before deciding what to do
  - **In-Viewer Actions**: Save, Print, or Close directly from viewer (landscape orientation)
  - **Mobile-Friendly**: Responsive dialog with iframe display works on all devices
  - **Resource Management**: Automatic blob URL cleanup prevents memory leaks
- **Report Contents**: Generated PDF includes:
  - All matches grouped by tournament stage
  - Team names, game scores, match status
  - Scheduled dates for upcoming matches
  - Complete tournament overview
- **Technical Implementation**:
  - jsPDF library for PDF generation with auto-table plugin
  - Single PDF generation function prevents duplication
  - Centralized cleanup ensures no memory leaks
  - Blob URLs revoked on all exit paths (Close or re-opening)
  - All PDFs use landscape orientation for better table display

## Recent Changes
- **Tournament Progression System (October 2025)**: Implemented comprehensive multi-stage tournament progression with:
  - Automatic playoff generation when stages complete (Quarter-finals, Semi-finals, Finals)
  - Traditional seeding for playoff pairings (1v8, 2v7, 3v6, 4v5 for QF; 1v4, 2v3 for SF; 1v2 for Finals)
  - Intelligent team selection based on division count (1 div: top 8; 2 divs: top 4 each; 3+ divs: top teams from largest divisions)
  - Rankings calculated from latest completed stage results for accurate playoff seeding
  - Safe re-generation that preserves completed playoff matches and only updates scheduled fixtures
  - Clear user feedback showing matches created, updated, skipped, and warnings

- **Multi-Tournament Support (December 2024)**: Implemented comprehensive tournament management system with:
  - Tournament selection dropdown in navigation bar
  - Automatic data scoping across all pages (Teams, Matches, Results)
  - Cascade deletion of all associated data when tournament is deleted
  - Configurable tournament settings (divisions, tournament stages)
  - Auto-selection of latest tournament on initial load
  - Complete data isolation between tournaments

## External Dependencies

- **UI Libraries**: Radix UI (headless components), Lucide React (icons), class-variance-authority, tailwind-merge, clsx.
- **Form & Validation**: React Hook Form, @hookform/resolvers, Zod, drizzle-zod.
- **Data Import/Export**: xlsx for Excel spreadsheet parsing and generation. Includes sample Excel file download feature with 12 pre-populated teams.
- **PDF Generation**: jsPDF with jspdf-autotable for generating PDF reports with tables.
- **Email Service**: Resend for sending PDF reports via email, integrated via Replit connector.
- **Database & ORM**: @neondatabase/serverless (PostgreSQL client), drizzle-orm, drizzle-kit.
- **Development Tools**: esbuild, tsx, PostCSS, Autoprefixer.
- **Fonts**: Google Fonts (Inter, Architects Daughter, DM Sans, Fira Code, Geist Mono).