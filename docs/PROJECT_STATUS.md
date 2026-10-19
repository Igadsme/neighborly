# Project status

Neighborly is an early marketplace foundation with several real, persisted flows. It is not a complete MVP or production-ready application.

## Connected frontend flows

- Session restore, login, registration, onboarding persistence, and logout use the centralized API client.
- Onboarding now requires manual neighborhood selection rather than pretending browser location was detected; its completion view uses the account's entered name and saved preferences, not fabricated user/listing counts. Message notification preference controls in-app message notifications; push/email delivery is not implemented.
- HomeFeed marketplace cards, Explore search and supported filters, and listing details use API listing records. HomeFeed and Explore initialize favorite state from persisted favorites.
- Dashboard now derives account summary, published listings, incoming request offers, exchanges, and conversations from APIs; offer accept/decline actions persist server-side.
- Profile now shows the signed-in user's persisted identity, published listings, completed exchange count, and received review records. It no longer displays prototype verification, trust scores, fake ratings, or simulated follow/report actions.
- Categories now loads the actual category catalog and newest published listings; choosing a category opens Explore with that category selected instead of inventing category counts and trending items.
- The signed-out landing page now previews public API listings/categories and no longer claims fabricated local usage counts, testimonials, verification badges, or trust outcomes. Unpublished legal docs are disclosed; this build should not collect sensitive production user data.
- Housing, Services, and Jobs now query real published marketplace listings in matching persisted categories, with search, save, details, and create-listing navigation. Housing applications, bookings, job applications, and provider/employer modules remain unavailable.
- Legacy listing routes without a persisted listing ID and the map page now show explicit unavailable states instead of prototype listing details, fabricated pins, or fabricated safe-meetup locations.
- Listing creation loads real categories, saves metadata as a private draft, uploads up to five validated images with signed S3-compatible forms, sets cover/order, and publishes only after successful uploads. Draft management after leaving the creation flow is not implemented.
- Favorites and saved searches load from and persist to the API; saved searches can restore their query/filters and be deleted by their owner, while favorite UI rolls back on failed writes.
- Need requests can be created and discovered. Request owners can accept or reject offers.
- Accepting an offer atomically accepts the offer, closes the request, creates a transaction, and creates a private conversation.
- Transactions can be scheduled, advanced through valid states, completed, and reviewed.
- Messages use durable REST history/send/read endpoints and authenticated Socket.IO events, with polling when disconnected.
- Unavailable HomeFeed sections are labeled instead of displaying seeded community, event, provider, and neighbor fixtures.

## Backend endpoints implemented

- `GET /api/v1/health`, `GET /api/v1/ready`
- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`
- `GET /api/v1/users/me`, `PATCH /api/v1/users/me/onboarding`
- `GET /api/v1/categories`
- Listings: `GET /listings`, `GET /listings/:id`, `POST /listings`, `PATCH /listings/:id`, `DELETE /listings/:id`, `POST /listings/:id/favorite`, `GET /listings/favorites`, `GET|POST /listings/saved-searches`, `DELETE /listings/saved-searches/:id`
- Listing media: `POST /listings/:id/publish`, `POST /listings/:id/images/upload`, `POST /listings/:id/images/complete`, `POST /listings/:id/images/reorder`, `DELETE /listings/:id/images/:imageId`
- Requests: `GET|POST /requests`, `POST /requests/:id/offers`, `POST /requests/offers/:id/counter`, `PATCH /requests/offers/:id/accept`, `PATCH /requests/offers/:id/reject`
- Conversations: `GET|POST /conversations`, `GET|POST /conversations/:id/messages`, `PATCH /conversations/:id/read`
- Notifications: `GET /notifications`, `GET /notifications/unread-count`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`
- Transactions: `GET /transactions`, `PATCH /transactions/:id/status`, `POST /transactions/:id/appointments`, `POST /transactions/:id/reviews`
- Swagger UI: `/docs`

The API uses PostgreSQL via Prisma. Offer acceptance and transaction transitions use database-side guards/transactions. Public listing, request, and conversation responses use selected fields to avoid returning password hashes or exact coordinates.

## Still incomplete

- No live database migration or end-to-end workflow has been verified; the Docker daemon probe timed out. Prisma schema validation and generated-client compilation do not prove runtime database behavior.
- No Playwright suite exists for the critical request-to-review journey. No API/database integration test coverage exists for the new marketplace flow or object-storage uploads.
- Community clearly reports that posts/events are unavailable rather than rendering seeded discussions or inert interactions. MapDiscovery and the legacy ListingDetail entry show explicit unavailable states. HomeFeed services, events, community, follow, alerts, and map surfaces are explicitly marked unavailable.
- Listing image upload uses S3-compatible signed POSTs and owner/type/size/signature checks; local MinIO is in Compose. Listing draft management UI after leaving the creation flow, refresh-token rotation, Redis-backed behavior, payment processing, geospatial radius discovery, email/phone verification, push/email notifications, trust metrics, reports/blocks, moderation, and account export/deletion remain unimplemented. Durable in-app notifications cover offer/counteroffer decisions and incoming messages.
- Explore supports only the filters implemented by the API; verified-only filtering is intentionally disabled because verification data does not exist. The API no longer equates email confirmation with trust verification. Saved-search persistence exists, but matching/price alerts and delivery do not.
- Existing transaction/request operations need live concurrency, authorization, and migration tests before being relied on in production.

## Verification and environment

Verified in this checkout:

- `cd app && npx -y -p node@22 -p pnpm@10.34.3 -c 'pnpm exec tsc --noEmit && pnpm build'` (passed with Node 22.23.3 and pnpm 10.34.3)
- `cd app/backend && npx -y -p node@22 -p pnpm@10.34.3 -c 'export DATABASE_URL="postgresql://neighborly:neighborly@localhost:5432/neighborly" && pnpm exec prisma validate && pnpm exec prisma generate && pnpm exec tsc --noEmit && pnpm test && pnpm build'` (schema, types, 6 suites/21 tests, build passed)
- `cd app && docker compose --env-file backend/.env.example config --quiet` (Compose configuration parsed; services were not started)

Backend lint was attempted with `cd app/backend && npx pnpm@9 lint` but is blocked because the configured `eslint` executable is not installed or declared. Docker-backed database/migration, MinIO upload, and Playwright end-to-end tests were not run; a direct Docker daemon probe timed out.

The host reports `darwin arm64` (Apple Silicon), Node `20.16.0`, and pnpm `9.15.9`; `.mise.toml` pins Node 22 and pnpm 10.34.3. Frontend/backend checks passed using temporary Node 22.23.3/pnpm 10.34.3. The Prisma validation used a syntactically valid local URL and did not connect to a database. No local `.env` is present.

The working local API requires `DATABASE_URL`, `JWT_SECRET`, and `CORS_ORIGIN`; image upload also requires configured S3 endpoint, bucket, access/secret keys, and public image URL. Docker/Postgres/Redis/MinIO, payment, and map services have not been run or externally verified. The latest frontend JavaScript bundle is about 414 kB minified.

## Readiness

The app is not yet safe to call a complete MVP or production-ready. The connected slices are suitable for continued local development, but the critical database-backed journey, live storage validation, end-to-end tests, operational services, and remaining major page integrations are outstanding.
