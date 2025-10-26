# Boules League Manager

## Overview
Boules League Manager is a web application designed to manage boules league competitions. It facilitates team registration, tracks match progress, visualizes tournament brackets across various stages (initial rounds, quarter-finals, semi-finals, finals), and supports bulk data entry via Excel spreadsheet imports. The application aims for a modern SaaS design, emphasizing clarity and efficient workflows.

## User Preferences
Preferred communication style: Simple, everyday language.

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
    - **Teams**: Stores team name (unique), captain details, and an optional division (A-Z).
    - **Matches**: Stores team references, best-of-3 game scores (6 fields: team1Game1Score through team3Game3Score), stage, status, winner, and an optional scheduled date. Features a unique constraint on team pairs to prevent duplicate matches.
    - **Results**: Automatically generated from match outcomes, recording match info, date, stage, team name, match points (2 for win, 1 for draw, 0 for loss), score for (team's total game score), score against (opponent's total game score), and score difference (scoreFor - scoreAgainst). Two result records per completed match. Stage field enables filtering and summary statistics by tournament stage.
- **Best-of-3 Match System**:
    - Each match consists of up to 3 games
    - Winner determination: Team that wins 2+ games wins the match
    - Match status progression:
        - "scheduled": No scores entered yet
        - "in-progress": Games being played but no team has won 2 games yet
        - "completed": One team has won 2+ games OR all 3 games played
    - Point allocation (based on overall match winner, not individual games):
        - Winner: 2 points
        - Loser: 0 points
        - Draw (1-1-1 or tied with draws): 1 point each
    - Results are created when match status is "completed" and include total scores from all played games
    - Clearing all scores reverts match to "scheduled" and deletes associated results
- **Validation**: Shared Zod schemas ensure client-server consistency.
- **Initialization**: Automatic database initialization for unique constraints on startup.
- **Cascade Deletion**: Data integrity enforced through cascade deletion:
    - Deleting a team removes all matches involving that team and all results for those matches
    - Deleting all teams removes all matches and all results
    - Deleting a match removes all results for that match
    - Deleting all matches removes all results (teams remain)
- **Tournament Progression**: Automated match generation follows tournament stages:
    - **Initial Stage**: Generates round-robin matches within divisions when no matches exist
    - **Quarter Finals**: Generates when initial matches are completed (with dates & results) and >8 divisions exist (selects division winners by points)
    - **Semi Finals**: Generates when quarter finals are completed and 2-4 winners exist
    - **Finals**: Generates when semi finals are completed and exactly 2 winners exist
    - Generate Matches button intelligently determines next stage based on current state
    - Provides clear error messages when requirements aren't met

## External Dependencies

- **UI Libraries**: Radix UI (headless components), Lucide React (icons), class-variance-authority, tailwind-merge, clsx.
- **Form & Validation**: React Hook Form, @hookform/resolvers, Zod, drizzle-zod.
- **Data Import**: xlsx for Excel spreadsheet parsing.
- **Database & ORM**: @neondatabase/serverless (PostgreSQL client), drizzle-orm, drizzle-kit.
- **Development Tools**: esbuild, tsx, PostCSS, Autoprefixer.
- **Fonts**: Google Fonts (Inter, Architects Daughter, DM Sans, Fira Code, Geist Mono).