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
- Enhanced WebSocket server for real-time messaging with advanced features:
  - Typing indicators with 3-second auto-stop timeout
  - Online/offline status broadcasting to all clients
  - Read receipts (message seen notifications)
  - Message delivery confirmations (sent → delivered → read)
  - File upload progress notifications
  - Client tracking with online status, last seen, and typing state
  - Automatic cleanup of typing timeouts on disconnect

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
   - Message status tracking (sending, sent, delivered, failed)
   - Timestamp tracking for conversation ordering
   - Foreign keys to sender and receiver (users)

5. **Message Attachments Table:**
   - File attachments for messages (images, documents)
   - Secure object storage URLs with ACL-based access control
   - File metadata (name, type, size, thumbnail URL)
   - Optional expiration dates for temporary attachments
   - Foreign key to message (nullable for pre-message uploads)

6. **Blocked Users Table:**
   - User blocking for moderation
   - Prevents messaging between blocked users
   - Foreign keys to blocker and blocked user

7. **Message Reports Table:**
   - Report system for inappropriate messages
   - Categories: spam, fraud, abuse, other
   - Status tracking (pending, reviewed, resolved)
   - Foreign keys to reporter, reported message, and reported user

8. **User Status Table:**
   - Tracks online/offline/away status
   - Last seen timestamps
   - Optional status messages

9. **User Preferences Table:**
   - Notification preferences (email, push, SMS)
   - Quiet hours configuration
   - Notification sound settings
   - Foreign key to user

10. **Message Events Table:**
    - Comprehensive audit log for all message actions
    - Event types: created, read, edited, deleted, reported, blocked
    - Metadata stored as JSONB for flexible logging
    - Foreign key to message (NOT NULL)

11. **Notifications Table:**
    - User notifications for booking updates, messages, file uploads, etc.
    - Read/unread status tracking
    - Type categorization for different notification kinds

12. **Sessions Table:**
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

**File Storage & Security:**
- Replit Object Storage integration (@google-cloud/storage, @uppy/core, @uppy/aws-s3)
- ACL-based access control for private file attachments
- Comprehensive file validation system (server/fileValidator.ts):
  - MIME type validation (only PDF, JPG, PNG allowed)
  - File size limits (3MB for images, 5MB for documents)
  - Suspicious filename detection (blocks executables, path traversal)
  - Magic byte validation (file signature checking for type mismatch detection)
  - Content pattern scanning (detects embedded scripts, PHP eval, event handlers)
- Two-step antivirus scanning before file persistence
- ObjectUploader component with client-side defaults and preview support
- Presigned URL generation for secure direct-to-storage uploads

## Recent Changes (Phase 2)

### October 24, 2025

**Database Schema Enhancements:**
- Added 6 new tables for rich messaging features (message_attachments, blocked_users, message_reports, user_status, user_preferences, message_events)
- Fixed critical schema issues (messages.status default value, messageEvents.messageId NOT NULL constraint)
- Added proper indexes for query performance (expiresAt, message queries)
- Configured cascade deletion for foreign key relationships

**File Storage Integration:**
- Installed and configured Replit Object Storage for file uploads
- Implemented ObjectUploader React component with file type defaults
- Created comprehensive server-side validation with two-step antivirus scanning
- Set up ACL policies for private attachment access control
- File types: Images (JPG/PNG, 3MB max), Documents (PDF, 5MB max)

**Enhanced WebSocket Protocol:**
- Extended WebSocket server with typing indicators (auto-stop after 3s)
- Implemented online/offline status broadcasting
- Added read receipts (message seen notifications)
- Created delivery confirmation system (sent → delivered → read)
- Added file upload progress notifications
- Improved client lifecycle management with proper cleanup