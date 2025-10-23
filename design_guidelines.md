# Design Guidelines: Parcel Delivery Marketplace Platform

## Design Approach: Reference-Based (Marketplace + Utility Hybrid)

Drawing primary inspiration from **Airbnb** (trust-based two-sided marketplace), **BlaBlaCar** (travel sharing), and **Linear** (clean professional interface) to create a trustworthy, efficient mobile-first platform.

**Core Principles:**
- Trust & Transparency: Visual design that inspires confidence in peer-to-peer transactions
- Mobile-First Clarity: Information hierarchy optimized for small screens
- Rapid Task Completion: Streamlined flows for posting trips and booking parcels
- Professional Credibility: Clean, modern aesthetic befitting financial transactions

---

## Color Palette

**Primary Colors (Trust & Action):**
- Primary Blue: 214 88% 51% (Trustworthy, professional - CTAs, links, active states)
- Primary Dark: 214 70% 35% (Navigation, headers, emphasis)

**Neutral Foundation:**
- Background Light: 0 0% 98%
- Background Dark: 220 18% 12%
- Surface Light: 0 0% 100%
- Surface Dark: 220 15% 16%
- Text Primary Light: 220 15% 15%
- Text Primary Dark: 0 0% 95%
- Text Secondary Light: 220 10% 45%
- Text Secondary Dark: 0 0% 70%

**Status Colors:**
- Success Green: 142 76% 36% (Delivered, confirmed, verified)
- Warning Orange: 30 95% 55% (In transit, pending)
- Error Red: 0 84% 60% (Disputes, cancellations)
- Info Blue: 200 80% 50% (Notifications, tips)

**Accent (Sparingly):**
- Accent Teal: 180 65% 45% (Badges, highlights for premium features)

---

## Typography

**Font System:**
- **Primary:** Inter (Google Fonts) - Modern, highly legible on mobile
- **Display/Headers:** Inter Bold/Semibold
- **Body:** Inter Regular/Medium

**Type Scale:**
- Hero/Display: text-4xl md:text-5xl lg:text-6xl font-bold
- Page Titles: text-3xl md:text-4xl font-semibold
- Section Headers: text-2xl md:text-3xl font-semibold
- Card Titles: text-xl font-semibold
- Body Large: text-lg font-medium
- Body: text-base
- Small/Meta: text-sm text-secondary
- Tiny/Labels: text-xs uppercase tracking-wide

---

## Layout System

**Spacing Primitives:** Use Tailwind units of **2, 4, 8, 12, 16, 20** (e.g., p-4, gap-8, mb-12)

**Container Strategy:**
- Mobile: px-4 (16px gutters)
- Tablet: px-6 md:px-8
- Desktop: max-w-7xl mx-auto px-8

**Grid Systems:**
- Trip/Parcel Cards: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Dashboard Stats: grid-cols-2 md:grid-cols-4
- Profile Details: Single column mobile, 2-col desktop (md:grid-cols-2)

**Vertical Rhythm:**
- Section spacing: py-8 md:py-12
- Card spacing: p-4 md:p-6
- Form groups: space-y-4
- List items: gap-3

---

## Component Library

### Navigation
- **Mobile:** Bottom navigation bar (fixed) with 4-5 icons (Home, Search, Messages, Profile)
- **Desktop:** Top horizontal nav with logo left, links center, user menu right
- **Style:** Solid background with subtle shadow, active state with primary color indicator

### Cards (Trip/Parcel Listings)
- Rounded corners: rounded-xl
- Shadow: shadow-sm hover:shadow-md transition
- Padding: p-4 md:p-6
- Border: border border-gray-200 dark:border-gray-700
- Layout: Vertical stack on mobile, mixed horizontal on desktop
- Include: Avatar, route badge, price prominent, weight capacity, rating stars, verification badge

### Buttons
- Primary: bg-primary text-white rounded-lg px-6 py-3 font-medium
- Secondary: border-2 border-primary text-primary rounded-lg px-6 py-3
- Ghost: text-primary hover:bg-primary/10 rounded-lg px-4 py-2
- Sizes: Small (py-2 px-4 text-sm), Default (py-3 px-6), Large (py-4 px-8 text-lg)
- Icon buttons: Circular, w-10 h-10 or w-12 h-12

### Forms
- Input fields: border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3
- Focus state: ring-2 ring-primary border-primary
- Labels: text-sm font-medium mb-2 block
- Error state: border-red-500, text-red-500 helper text below
- Search bars: Prominent with icon, rounded-full on mobile

### Status Badges
- Pill shape: rounded-full px-3 py-1 text-xs font-medium
- Color-coded: bg-green-100 text-green-800 (delivered), bg-orange-100 text-orange-800 (transit)
- Include icon prefix for clarity

### Messaging Interface
- Chat bubbles: Sender (bg-primary text-white) right-aligned, Receiver (bg-gray-200) left
- Rounded: rounded-2xl rounded-br-sm (sender), rounded-bl-sm (receiver)
- Timestamp: text-xs text-gray-500 below
- Input: Fixed bottom bar with text area and send button

### Progress Tracking
- Horizontal stepper for desktop (4 steps: Déposé → En transit → Arrivé → Livré)
- Vertical timeline for mobile
- Active step: Primary color with checkmark
- Future steps: Gray outline
- Include timestamps below each completed step

### Profile/Rating
- Star rating: 5 stars, filled with gold/amber color
- User avatar: Circular, size variants (sm: w-8, md: w-12, lg: w-16, xl: w-24)
- Verification badge: Small checkmark icon in primary color overlay on avatar
- Stats cards: Grid of achievement/transaction counts

### Modals/Overlays
- Full-screen on mobile, centered card on desktop (max-w-lg)
- Backdrop: bg-black/50
- Close button: Top-right, prominent
- Padding: p-6 md:p-8

---

## Key Screens Layout

### Home/Search
- **Hero:** Compact search bar (departure, destination, date) - No large image, focus on functionality
- **Featured trips:** Card grid immediately below
- **How it works:** 3-step visual explainer with icons

### Trip Posting Form
- Multi-step wizard with progress indicator
- One section per screen on mobile (route → dates → capacity → pricing)
- Clear "Next" and "Back" buttons
- Summary card visible on final step

### Trip Details
- **Header:** Route with arrow, dates prominent, price/kg bold
- **Traveler card:** Avatar, name, rating, verification badge, "Message" button
- **Details grid:** Weight capacity, dimensions, accepted items, restrictions
- **CTA:** Fixed bottom "Book this trip" button on mobile

### Dashboard
- **Stats row:** Active trips, completed, earnings (cards or badges)
- **Tabs:** My Trips, My Parcels, Messages, History
- **List view:** Recent items with status badges

### Messaging
- **List view:** Conversations with last message preview, unread badge
- **Chat view:** Full-screen on mobile with back button, header showing other user info

---

## Images

**Hero Section:** NO large hero image - this is a utility-first app
**User Avatars:** Profile photos, circular, multiple sizes
**Trip Cards:** Small thumbnail for traveler (optional), focus on information over imagery
**Verification:** Icon-based badges, no photography
**Empty States:** Simple illustrations (flat style) for "no trips found", "no messages"

---

## Animations

Use very sparingly:
- Card hover: Subtle lift (translateY(-2px)) and shadow increase
- Button press: Scale(0.98) on active
- Page transitions: Simple fade (200ms)
- Loading states: Skeleton screens (shimmer effect) for card grids
- NO complex scroll animations or motion graphics

---

## Accessibility (Dark Mode)

Consistent dark mode across all components:
- Input fields: bg-gray-700 text-white border-gray-600
- Cards: bg-gray-800 border-gray-700
- Maintain WCAG AA contrast ratios minimum
- All interactive elements maintain 44x44px touch target on mobile