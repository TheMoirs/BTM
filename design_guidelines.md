# Design Guidelines: Boules League Management Application

## Design Approach

**Selected Approach:** Design System - Linear/Modern SaaS
**Justification:** This is a utility-focused management tool requiring efficient data entry, clear information display, and intuitive navigation. Drawing inspiration from Linear's clean interface, Notion's organizational structure, and modern tournament management platforms.

**Core Principles:**
- Clarity over decoration - every element serves a functional purpose
- Efficient workflows for common tasks (team registration, match recording)
- Visual hierarchy that guides users through complex tournament structures
- Responsive data displays that work across devices

## Typography System

**Font Stack:**
- Primary: Inter (Google Fonts) - for UI elements, headings, navigation
- Secondary: JetBrains Mono (Google Fonts) - for match scores and numerical data

**Type Scale:**
- Page Titles: text-3xl font-bold (Tournament stages, main sections)
- Section Headers: text-xl font-semibold (Team lists, match groups)
- Card Titles: text-lg font-medium (Team names, match headers)
- Body Text: text-base (Contact details, descriptions)
- Labels/Meta: text-sm text-gray-600 (Form labels, timestamps)
- Scores/Stats: text-2xl font-mono font-bold (Match results)

## Layout System

**Spacing Primitives:** Use Tailwind units of 2, 4, 6, 8, and 12
- Component padding: p-4 or p-6
- Section margins: mb-8 or mb-12
- Card gaps: gap-4 or gap-6
- Form field spacing: space-y-4

**Grid System:**
- Desktop: 2-column layout for team lists (grid-cols-2 gap-6)
- Tournament brackets: Horizontal stages with connecting lines
- Forms: Single column max-w-2xl for optimal input experience
- Match cards: 1 column mobile, 2-3 columns desktop based on stage

## Component Library

### Navigation
**Top Navigation Bar:**
- Fixed header with app title "Boules League Manager"
- Primary navigation tabs: Teams | Matches | Brackets | Results
- Action button top-right: "+ New Team" or "+ Record Match" based on context
- Clean horizontal layout with subtle bottom border

### Dashboard Layout
**Main Content Area:**
- Two-panel layout: Sidebar (navigation/filters) + Main content (max-w-6xl)
- Quick stats cards at top: Total Teams | Active Matches | Completed Games
- Tabbed interface to switch between tournament stages

### Team Management

**Team Cards:**
- Card-based layout with subtle border, rounded corners
- Team name as primary heading (text-lg font-semibold)
- Captain details below in smaller text: Name, Phone, Email icons + text
- Actions menu (edit/delete) in top-right corner
- Hover state: subtle shadow elevation

**Team Registration Form:**
- Clean, single-column form (max-w-2xl centered)
- Grouped sections: Team Information | Captain Contact Details
- Input fields with clear labels above
- Large, prominent "Register Team" button at bottom

### Match Management

**Match Cards:**
- Horizontal card layout showing: Team A vs Team B
- Score inputs/displays prominently centered between team names
- Match metadata below: Stage (badge), Date, Status
- Color-coded status indicators: Scheduled (blue), In Progress (yellow), Completed (green)

**Match Creation Interface:**
- Two-column team selection with "VS" separator
- Dropdown selectors for teams with search functionality
- Tournament stage selector (radio buttons or segmented control)
- Date/time picker for scheduled matches

### Tournament Bracket Display

**Bracket Visualization:**
- Horizontal swim-lane layout for each stage: Initial → Quarters → Semis → Finals
- Match cards arranged vertically within each stage
- Connecting lines between advancing teams (SVG or borders)
- Responsive: Stack stages vertically on mobile
- Winner highlighted with bold border and subtle background

**Stage Headers:**
- Clear stage labels with match counts: "Semi-Finals (2 matches)"
- Progress indicator showing completed vs total matches

### Data Tables

**Team Listing Table:**
- Sortable columns: Team Name | Captain | Contact | Matches Played | W-L Record
- Alternating row backgrounds for readability
- Sticky header on scroll
- Quick action icons (edit, view matches, delete)

**Match History Table:**
- Columns: Date | Stage | Team A | Score | Team B | Status
- Filter controls above table: Stage dropdown, Date range, Status
- Expandable rows to show match details

### Forms & Inputs

**Input Fields:**
- Consistent height (h-10 or h-12)
- Border with focus state (ring)
- Labels positioned above inputs
- Helper text below for validation/guidance
- Error states with red border and text

**Buttons:**
- Primary: Solid background for main actions (Register, Save, Record Result)
- Secondary: Outlined for cancel/back actions
- Sizes: Medium (h-10) for forms, Small (h-8) for inline actions
- Icon + text combinations where helpful

### Status & Badges

**Tournament Stage Badges:**
- Rounded pills with distinct colors per stage
- Initial Stage (gray), Quarter-Finals (blue), Semi-Finals (purple), Finals (gold)
- Small text (text-xs) with px-3 py-1 padding

**Match Status Indicators:**
- Dot + text combinations
- Scheduled (blue dot), Live (pulsing green dot), Completed (green checkmark)

### Empty States

**No Teams/Matches:**
- Centered illustration placeholder (icon from Heroicons)
- Helpful message: "No teams registered yet"
- Clear CTA button: "Register Your First Team"

## Images

**No hero images** - This is a functional application, not a marketing site.

**Optional Team Logos/Avatars:**
- Small circular avatars (w-10 h-10) next to team names if provided
- Default: Initials in colored circles using team name hash

## Responsive Behavior

**Breakpoints:**
- Mobile (base): Single column, stacked cards, simplified brackets
- Tablet (md): Two columns for teams/matches, simplified bracket view
- Desktop (lg): Full multi-column layouts, horizontal bracket display

**Mobile-Specific:**
- Bottom navigation bar for main sections
- Simplified match cards with vertical team layout
- Collapsible filters and advanced options
- Larger touch targets for buttons (min h-12)

## Accessibility

- All form inputs have associated labels
- ARIA labels for icon-only buttons
- Keyboard navigation for all interactive elements
- Focus indicators on all focusable elements
- Sufficient color contrast for text (WCAG AA minimum)
- Screen reader announcements for dynamic content updates

This design prioritizes efficient workflows, clear data visualization, and intuitive navigation suitable for tournament organizers managing league competitions.