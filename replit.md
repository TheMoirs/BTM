# Boules League Manager

## Overview
Boules League Manager is a web application designed to manage boules league competitions. It facilitates team registration, tracks match progress, visualizes tournament brackets across various stages (initial rounds, quarter-finals, semi-finals, finals), and supports bulk data entry via CSV imports. The application aims for a modern SaaS design, emphasizing clarity and efficient workflows.

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
    - **Matches**: Stores team references, scores, stage, status, winner, and an optional scheduled date. Features a unique constraint on team pairs to prevent duplicate matches.
    - **Results**: Automatically generated from match outcomes, recording match info, date, stage, team name, points, and scores. Two result records per completed match. Stage field enables filtering and summary statistics by tournament stage.
- **Validation**: Shared Zod schemas ensure client-server consistency.
- **Initialization**: Automatic database initialization for unique constraints on startup.

## External Dependencies

- **UI Libraries**: Radix UI (headless components), Lucide React (icons), class-variance-authority, tailwind-merge, clsx.
- **Form & Validation**: React Hook Form, @hookform/resolvers, Zod, drizzle-zod.
- **Data Import**: papaparse for CSV parsing.
- **Database & ORM**: @neondatabase/serverless (PostgreSQL client), drizzle-orm, drizzle-kit.
- **Development Tools**: esbuild, tsx, PostCSS, Autoprefixer.
- **Fonts**: Google Fonts (Inter, Architects Daughter, DM Sans, Fira Code, Geist Mono).