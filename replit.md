# ParcelLink - Peer-to-Peer Parcel Delivery Marketplace

## Overview
ParcelLink is a mobile-first web application that facilitates peer-to-peer parcel delivery between cities by connecting travelers with individuals needing to send parcels. Travelers can monetize their trips by carrying parcels, while senders benefit from quick and economical delivery options. The platform manages the entire transaction lifecycle, from trip search and booking to real-time communication and delivery tracking.

## User Preferences
Preferred communication style: Simple, everyday language.

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