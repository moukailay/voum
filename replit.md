# ParcelLink - Peer-to-Peer Parcel Delivery Marketplace

## Overview
ParcelLink is a mobile-first web application that facilitates peer-to-peer parcel delivery between cities by connecting travelers with individuals needing to send parcels. Travelers can monetize their trips by carrying parcels, while senders benefit from quick and economical delivery options. The platform manages the entire transaction lifecycle, from trip search and booking to real-time communication and delivery tracking.

## User Preferences
Preferred communication style: Simple, everyday language.

## Recent Changes (October 25, 2025)

### Traveler Booking Management System
- **Problem:** Travelers (mikhail09ther@gmail.com example) could create trips and see them booked, but had no way to access booking details or validate PIN codes for delivery confirmation.
- **Solution:**
  - **Backend:** Added GET `/api/trips/:id/bookings` endpoint (traveler-only, returns bookings with sender details)
  - **Backend:** Modified GET `/api/trips/my-trips` to include `bookingCount` for each trip
  - **Frontend TripDetails:** Added "Réservations" section visible only to trip owner, displaying clickable booking cards with sender info, weight, price, and status badges
  - **Frontend TripCard:** Added secondary badge showing booking count (e.g., "1 réservation") when bookingCount > 0
  - **Frontend MyTrips:** Displays booking count indicator on trip cards
  - **Navigation Flow:** MyTrips → Click trip → See bookings → Click booking → BookingDetails → Validate PINs
- **Impact:** Travelers now have complete visibility and control over their trip bookings with clear path to PIN validation.
- **E2E Tested:** Full workflow validated from trip creation → booking → traveler review → pickup PIN → delivery PIN → escrow release.

### PIN-Based Delivery Confirmation System
- **Fixed queryKey Bug:** MyBookings now uses correct queryKey `["/api/bookings/my-bookings"]` instead of `["/api/bookings"]`
- **Fixed Action Logic:** BookingDetails correctly determines pickup vs delivery action (pending/confirmed → pickup, else → delivery)
- **Status Flow:** pending → picked_up (after pickup PIN) → delivered (after delivery PIN) with automatic escrow release
- **Mobile-First Design:** Large PIN display with copy buttons, responsive badges, touch targets ≥44px

### Messaging Navigation Fix
- **Problem:** Message button in TripDetails created empty conversations instead of pre-selecting the correct conversation.
- **Solution:** 
  - TripDetails now navigates to `/messages?userId=xxx` instead of creating a conversation
  - Messages page parses `window.location.search` (not wouter's `location`) to auto-select conversation
  - Conditional fetch of `/api/users/:userId` for new conversation context
  - Added GET `/api/users/:userId` route for user data retrieval
- **Impact:** Users can now seamlessly message travelers from trip details pages.

### Object Storage Configuration
- **Setup:** Configured Replit Object Storage bucket for file uploads in messaging
- **Bucket:** repl-default-bucket-de357f19-89ae-432b-b932-36f4b0ba15d6
- **Environment Variables:** PRIVATE_OBJECT_DIR, PUBLIC_OBJECT_SEARCH_PATHS, DEFAULT_OBJECT_STORAGE_BUCKET_ID
- **Impact:** File attachments (images, PDFs) now upload successfully with previews.

### Composition Bar Improvements
- **Accessibility:** Added ARIA labels for attach/send buttons, focus visible states
- **Mobile-first:** Touch targets ≥44px, text-base 16px, responsive 320-375px tested
- **Upload UX:** Hidden file input, inline previews, parallel upload, error toasts

## System Architecture

### Frontend
- **Framework:** React 18 with TypeScript, using Vite for building.
- **UI/UX:** Mobile-first responsive design, leveraging Shadcn/ui (Radix UI) and Tailwind CSS. Employs a professional color palette with a trustworthy blue primary, cards, shadows, and elevation for visual hierarchy.
- **State Management:** TanStack Query for server state, React Hook Form with Zod for validation, and React Context for global state like themes and authentication.

### Backend
- **Framework:** Express.js on Node.js with TypeScript.
- **API:** RESTful API with JSON, supporting WebSocket for real-time features.
- **Authentication:** Replit Auth (OpenID Connect) via Passport.js, with session management backed by PostgreSQL.
- **Data Layer:** Drizzle ORM for type-safe database interactions with a schema-first approach.
- **Real-time Features:** Advanced WebSocket server for messaging, including typing indicators, online/offline status, read receipts, delivery confirmations, and file upload progress.
- **Security:** Server-side price calculation during booking to prevent manipulation, multi-layer validation for bookings, and comprehensive file validation with two-step antivirus scanning for uploads.
- **Messaging:** Supports direct messaging between users with attachment capabilities, message status tracking, and reporting features.
- **Booking Flow:** Secure backend booking logic ensures data integrity and accurate price calculation, with atomic updates to trip availability and system message generation for new bookings.

### Database
- **Provider:** Neon Database (serverless PostgreSQL).
- **Schema:** Designed with core entities like Users, Trips, Bookings, and Messages, alongside tables for attachments, moderation (blocked users, reports), user status, preferences, and notifications. Uses UUID primary keys and decimal types for monetary values.

## External Dependencies

- **Database:** Neon Database (@neondatabase/serverless)
- **Authentication:** Replit Auth (OpenID Connect), `openid-client`, Passport.js
- **UI Components:** Radix UI, Lucide React (icons), React Day Picker, Vaul (mobile drawer)
- **Utilities:** `date-fns`, `class-variance-authority` (CVA), `clsx`, `tailwind-merge`, Zod, nanoid
- **File Storage:** Replit Object Storage (`@google-cloud/storage`, `@uppy/core`, `@uppy/aws-s3`)