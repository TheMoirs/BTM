# Boules League Manager

## Overview

Boules League Manager is a web application for managing boules league competitions. It provides functionality for team registration, match tracking, and tournament bracket visualization across multiple stages (initial rounds, quarter-finals, semi-finals, and finals). The application follows a modern SaaS design approach inspired by Linear, emphasizing clarity, efficient workflows, and clean visual hierarchy.

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
- **Teams Table**: Stores team information (name, captain details with name/phone/email)
- **Matches Table**: Stores match data with team references, scores, stage, status, and winner
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