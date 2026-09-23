# API Specification

Base URL: `/api/v1`. Swagger UI: `/docs` (outside the global prefix).

This document replaces the mixed "initial production contract" that listed planned routes as if they were live. **IMPLEMENTED** means a controller method exists under `backend/src` at foundation commit `d0dab1c`. **TARGET** means v1 follow-on work that is not in the tree. The typed client in `src/api/client.ts` mirrors the implemented surface; pages do not call all of it (`docs/FRONTEND_BACKEND_MAP.md`).

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

`GET /categories` — public. `{ id, name, slug }[]` ordered by name. Seeded in `backend/prisma/seed.ts`: Furniture, Electronics, Clothing & Accessories, Vehicles, Sports & Outdoors, Toys & Games, Books & Media, Home & Garden, Tools & Equipment, Musical Instruments, Art & Collectibles, Housing, Services, Jobs, Other.

The Create Listing `<select>` uses a shorter hardcoded name list and resolves `categoryId` by matching `name`.

### Listings

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/listings` | No | Published listings. Query: `query`, `categoryId` (UUID), `limit`, `offset`. Includes `images`, `category`, `seller.profile`. Newest first. |
| `GET` | `/listings/:id` | No | Any non-deleted listing with images (sort order), category, seller profile. 404 `"Listing not found"`. |
| `POST` | `/listings` | Yes | Creates `PUBLISHED`. Does not accept image keys. Does not write `PriceHistory`. |
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

`title` is `@MinLength(3)` and `@MaxLength(140)`. `description` is annotated `@Min(10)` (numeric `Min`, not `MinLength`). Do not assume a 10-character description rule until that decorator is corrected. The Create Listing page does not send neighborhood, city, coordinates, radius, or shipping.

Not implemented on this module: condition/price/distance/verified/free/delivery query params, image presign, price-drop feed, saved-search alerts.

### Requests and offers

| Method | Path | Auth | Behavior |
| --- | --- | --- | --- |
| `GET` | `/requests` | No | `PUBLISHED` and `deletedAt: null`. Includes category, requester profile, and `offers: { id, status }[]`. Newest first. Not limited to the caller. |
| `POST` | `/requests` | Yes | Creates `PUBLISHED`. Ignores any attempt to save `DRAFT` because status is hardcoded. |
| `POST` | `/requests/:id/offers` | Yes | Offer on a published request. Offerer cannot be the requester (400). Optional `listingIds` must all be the offerer's published listings (403 otherwise). |
| `POST` | `/requests/offers/:id/counter` | Yes | Requester or offerer only, and only while status is `PENDING` or `COUNTERED`. Sets the offer to `COUNTERED` and inserts a counter row. The handler returns the Prisma transaction array `[offer, counterOffer]`. |

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

Not implemented: `GET /requests/:id`, `GET /requests/:id/matches`, accept, reject, withdraw, list offers for the current user. `RequestMatch` rows are never created. Matching is not semantic search and is not a hidden implemented feature.

### Conversations

All guarded. Caller must already be a `ConversationParticipant` or the service throws 403 `"You are not a participant in this conversation"`.

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/conversations` | Caller's conversations, `updatedAt` desc. Includes participants with profile and the latest message. |
| `GET` | `/conversations/:id/messages` | Messages ascending by `createdAt`. |
| `POST` | `/conversations/:id/messages` | Body `{ "body": "min length 1" }`. Persists the message. Does not emit on the socket. |
| `PATCH` | `/conversations/:id/read` | Sets that participant's `lastReadAt`. |

`MessagingGateway` listens on namespace `/realtime` and has `publishMessage`. Nothing calls it, and the gateway does not authenticate or join `conversation:{id}` rooms.

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

No route creates a transaction, so this state machine is unreachable from the UI until a row exists.

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

- `GET /requests/:id` — request plus offers with `amountCents`, `message`, `status`, offerer profile, and `items`.
- `GET /requests?mine=1` or equivalent — caller's requests only. The current list is public and global.
- `POST /requests` draft mode and `PATCH /requests/:id` to cancel (`CANCELLED`) without deleting the row.
- `POST /requests/:id/offers/:offerId/accept` and `.../reject` — set `ACCEPTED` or `REJECTED`. Accept is what may create the transaction (target).
- Deterministic match rows in `RequestMatch` from category, mode, and radius. Score is a plain decimal the server writes. Not an embedding.

### Messaging

- `POST /conversations` — participants, optional request or listing reference. Required before Messages can leave fixtures.
- Persist then emit `message.created` on `/realtime` after the socket joins `conversation:{id}` with the same JWT.
- Typing and attachments stay target. The composer camera button stays visual until attachments exist.

### Transactions, reviews, safety

- Create transaction when an offer is accepted, with requester and offerer participants.
- `POST /transactions/:id/appointments` — `startsAt`, `locationNote`. The Dashboard meetup cards bind here later.
- `POST /reviews` — `{ transactionId, subjectId, rating, body }` for a `COMPLETED` transaction the author belongs to. One review per author per transaction (constraint still target).
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
4. Either party `POST /requests/offers/:id/counter`.

They cannot yet open a thread, accept, schedule, complete, or review. That sequence is target, and the screens for it already exist (`docs/UX_REQUEST_FLOW_STATES.md`).
