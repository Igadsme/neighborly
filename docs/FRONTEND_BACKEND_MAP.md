# Frontend-to-Backend Feature Map

## 1. Page inventory and corresponding domain modules

| Frontend page | Current purpose | Required backend module | Key data/actions |
| --- | --- | --- | --- |
| Landing | Marketing and sign in entry | `auth`, `users` | Sign up, sign in, onboarding state |
| Onboarding | Account setup and neighborhood interests | `users`, `profiles`, `preferences` | Location, interests, notifications |
| HomeFeed | Personalized local marketplace overview | `search`, `listings`, `community`, `notifications` | Feed, search discovery, saved items, community alerts |
| Explore | Search and filter marketplace inventory | `search`, `listings`, `locations` | Query, filter, sort, map view |
| Categories | Category landing and browsing | `categories`, `listings` | Category pages, metadata, trending filters |
| MapDiscovery | Geographic marketplace browsing | `search`, `locations`, `map` | Map pins, radius search, nearby results |
| ListingDetail | Detailed listing view and contact flow | `listings`, `offers`, `messaging`, `media` | Get listing, saved state, negotiate, ask seller |
| CreateListing | New listing creation | `listings`, `media`, `pricing` | Media upload, category selection, price, publish |
| Messages | Conversation center | `messaging`, `notifications` | Thread list, send/receive message, read receipts |
| SavedItems | Saved listings and searches | `favorites`, `savedSearches`, `wishlist` | Wishlist, search persistence |
| Profile | User identity and profile status | `users`, `profiles`, `trust` | Profile info, review summary, badges, verification |
| Dashboard | User operations and stats | `transactions`, `offers`, `analytics` | Incoming offers, sales, transactions, settlements |
| Housing | Housing-specific marketplace | `listings`, `housing`, `locations` | Apartments, rentals, roommates |
| Services | Local services marketplace | `services`, `profiles` | Provider profiles, bookings, service offers |
| Jobs | Local job marketplace | `jobs`, `applications` | Listings, applications, hiring workflow |
| Community | Local events, posts, groups | `community`, `notifications` | Posts, events, missions, volunteer tasks |

## 2. Current mock data sources

From `src/data/index.ts`:

- `sellers`: user profiles, trust metrics, response times, neighborhoods
- `listings`: marketplace items with tags, price, seller details, saved state, availability
- `jobs`: role, company, compensation, schedule, remote status
- `services`: local providers and category metadata
- `housingListings`: tenant and rental inventory
- `communityPosts`: events, posts, neighborhood discussions
- `mapListings`: map-based pins and geographic context
- `conversations`: message threads and status state

Most of this metadata should map to normalized domain tables and API responses.

## 3. Existing functionality that appears operational but is currently visual-only

These states are UI-complete but not backend-backed:

- Save/bookmark toggle on listing cards
- Search suggestions and filter state in Explore
- Map location selection and radius search
- Create listing wizard completion and save-draft behavior
- Offer and negotiation actions on ListingDetail
- Chat sending and read status in Messages
- Dashboard metrics and incoming offer data
- Community post interactions and event RSVP flows
- User profile editing and verification actions
- Favorite searches and local wishlists

## 4. Required domain mapping

### Identity and profile

- `Landing` + `Onboarding` -> `User`, `Profile`, `UserPreference`, `Verification`, `DeviceSession`
- `Profile` -> `Profile`, `TrustPassport`, `Review`, `ModerationAction`

### Marketplace and requests

- `Explore`, `Categories`, `HomeFeed`, `ListingDetail` -> `Listing`, `ListingImage`, `ListingCategory`, `ListingAttribute`, `Favorite`, `SavedSearch`, `PriceHistory`
- `CreateListing` -> `Listing`, `ListingImage`, `ListingAvailability`, `ListingLocation`
- `request-first flow` -> `NeedRequest`, `RequestOffer`, `CounterOffer`, `OfferItem`, `RequestMatch`, `MatchPreference`

### Transactions and messaging

- `Dashboard`, `Messages`, `ListingDetail` -> `Transaction`, `TransactionParticipant`, `Conversation`, `Message`, `MessageAttachment`, `Appointment`, `Payment`, `Payout`, `Dispute`

### Community and trust

- `Community`, `Profile`, `Dashboard` -> `CommunityPost`, `CommunityComment`, `CommunityEvent`, `CommunityReaction`, `TrustCircle`, `TrustPassport`, `Review`

## 5. Frontend consistency issues to correct for real data

The current UI is strong, but several behaviors need real-data alignment before production:

- Search and filter should be server-driven, not client state only
- Save states and favorites must persist per user
- Messaging should be authenticated and live
- Listing detail should pull from an actual listing id and seller record
- Dashboard data should be derived from real transactions, not static arrays
- Community activity should be scoped to neighborhoods and permissions
- Verification badges and trust metrics must be computed from audited trust events

## 6. Proposed integration approach

1. Keep the existing React screens and component library intact
2. Replace mock data imports with API hooks/service layer calls
3. Use a typed `api/client.ts` service for REST and WebSocket flows
4. Normalize response DTOs to match the UI data shapes used by the current components
5. Add optimistic UI patterns selectively for save, message send, and offer status changes
6. Use server-side validation to ensure search, price, and location results remain consistent with permissions and policy

## 7. Recommended API boundaries

- `GET /api/v1/listings` – feed and search results
- `GET /api/v1/listings/:id` – listing detail
- `POST /api/v1/listings` – create listing
- `POST /api/v1/requests` – create need request
- `POST /api/v1/offers` – send offer
- `GET /api/v1/messages/:conversationId` – message thread
- `POST /api/v1/messages` – send message
- `GET /api/v1/dashboard` – metrics and user analytics
- `GET /api/v1/community/posts` – community feed
- `GET /api/v1/users/:id/profile` – profile and passport

Implemented conversation endpoints:

- `GET /api/v1/conversations`
- `GET /api/v1/conversations/:id/messages`
- `POST /api/v1/conversations/:id/messages`
- `PATCH /api/v1/conversations/:id/read`

## 8. Implementation note

These maps and interfaces should be used as the beginning of the production contract. The codebase already defines the front-end model sufficiently well to justify API contract design before broad code changes begin.

## 9. Implemented foundation slice

The extracted project now includes a backend foundation under `backend/` and a centralized typed client under `src/api/`.

Implemented backend endpoints:

- `GET /api/v1/health`
- `GET /api/v1/ready`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me/onboarding`
- `GET /api/v1/categories`
- `GET /api/v1/listings`
- `POST /api/v1/listings`
- `GET /docs` for Swagger/OpenAPI

Implemented infrastructure:

- PostgreSQL/PostGIS and Redis services in `docker-compose.yml`
- Prisma schema and migrations at `backend/prisma/migrations/0001_init` and `backend/prisma/migrations/0002_onboarding`
- Environment validation in `backend/src/common/config/env.validation.ts`
- Helmet, CORS, global validation, JWT bearer authorization, and Argon2 password hashing
- Typed frontend request client in `src/api/client.ts` with centralized token handling and structured `ApiError`

The onboarding and create-listing flows now call durable APIs. The remaining marketplace, saved-item, dashboard, community, housing, services, and jobs pages still render the original prototype fixtures until their corresponding vertical slices are connected. This is intentional: the existing visual source of truth is preserved while backend contracts are introduced incrementally.

## 10. Current frontend integration status

- `App` restores a persisted session through `GET /users/me` and signs out through the centralized API client.
- `Landing` has a real email/password login dialog; unsupported social providers are explicitly labeled unavailable.
- `Onboarding` creates an account, persists neighborhood/location, interests, capabilities, and notification preferences, and displays API errors.
- `CreateListing` loads categories and publishes listing metadata through `POST /listings`; image objects are still local until the signed-upload slice is implemented.
- Listing persistence endpoints now also support ownership-protected edits, archival, favorites, and saved searches. `ListingDetail` and `SavedItems` still require route/id and fixture-state replacement before those controls can be connected safely.
- `SavedItems` now loads authenticated favorites and saved searches, shows loading/error/empty states, and persists favorite removal through `POST /listings/:id/favorite`. Price-drop and new-match sections remain explicitly unavailable until alert history endpoints exist.
