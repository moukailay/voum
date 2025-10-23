# ParcelLink - Peer-to-Peer Parcel Delivery Marketplace

## Overview

ParcelLink is a mobile-first web application that connects travelers with people who need to send parcels. The platform enables travelers to monetize their trips by carrying parcels for senders, creating a peer-to-peer marketplace for parcel delivery between cities.

**Core Concept:** Travelers post their trips (departure/destination cities, dates, available weight capacity), and senders search for compatible trips to book parcel deliveries. The application handles the entire transaction flow from search and booking to real-time messaging and delivery tracking.

**Target Users:**
- **Travelers:** Individuals making trips between cities who want to earn money by carrying parcels
- **Senders:** People who need to send parcels quickly and economically using trusted travelers

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System:**
- React 18 with TypeScript for type safety
- Vite as the build tool and development server
- React Router (Wouter) for client-side routing
- Mobile-first responsive design approach

**UI Component System:**
- Shadcn/ui component library (Radix UI primitives with custom styling)
- Tailwind CSS for utility-first styling with custom design tokens
- CSS variables for theme management (light/dark mode support)
- Design system inspired by Airbnb, BlaBlaCar, and Linear for trust-focused marketplace UI

**State Management:**
- TanStack Query (React Query) for server state management and caching
- React Hook Form with Zod for form validation
- React Context for theme and authentication state

**Key Design Decisions:**
- Mobile-first approach with bottom navigation on mobile, desktop navigation on larger screens
- Responsive breakpoint at 768px (md) separating mobile/desktop experiences
- Professional color palette centered on trustworthy blue primary color (214 88% 51%)
- Consistent use of cards, shadows, and elevation for visual hierarchy

### Backend Architecture

**Server Framework:**
- Express.js as the HTTP server
- Node.js runtime with ES modules
- TypeScript for type safety across the stack

**API Design:**
- RESTful API endpoints with conventional HTTP methods
- JSON request/response format
- WebSocket support for real-time messaging
- Session-based authentication with persistent sessions

**Authentication & Authorization:**
- Replit Auth integration using OpenID Connect (OIDC)
- Passport.js for authentication middleware
- Session management with PostgreSQL-backed session store (connect-pg-simple)
- User session tracking with JWT tokens from Replit's OIDC provider

**Data Layer:**
- Drizzle ORM for type-safe database interactions
- Schema-first approach with TypeScript types generated from database schema
- Shared schema between client and server for type consistency
- Transaction support for data integrity

**Real-time Features:**
- WebSocket server for real-time messaging between users
- Client tracking map for active WebSocket connections
- Message broadcasting based on user IDs

### Database Schema

**Core Entities:**

1. **Users Table:**
   - Identity fields from Replit Auth (id, email, profile image)
   - User profile (first name, last name, phone number)
   - Trust indicators (verification status, rating, trip counts)
   - Separate counters for trips as traveler vs. sender

2. **Trips Table:**
   - Travel details (departure/destination cities, dates)
   - Capacity management (available weight, max dimensions)
   - Pricing (price per kg)
   - Item restrictions (accepted/restricted items)
   - Status tracking (active, completed, cancelled)
   - Foreign key to traveler (users table)

3. **Bookings Table:**
   - Links senders to specific trips
   - Parcel details (weight, description, pickup/delivery addresses)
   - Escrow/payment status tracking
   - Multi-stage delivery status (pending → confirmed → picked_up → in_transit → arrived → delivered)
   - Foreign keys to sender (users), trip, and traveler

4. **Messages Table:**
   - Direct messaging between users
   - Links to specific bookings for context
   - Timestamp tracking for conversation ordering
   - Foreign keys to sender and receiver (users)

5. **Notifications Table:**
   - User notifications for booking updates, messages, etc.
   - Read/unread status tracking
   - Type categorization for different notification kinds

6. **Sessions Table:**
   - Required for Replit Auth session persistence
   - Stores serialized session data with expiration

**Design Decisions:**
- PostgreSQL via Neon Database (serverless PostgreSQL)
- UUID primary keys for distributed system compatibility
- Decimal type for monetary values (ratings, prices) to avoid floating-point issues
- Timestamp fields with default values for audit trails
- Indexed foreign keys for query performance

### External Dependencies

**Database:**
- Neon Database (serverless PostgreSQL via @neondatabase/serverless)
- WebSocket support for serverless PostgreSQL connections

**Authentication:**
- Replit Auth (OpenID Connect provider)
- OAuth2/OIDC token management via openid-client
- Passport.js strategy for Express integration

**UI Component Libraries:**
- Radix UI primitives (18+ components for accessible UI patterns)
- Lucide React for consistent iconography
- React Day Picker for date selection
- Vaul for mobile drawer component

**Utilities:**
- date-fns for date manipulation
- class-variance-authority (CVA) for component variant management
- clsx and tailwind-merge for className composition
- Zod for runtime validation and type inference
- nanoid for unique ID generation

**Development Tools:**
- Vite plugins for Replit integration (cartographer, dev banner, runtime error overlay)
- Drizzle Kit for database migrations
- TSX for TypeScript execution in development

**Build & Deployment:**
- esbuild for server bundle production builds
- Vite for client bundle production builds
- Separate dist folders for client (dist/public) and server (dist)