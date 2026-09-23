# API Specification

Base URL: `/api/v1`. Swagger UI: `/docs` (outside the global prefix).

This document replaces the mixed "initial production contract" that listed planned routes as if they were live. **IMPLEMENTED** means a controller method exists under `backend/src`. **TARGET** means v1 follow-on work that is not in the tree. The typed client in `src/api/client.ts` mirrors auth, listings, requests, conversations, transactions, and reviews. It does not call housing, jobs, services, or community yet (`docs/FRONTEND_BACKEND_MAP.md`).

v1 excludes OpenAI, embeddings, and semantic search. Do not add those routes.

## Conventions

### IMPLEMENTED

- Auth header: `Authorization: Bearer <accessToken>` on guarded routes. `AuthGuard` rejects a missing or invalid JWT.
- Validation: global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`. DTOs use `class-validator` / `class-transformer`.
- Errors: Nest default exception JSON. Typical validation failure is HTTP 400 with `message` as a string array. The frontend `ApiError` reads `message` only.
- Listing pagination: `limit` (1–100, default 24) and `offset` (default 0). No cursor.
- Listing text filter: case-insensitive `contains` on `title` and `description`. Not full-text, not vector, not geo.
- IDs: UUID strings.
- Money: integer cents (`priceCents`, `budgetCents`, `amountCents`).

### TARGET

Not built. Do not code the UI against these as if they return today.

- Refresh-token rotation and a `POST /auth/refresh` body.
- A single error envelope `{ code, message, details, timestamp }`.
- Cursor pagination and shared filter operators (`distance`, `verified`, `sort`) on every collection.
- Rate limits (Redis is required in env and unused by controllers).
- Zod schemas at the boundary. The server uses class-validator; a second schema library is not required for v1 wiring.

## IMPLEMENTED

### Health

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/health` | No | `{ status: "ok", service: "neighborly-api", timestamp }` |
| `GET` | `/ready` | No | `{ status: "ready", dependencies: { postgres: "up" } }` or 503 when Postgres fails. Redis is not checked. |

### Auth

`POST /auth/register`

```json
{
  "email": "user@example.com",
  "password": "at-least-12-chars",
  "firstName": "Gad",
  "lastName": "Miller",
  "neighborhood": "Inman Park",
  "city": "Atlanta",
  "state": "GA"
}
```

`neighborhood`, `city`, and `state` are optional. Email is stored lowercased. Duplicate email is 409 `"An account already exists for this email"`.

`POST /auth/login` body: `{ "email", "password" }`. Unknown user, non-`ACTIVE` status, or bad password is 401 `"Invalid email or password"`.

Both return:

```json
{
  "user": { "id": "uuid", "email": "user@example.com" },
  "accessToken": "jwt"
}
```

There is no `refreshToken` field.

### Users

Guarded.

- `GET /users/me` — user without `passwordHash`, plus `profile`, `preference`, `notificationPreference`.
- `PATCH /users/me/onboarding` — optional `neighborhood`, `city`, `state`, `interests[]`, `capabilities[]`, `newListings`, `priceDrops`, `messages`, `events`, `community`. Upserts preference (`completedAt` set) and notification preference. Returns the same shape as `GET /users/me`.

Not implemented: `PATCH /users/me/profile`, `GET /users/:id/profile`.

### Categories

`GET /categories` — public. `{ id, name, slug, listingCount }[]` ordered by name. `listingCount` is published, non-deleted listings in that category. Seeded in `backend/prisma/seed.ts`: Furniture, Electronics, Clothing & Accessories, Vehicles, Sports & Outdoors, Toys & Games, Books & Media, Home & Garden, Tools & Equipment, Musical Instruments, Art & Collectibles, Housing, Services, Jobs, Other.

The Create Listing `<select>` uses a shorter hardcoded name list and resolves `categoryId` by matching `name`.

### Listings

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/listings` | No | Published listings. Query: `query`, `categoryId` (UUID), `limit`, `offset`. Includes `images`, `category`, `seller.profile`. Newest first. |
| `GET` | `/listings/:id` | No | Non-deleted listing that is not `DRAFT`, with images (sort order), category, seller profile. Drafts are 404. 404 `"Listing not found"`. |
| `POST` | `/listings` | Yes | Creates `PUBLISHED`. Does not accept image keys. Does not write `PriceHistory`. |
| `POST` | `/listings/drafts` | Yes | Same body as create. Stores `DRAFT`. Omitted from `GET /listings` and `GET /listings/:id`. |
| `POST` | `/listings/:id/publish` | Yes | Owner only. `DRAFT` becomes `PUBLISHED`. Already published returns the row. Any other status is 409 `"Only a draft can be published"`. 403 if not owner. |
| `PATCH` | `/listings/:id` | Yes | Owner only. Optional title, description, price, condition, pickup, delivery, shipping. 403 if not owner. |
| `DELETE` | `/listings/:id` | Yes | Owner only. Sets `ARCHIVED` and `deletedAt`. |
| `POST` | `/listings/:id/favorite` | Yes | Toggle. `{ saved: true \| false }`. |
| `GET` | `/listings/favorites` | Yes | Favorites for the caller, newest first, listing included. |
| `POST` | `/listings/saved-searches` | Yes | `{ query, filters }`. Empty query is 409. |
| `GET` | `/listings/saved-searches` | Yes | Caller's rows, `updatedAt` desc. |

`POST /listings` body (unknown fields are rejected):

```json
{
  "categoryId": "uuid",
  "title": "3 to 140 characters",
  "description": "string",
  "priceCents": 48000,
  "condition": "Good",
  "neighborhood": "Inman Park",
  "city": "Atlanta",
  "latitude": 33.76,
  "longitude": -84.35,
  "radiusMiles": 10,
  "pickupAvailable": true,
  "deliveryAvailable": false,
  "shippingAvailable": false
}
```

`title` is `@MinLength(3)` and `@MaxLength(140)`. `description` is `@MinLength(10)`. The same body is used for `POST /listings/drafts`. No new Prisma migration: `ListingStatus.DRAFT` already exists in `0001_init`. The Create Listing page sends category, title, description, `priceCents` when the dollar field is filled, condition, pickup, and delivery. It does not send photos, tags, shipping, neighborhood, city, or coordinates. The AI Review step stays on screen and does not call a model.

Not implemented on this module: condition/price/distance/verified/free/delivery query params, image presign, price-drop feed, saved-search alerts.

### Requests and offers

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/requests` | No | `PUBLISHED` and `deletedAt: null`. Includes category, a public requester card, and `offers: { id, status }[]`. Newest first. Not limited to the caller. |
| `GET` | `/requests/offers` | Yes | Offers the caller can act on. Query `scope`: `received` (default; `request.requesterId` is the caller), `sent` (`offererId` is the caller), or `all` (either). The request must be published and not deleted. Each row includes the offer, a public offerer card, listing items (`id`, `title`, `priceCents`, `status`), and the parent request with a public requester card. |
| `GET` | `/requests/:id` | No | One published request. Same public requester card. Offers include `amountCents`, `message`, `status`, `items` (listing id, title, price, status), and the offerer's public card. 404 `"Request not found"`. |
| `POST` | `/requests` | Yes | Creates `PUBLISHED`. Ignores any attempt to save `DRAFT` because status is hardcoded. |
| `POST` | `/requests/:id/offers` | Yes | Offer on a published request. Offerer cannot be the requester (400). Optional `listingIds` must all be the offerer's published listings (403 otherwise). |
| `POST` | `/requests/offers/:id/counter` | Yes | Requester or offerer only, and only while status is `PENDING` or `COUNTERED`. Sets the offer to `COUNTERED` and inserts a counter row. The handler returns the Prisma transaction array `[offer, counterOffer]`. |
| `POST` | `/requests/:id/offers/:offerId/accept` | Yes | Requester only, and only while the offer is `PENDING` or `COUNTERED`. Sets `ACCEPTED`. Creates one conversation (requester and offerer), one transaction linked by `offerId` (`status: ACCEPTED`, roles `REQUESTER` and `OFFERER`), and the first milestone (`toStatus: ACCEPTED`). |
| `POST` | `/requests/:id/offers/:offerId/reject` | Yes | Requester only, same negotiable statuses. Sets `REJECTED`. Does not create a conversation or transaction. |

The public requester card is `id` plus profile `displayName`, `firstName`, `neighborhood`, and `city`. It does not include `passwordHash`, `email`, coordinates, account status, or verification flags. The same card is used for the offerer on `GET /requests/:id`.

`POST /requests` body:

```json
{
  "categoryId": "uuid",
  "title": "at least 3 characters",
  "description": "at least 10 characters",
  "budgetCents": 50000,
  "latitude": 33.7756,
  "longitude": -84.3963,
  "radiusMiles": 10,
  "deadline": "2026-10-01T00:00:00.000Z",
  "urgency": "this-week",
  "mode": "BUY"
}
```

`mode` is required: `BUY`, `BORROW`, `RENT`, `HIRE`, `TRADE`, `SKILL_SWAP`, `FREE`. `radiusMiles` defaults to 10 in the service and, when sent, must be 1–100. `budgetCents` is an optional integer ≥ 0.

`POST /requests/:id/offers` body: `message` (min length 2), optional `amountCents` ≥ 0, optional `listingIds` (UUID array).

`POST /requests/offers/:id/counter` body: `message` (min length 2), optional `amountCents` ≥ 0.

Not implemented: `GET /requests/:id/matches`, withdraw. `GET /requests/offers` is the caller-scoped list; it does not replace the public `GET /requests` feed. `RequestMatch` rows are never created. Matching is not semantic search and is not a hidden implemented feature.

### Conversations

All guarded. Caller must already be a `ConversationParticipant` or the service throws 403 `"You are not a participant in this conversation"`.

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/conversations` | Caller's conversations, `updatedAt` desc. Includes participants with profile and the latest message. |
| `GET` | `/conversations/:id/messages` | Messages ascending by `createdAt`. |
| `POST` | `/conversations/:id/messages` | Body `{ "body": "min length 1" }`. Persists the message, then `publishMessage` emits `message.created` on `/realtime` room `conversation:{id}`. A non-participant is 403 and nothing is published. |
| `PATCH` | `/conversations/:id/read` | Sets that participant's `lastReadAt`. |

`MessagingGateway` listens on namespace `/realtime`. `publishMessage` emits `message.created` to `conversation:{id}` after a participant sends a message. The gateway does not authenticate handshakes or join those rooms.

Not implemented: create conversation, typing, attachments, read receipts per message.

### Transactions

Guarded. Caller must be a `TransactionParticipant`.

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/transactions` | Includes participants, milestones (asc), appointments. Does not include reviews. |
| `PATCH` | `/transactions/:id/status` | Body `{ "status": "<TransactionStatus>" }`. Illegal edges are 400 `Invalid transaction transition: FROM -> TO`. A legal edge updates the row and inserts `TransactionMilestone`. |

Allowed edges (`backend/src/transactions/transaction-state.ts`):

| From | To |
| --- | --- |
| `DRAFT` | `PUBLISHED`, `CANCELLED` |
| `PUBLISHED` | `OFFER_RECEIVED`, `CANCELLED`, `EXPIRED` |
| `OFFER_RECEIVED` | `NEGOTIATING`, `ACCEPTED`, `CANCELLED`, `EXPIRED` |
| `NEGOTIATING` | `OFFER_RECEIVED`, `ACCEPTED`, `CANCELLED`, `EXPIRED` |
| `ACCEPTED` | `SCHEDULED`, `CANCELLED`, `DISPUTED` |
| `SCHEDULED` | `IN_PROGRESS`, `CANCELLED`, `DISPUTED` |
| `IN_PROGRESS` | `COMPLETED`, `DISPUTED` |
| `DISPUTED` | `REFUNDED`, `COMPLETED`, `CANCELLED` |
| `COMPLETED`, `CANCELLED`, `REFUNDED`, `EXPIRED` | none |

Accepting an offer inserts the first transaction at `ACCEPTED` with one milestone. Later changes go through this state machine.

### Reviews

Guarded. `POST /reviews`

```json
{
  "transactionId": "uuid",
  "subjectId": "uuid",
  "rating": 5,
  "body": "at least 1 character"
}
```

`rating` is an integer from 1 to 5. `body` is stored trimmed. The caller must be a `TransactionParticipant` (403 otherwise). Status must be `COMPLETED`, or the response is 400 `"Reviews are only allowed when the transaction is COMPLETED"`. Unknown transaction is 404 `"Transaction not found"`. There is no unique constraint on `(transactionId, authorId)` yet.

### Housing, jobs, services, and community

These four modules persist the screens in `src/pages/Housing.tsx`, `Jobs.tsx`, `Services.tsx`, and `Community.tsx`. Those pages call the routes through `src/api/client.ts`.

Public list and get responses use the same public card as listings (`id` plus profile `displayName`, `firstName`, `neighborhood`, `city`). They do not include `passwordHash`, `email`, `lastName`, profile coordinates, or the row's `latitude` / `longitude`. Coordinates are write-only: create and update accept them, and no read returns them.

Money is integer cents (`priceCents`, `startingPriceCents`). The Housing and Services screens show dollars; divide cents by 100 when wiring. Job `salary` stays the display string from the screen (`$110k–$145k`, `$16–$19/hr`) because it is a range, not one amount.

`verified` (housing and jobs) and `backgroundCheck`, `rating`, and `reviewCount` (services) are not client fields. Sending them is 400. Seed rows set the badges and ratings. A new row from the API has `verified: false`, `backgroundCheck: false`, `rating: null`, and `reviewCount: 0`.

Create always sets `PUBLISHED`. Owner `DELETE` sets `ARCHIVED` and `deletedAt`. A non-owner update or delete is 403. Missing or archived rows are 404.

Pagination matches listings: `limit` (1–100, default 24) and `offset` (default 0). Text `query` is a case-insensitive `contains`, not full-text and not geo. `distance` on the Housing cards is not stored.

| Screen field | API field |
| --- | --- |
| Housing `type` | `type` (`Apartment`, `House`, `Room`, `Studio`, `Condo`, `Sublet`) |
| Housing `listingType` | `listingType` (`rent`, `sale`) |
| Housing `price` dollars | `priceCents` |
| Housing `seller` | `owner` public card |
| Housing `images[]` unsplash id | `images[].objectKey` |
| Housing `postedAt` | `createdAt` |
| Jobs `type` | `type` (`Full-time`, `Part-time`, `Freelance`, `Internship`) |
| Jobs `remote` | `remote` (`Remote`, `Hybrid`, `On-site`) |
| Jobs `logo` | `logo` |
| Jobs `posted` | `createdAt` |
| Services `provider` / `providerName` | `businessName` and `owner.profile.displayName` |
| Services `startingPrice` dollars | `startingPriceCents` |
| Services `image` | `image` |
| Community post `author` | `author` public card |
| Community `reactions.like` / `love` | `reactions.like` / `reactions.love` (`wow` is the 😮 count) |
| Community `replies` | `replies` |
| Lost & found `type` | `type` (`lost`, `found`) |
| Event `image` / `attending` | `image` / `attending` |

#### Housing

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/housing` | No | Published rows, newest first unless `sort` is `price_asc`, `price_desc`, or `beds`. Query: `query`, `listingType`, `type`, `minBeds`, `maxPriceCents`, `pets`, `furnished`, `verified`, `utilitiesIncluded`, `sort`, `limit`, `offset`. |
| `GET` | `/housing/:id` | No | One published listing. 404 `"Housing listing not found"`. |
| `POST` | `/housing` | Yes | Creates `PUBLISHED`. Optional `imageKeys` (max 8). |
| `PATCH` | `/housing/:id` | Yes | Owner only. |
| `DELETE` | `/housing/:id` | Yes | Owner only. Returns `{ id, status: "ARCHIVED" }`. |

`POST /housing` body (unknown fields rejected):

```json
{
  "title": "Sunny 2BR in Inman Park",
  "description": "At least 10 characters",
  "type": "Apartment",
  "listingType": "rent",
  "priceCents": 185000,
  "priceUnit": "/mo",
  "beds": 2,
  "baths": 1,
  "sqft": 920,
  "neighborhood": "Inman Park",
  "city": "Atlanta",
  "available": "Oct 1, 2026",
  "lease": "12 months",
  "pets": true,
  "furnished": false,
  "utilities": "Water included",
  "imageKeys": ["photo-1560448204-e02f11c3d0e2"],
  "latitude": 33.761,
  "longitude": -84.363
}
```

`utilitiesIncluded=true` keeps rows whose `utilities` text is set and is not `N/A` or a `Resident…` string. Boolean query params are `true` or `false`.

#### Jobs

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/jobs` | No | Published jobs, newest first. Query: `query` (title, company, description), `type`, `level` (contains, so `Mid` matches `Mid-Senior`), `remote`, `limit`, `offset`. Does not include applications. |
| `GET` | `/jobs/:id` | No | One published job. 404 `"Job not found"`. |
| `POST` | `/jobs` | Yes | Creates `PUBLISHED`. |
| `PATCH` | `/jobs/:id` | Yes | Owner only. |
| `DELETE` | `/jobs/:id` | Yes | Owner only. `{ id, status: "ARCHIVED" }`. |
| `POST` | `/jobs/:id/apply` | Yes | Body `{ "message"?: string }`. One application per person. Repeating returns the existing row. The employer cannot apply (400 `"You cannot apply to your own job"`). The applicant card is the public card. |
| `GET` | `/jobs/applications` | Yes | Caller's applications, with the public job. |
| `GET` | `/jobs/:id/applications` | Yes | Owner only. Applicant public cards and messages. No email. |
| `POST` | `/jobs/:id/save` | Yes | Toggle. `{ saved: true \| false }`. |
| `GET` | `/jobs/saved` | Yes | Caller's saved jobs, newest save first. |

`POST /jobs` requires `title`, `company`, `description` (min 10), `type`, `level`, `salary`, `location`, and `remote`. Optional `responsibilities[]`, `tags[]`, `deadline`, `logoKey`, `latitude`, `longitude`.

#### Services

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/services` | No | Published services, newest first. Query: `query`, `category`, `limit`, `offset`. No quotes. |
| `GET` | `/services/:id` | No | One published service. 404 `"Service not found"`. |
| `POST` | `/services` | Yes | Creates `PUBLISHED`. |
| `PATCH` | `/services/:id` | Yes | Owner only. |
| `DELETE` | `/services/:id` | Yes | Owner only. `{ id, status: "ARCHIVED" }`. |
| `POST` | `/services/:id/quotes` | Yes | Quote request. The provider cannot quote their own service (400). The response includes the address the caller just sent. |
| `GET` | `/services/quotes/mine` | Yes | Caller's quotes, including their own address and the public service. |
| `GET` | `/services/:id/quotes` | Yes | Provider only (403 otherwise). Requester public card. `address` is omitted while `status` is `PENDING`. |
| `POST` | `/services/quotes/:id/accept` | Yes | Provider only. Sets `ACCEPTED`. The response then includes `address`. |

`category` is one of `Cleaning`, `Moving`, `Tutoring`, `Repair`, `Photography`, `Lawn Care`, `Tech Help`, `Fitness`, `Design`, `Cooking`.

`POST /services/:id/quotes` body: `notes` (min 2), optional `preferredDate`, `preferredTime`, and `address`. Address is the street line the Services modal says stays private until the provider accepts.

#### Community

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/community/posts` | No | Published posts, newest first. Query: `type`, `limit`, `offset`. `type` is `discussion`, `announcement`, `lost_found`, `recommendation`, `event`, or `giveaway`. |
| `GET` | `/community/posts/:id` | No | One post with reaction counts and `replies`. |
| `POST` | `/community/posts` | Yes | Body: `type`, `title`, `body` (min 10), `neighborhood`, optional `city`. |
| `PATCH` | `/community/posts/:id` | Yes | Author only. |
| `DELETE` | `/community/posts/:id` | Yes | Author only. Archives. |
| `POST` | `/community/posts/:id/reactions` | Yes | Body `{ "emoji": "👍" \| "❤️" \| "😮" }`. One reaction per person. The same emoji again removes it. Returns the post. |
| `GET` | `/community/posts/:id/comments` | No | Comments oldest first. Author public card. |
| `POST` | `/community/posts/:id/comments` | Yes | Body `{ "body": "min length 1" }`. |
| `GET` | `/community/events` | No | Published events, oldest `createdAt` first (seed order matches the Events tab). `attending` is the RSVP count. |
| `GET` | `/community/events/:id` | No | One event. |
| `POST` | `/community/events` | Yes | `title`, `neighborhood`, `dateLabel`, `timeLabel`. Optional `description`, `city`, `imageKey`. |
| `PATCH` | `/community/events/:id` | Yes | Organizer only. |
| `DELETE` | `/community/events/:id` | Yes | Organizer only. |
| `POST` | `/community/events/:id/rsvp` | Yes | Toggle. `{ attending, attendingCount }`. |
| `GET` | `/community/lost-found` | No | Newest first. |
| `GET` | `/community/lost-found/:id` | No | One item. `type` is `lost` or `found`. |
| `POST` | `/community/lost-found` | Yes | `type`, `item`, `neighborhood`. Optional `city`, `imageKey`. |
| `PATCH` | `/community/lost-found/:id` | Yes | Author only. |
| `DELETE` | `/community/lost-found/:id` | Yes | Author only. |
| `GET` | `/community/giveaways` | No | Newest first. `claimed` is boolean. The claimer is not included. |
| `GET` | `/community/giveaways/:id` | No | One giveaway. |
| `POST` | `/community/giveaways` | Yes | `item`, `neighborhood`, optional `city`. |
| `PATCH` | `/community/giveaways/:id` | Yes | Author only. |
| `DELETE` | `/community/giveaways/:id` | Yes | Author only. |
| `POST` | `/community/giveaways/:id/claim` | Yes | First caller sets `claimed`. `{ claimed: true, giveaway }`. A second person is 409 `"This giveaway has already been claimed"`. The same person claiming again is `{ claimed: true, giveaway }`. |

## TARGET

These routes are the remainder of the v1 contract. They are not implemented. Paths below supersede older aliases in the previous revision of this file (`POST /listings/:id/save`, `PATCH /offers/:id`, `POST /conversations/:id/read`).

### Identity

- `POST /auth/refresh` — rotate access tokens. Env already has `JWT_REFRESH_SECRET` and `JWT_REFRESH_TTL`.
- `PATCH /users/me/profile` — bio, display name, phone. Distinct from onboarding.
- `GET /users/:id/profile` — public profile. Trust badges are target; do not compute them with a model.

### Listings and media

- Presigned image upload and `ListingImage` rows on create.
- Query params the Explore screen already paints: condition, min/max price, distance, verified, free, delivery, neighborhood, sort. Distance needs a real geo filter (target). It is not a vector search.
- Price history writes on `PATCH` when `priceCents` changes, then a read for the Saved Items price-alert tab.
- Saved-search alert delivery. The tab already says new-match alerts are unavailable.

### Requests

- `GET /requests?mine=1` or equivalent — caller's requests only. The current list is public and global.
- `POST /requests` draft mode and `PATCH /requests/:id` to cancel (`CANCELLED`) without deleting the row.
- Deterministic match rows in `RequestMatch` from category, mode, and radius. Score is a plain decimal the server writes. Not an embedding.

### Messaging

- `POST /conversations` — participants, optional request or listing reference. Required before Messages can leave fixtures.
- Join `conversation:{id}` with the same JWT before a client can receive `message.created`. Send already persists, then emits.
- Typing and attachments stay target. The composer camera button stays visual until attachments exist.

### Transactions, reviews, safety

- `POST /transactions/:id/appointments` — `startsAt`, `locationNote`. The Dashboard meetup cards bind here later.
- One review per author per transaction (constraint still target). `POST /reviews` itself is implemented.
- `GET /users/:id/reviews` — feeds the Profile reviews tab, which is fixture text today.
- Reports, blocks, moderation actions, notification list, and mark-read. Buttons exist on Listing Detail and Profile and only flip local React state.

### Explicitly out of v1

- Semantic / vector / LLM ranking of listings or requests.
- AI listing titles, AI photo review, AI price opinions. The wizard step stays on screen and performs no request.
- Payment provider calls. `STRIPE_*` may be empty. Dashboard "Earned" is fixture copy.

## Workflow the implemented routes can already finish

1. Register and onboarding write a user.
2. `POST /listings` or `POST /requests` publishes immediately.
3. Another user `POST /requests/:id/offers`.
4. Either party `POST /requests/offers/:id/counter` while the offer is `PENDING` or `COUNTERED`.
5. The requester `POST /requests/:id/offers/:offerId/accept` (or `reject`). Accept opens one conversation and one `ACCEPTED` transaction.
6. A participant `PATCH /transactions/:id/status` along the legal edges until `COMPLETED`.
7. A participant `POST /reviews` for that completed transaction.

Scheduling an appointment is still target. The screens for this sequence already exist (`docs/UX_REQUEST_FLOW_STATES.md`).
