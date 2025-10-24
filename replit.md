# Boules League Manager

## Overview

Boules League Manager is a web application for managing boules league competitions. It provides functionality for team registration, match tracking, tournament bracket visualization across multiple stages (initial rounds, quarter-finals, semi-finals, and finals), and CSV import capabilities for bulk data entry. The application follows a modern SaaS design approach inspired by Linear, emphasizing clarity, efficient workflows, and clean visual hierarchy.

## Key Features

### Team Management
- **Team Registration**: Manual team registration via form with automatic capitalization of team and captain names (first letter of each word)
- **Table View with Inline Editing**: All teams displayed in a table format with the following features:
  - Columns: Team Name, Division, Captain Name, Phone, Email, Actions
  - Click edit button to enable inline editing for any row
  - All fields editable directly in the table
  - Save/Cancel buttons appear when editing
  - Only one row can be edited at a time
- **Sortable Columns**: Click any column header to sort the table
  - Default sort: Team Name (ascending)
  - Click same header to toggle between ascending/descending
  - Visual indicators show active sort column and direction
  - Case-insensitive sorting for all text fields
- **Division Assignment**: Optional starting division field (A-Z) that can be set during team registration or editing
  - Displayed as a badge in the table
  - Automatically converted to uppercase
  - Can be left empty or cleared at any time
- **Teams CSV Import**: Upload CSV files containing team and captain information (name, captainName, captainPhone, captainEmail, division). Features:
  - Automatically capitalizes first letter of each word in team and captain names
  - Automatically converts division to uppercase (optional column)
  - **Upsert behavior**: Updates existing teams by name match (case-insensitive) or creates new ones
  - Per-row error handling with aggregate success/failure reporting
- **Clear All Teams**: Bulk delete all teams and their associated matches with confirmation dialog

### Match Management
- **Table View with Inline Editing**: All matches displayed in a table format with the following features:
  - Columns: Division, Stage, Date, Team 1, Team 1 Score, Team 2, Team 2 Score, Actions
  - Click edit button to enable inline editing for match scores
  - Score inputs with validation (both scores required together or both empty)
  - Save/Cancel buttons appear when editing
  - Only one row can be edited at a time
- **Filters**: Filter matches by stage and division
  - Stage filter: All Stages, Initial, Quarter-Finals, Semi-Finals, Finals
  - Division filter: All Divisions, or specific divisions (A, B, C, etc.)
  - Filters work together to show only matching matches
- **Sortable Columns**: Click any column header to sort the table
  - Default sort: Date (ascending)
  - Click same header to toggle between ascending/descending
  - Visual indicators show active sort column and direction
  - Sortable columns: Division, Stage, Date, Team 1, Team 2
- **Score Management**: Inline score editing with smart status handling
  - Null scores (unplayed matches) display as "—" for each team
  - Entering both scores marks match as "completed" and calculates winner
  - Clearing scores reverts match to "scheduled" status
  - Validation ensures both scores provided together or both empty
- **Division Management**: Division rules vary by tournament stage
  - **Initial Stage**: Both teams must be in the same division (validated on creation)
  - **Other Stages** (Quarter-Finals, Semi-Finals, Finals): Teams can be from different divisions (cross-division matches allowed)
  - Initial stage matches display division badge; other stages show no division
  - Matches can be filtered by division
- **Generate Matches**: Automatically creates round-robin matches from the teams table, grouped by division
  - **Server-side generation via POST /api/matches/generate**: Atomic operation with built-in deduplication
  - **Round-robin algorithm**: Every team plays every other team within their division (N*(N-1)/2 matches)
  - **Database-level uniqueness**: Unique index on LEAST/GREATEST team pair prevents all duplicates
  - **Concurrent-safe**: Multiple simultaneous generation requests handled gracefully
  - **Smart feedback**: Reports count of newly created vs skipped (already existing) matches
  - All generated matches default to "initial" stage with "scheduled" status
- **Manual Match Creation**: Create individual matches via form by selecting teams and tournament stage
  - Teams shown with their division in the dropdown
  - Validates both teams are in same division before creating
- **Clear All Matches**: Bulk delete all matches with confirmation dialog

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Tooling**
- **React 18** with TypeScript for type-safe component development
- **Vite** as the build tool and development server for fast refresh and optimized builds
- **Wouter** for lightweight client-side routing (Teams, Matches, Bracket views)
- **TanStack Query (React Query)** for server state management, caching, and data synchronization

**UI Component System**
- **shadcn/ui** components based on Radix UI primitives for accessible, composable UI elements
- **Tailwind CSS** for utility-first styling with custom design tokens
- Component library includes dialogs, forms, cards, badges, tables, and navigation elements
- Design system uses "new-york" style variant with neutral base color

**State Management Approach**
- Server state managed through React Query with infinite stale time (no automatic refetching)
- Form state handled by React Hook Form with Zod schema validation
- UI state (dialogs, navigation) managed through local component state
- Toast notifications for user feedback on mutations

**Design System**
- Typography: Inter font for UI, JetBrains Mono for numerical data (scores)
- Spacing: Tailwind units of 2, 4, 6, 8, and 12 for consistent rhythm
- Responsive grid layouts: 2-column team lists on desktop, single column forms
- Custom CSS variables for theming (light/dark mode support built-in)

### Backend Architecture

**Server Framework**
- **Express.js** with TypeScript running on Node.js
- RESTful API design pattern with JSON request/response bodies
- Middleware stack includes JSON body parsing, request logging, and error handling
- Custom logging middleware tracks API response times and payloads

**API Design**
- Resource-based endpoints following REST conventions:
  - `/api/teams` - CRUD operations for team management
  - `/api/matches` - CRUD operations for match management and score updates
- Request validation using Zod schemas before database operations
- Error responses with appropriate HTTP status codes (400, 404, 500)

**Development vs Production**
- Development: Vite dev server with HMR integrated via middleware mode
- Production: Static file serving of pre-built client assets
- Environment-specific configuration through NODE_ENV variable

### Data Storage

**ORM & Database Layer**
- **Drizzle ORM** for type-safe database queries and schema management
- PostgreSQL dialect configured (via Neon serverless driver)
- Schema definition in shared TypeScript files for client-server type sharing
- Migration support through drizzle-kit

**Data Model**
- **Teams Table**: Stores team information (name, captain details with name/phone/email, division)
  - division field: Optional text field storing single letter (A-Z) for team's starting division
  - Frontend displays division as a badge when present
  - Unique constraint on team name prevents duplicates
- **Matches Table**: Stores match data with team references, scores, stage, status, winner, and optional scheduled date
  - matchDate field: Optional text field storing dates in YYYY-MM-DD format for scheduling
  - Frontend displays formatted dates (e.g., "Jan 15, 2026") with calendar icons when present
  - **Unique constraint on team pairs**: Database index on `LEAST(team1_id, team2_id), GREATEST(team1_id, team2_id)` ensures no duplicate matches regardless of team order
- Stage progression: initial → quarter-finals → semi-finals → finals
- Match status workflow: scheduled → in-progress → completed

**Storage Abstraction**
- IStorage interface defines data access contract
- DatabaseStorage implementation uses PostgreSQL for persistent data storage
- Connection managed via Neon serverless driver with WebSocket support
- All operations are async with proper error handling and transaction support

**Data Validation**
- Shared Zod schemas ensure consistency between client and server
- Insert schemas exclude auto-generated IDs
- Type inference from schemas provides end-to-end type safety

### External Dependencies

**UI Libraries**
- **Radix UI**: Headless component primitives for accessibility (dialogs, dropdowns, tabs, etc.)
- **Lucide React**: Icon system for consistent visual language
- **class-variance-authority**: Type-safe variant styling system
- **tailwind-merge & clsx**: Utility for conditional CSS class merging

**Form & Validation**
- **React Hook Form**: Performant form state management
- **@hookform/resolvers**: Integration between React Hook Form and Zod
- **Zod**: Runtime type validation and schema definition
- **drizzle-zod**: Generate Zod schemas from Drizzle table definitions

**Data Import**
- **papaparse**: CSV parsing library for browser-based file uploads and data import
- Supports header parsing, type inference, and error handling
- Used for bulk team and match imports from CSV files

**Database & ORM**
- **@neondatabase/serverless**: PostgreSQL client optimized for serverless environments
- **drizzle-orm**: Type-safe SQL query builder and ORM
- **drizzle-kit**: CLI tool for schema migrations and database operations

**Development Tools**
- **Replit-specific plugins**: Runtime error modal, cartographer, dev banner (development only)
- **esbuild**: Fast JavaScript bundler for production server code
- **tsx**: TypeScript execution for development server
- **PostCSS & Autoprefixer**: CSS processing pipeline

**Fonts**
- Google Fonts: Inter (primary UI), Architects Daughter, DM Sans, Fira Code, Geist Mono
- Preconnect to fonts.googleapis.com and fonts.gstatic.com for performance