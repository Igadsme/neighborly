# Integration Log

June foundation snapshot of what the repo connected at `d0dab1c` (docs pass 2026-09-23). This is not a claim that each line shipped on that calendar day, and it is not the current wiring map.

**Superseded on `main` at `1f38563`.** Housing, jobs, services, community, Home, Dashboard, and Messages call `/api/v1`. Accept, reject, counter, `POST /reviews`, and authenticated `message.created` exist. The "no page calls those methods" line and the fixture-only bullets below describe `d0dab1c` only. Current contracts are `docs/PROJECT_STATUS.md`, `docs/FRONTEND_BACKEND_MAP.md`, and `docs/RELEASE_CHECKLIST.md`. The app is not release-complete.

## Frontend → API

| Surface | Call | Result in the UI |
| --- | --- | --- |
| `src/App.tsx` | `api.auth.hasSession`, `api.auth.me`, `api.auth.signOut` | Boot shows "Loading Neighborly..." while a stored token is checked. Failed `GET /users/me` clears the token. Sign-out clears the token and returns to `landing`. Sign-in from the landing preview bar sets React state only; it does not create a session. |
| `src/pages/Landing.tsx` | `api.auth.login` | Email/password dialog. Errors use `ApiError.message`. Social providers stay labeled unavailable. |
| `src/pages/Onboarding.tsx` | `api.auth.register`, `api.auth.completeOnboarding` | Email path creates the user, then stores neighborhood, interests, capabilities, and notification flags. API errors render in the wizard. |
| `src/pages/CreateListing.tsx` | `api.categories.list`, `api.listings.create` | Category id is matched by **name** to the hardcoded `<select>` options. Publish sends title, description, `priceCents`, condition, pickup, delivery. Photos, tags, shipping, and the AI step are not in the payload. Failures use the step-5 alert. Success sets `published` and shows the existing celebration panel. "Save draft" and "Cancel" only navigate home. |
| `src/pages/SavedItems.tsx` | `api.listings.favorites`, `api.listings.savedSearches`, `api.listings.toggleFavorite` | Loading, error, and empty states are real. Unsave removes the card after a successful toggle. Saved-search rows show query, neighborhood filter if present, and updated date. The Price Alerts tab invents a $100 drop whenever any favorite exists (`priceDropListings = savedListings`). New-match alerts are a static unavailable note. |
| `src/components/ui.tsx` `ListingCard` | `api.listings.toggleFavorite` when `onSavedChange` is absent | Optimistic heart, revert on failure, error stashed on the button `title`. Fixture cards (`l1`, …) hit this path from Home, Explore, Categories, and Profile. |

`src/api/client.ts` also wraps requests, offers, counters, transactions, and conversations. No page calls those methods.

## API → database

Global prefix `/api/v1`. Validation pipe whitelists and rejects unknown fields. Swagger is mounted at `/docs`.

| Module | Routes | Persistence notes |
| --- | --- | --- |
| Health | `GET /health`, `GET /ready` | Ready pings Postgres only. Redis is required in env validation and is not part of the ready check. |
| Auth | `POST /auth/register`, `POST /auth/login` | User + profile on register. Access JWT only. Duplicate email → 409. Bad login → 401. Password minimum length 12 on register. |
| Users | `GET /users/me`, `PATCH /users/me/onboarding` | `me` strips `passwordHash` and includes profile, preference, notification preference. |
| Categories | `GET /categories` | Ordered by name. Seeded names include the Create Listing select list plus Housing, Services, Jobs. |
| Listings | `GET /listings`, `GET /listings/:id`, `POST /listings`, `PATCH /listings/:id`, `DELETE /listings/:id`, `POST /listings/:id/favorite`, `GET /listings/favorites`, `POST /listings/saved-searches`, `GET /listings/saved-searches` | List filters: `query` (title/description contains), `categoryId`, `limit` (default 24, max 100), `offset`. Create and the public list are `PUBLISHED` only. Get returns any non-deleted status. Update/archive require `sellerId`. Archive sets `ARCHIVED` and `deletedAt`. Favorite is a toggle. Saved search requires a non-empty query; `filters` is JSON. Images are not written by create. `PriceHistory` is never written. |
| Requests | `GET /requests`, `POST /requests`, `POST /requests/:id/offers`, `POST /requests/offers/:id/counter` | List is public, `PUBLISHED`, includes category, requester profile, and offers reduced to `{ id, status }`. Create requires auth and forces `PUBLISHED`. Offer create rejects the requester and checks listing ownership. Counter is requester or offerer, status `PENDING` or `COUNTERED`. No get-by-id, no accept, no reject. `RequestMatch` is never written. |
| Messaging | `GET /conversations`, `GET /conversations/:id/messages`, `POST /conversations/:id/messages`, `PATCH /conversations/:id/read` | All guarded. Non-participants get 403. Send writes `Message` and bumps `Conversation.updatedAt`. It does not call `MessagingGateway.publishMessage`. The gateway has no connection auth and no join handler. No route creates a conversation. |
| Transactions | `GET /transactions`, `PATCH /transactions/:id/status` | List is participant-scoped and includes participants, milestones, appointments. Transition checks `assertTransactionTransition` and appends `TransactionMilestone`. No route inserts `Transaction` or `Appointment`. |

## Not integrated

Confirmed at `d0dab1c` only. Do not use this list as the current gap list. Current gaps are the unchecked lines in `docs/RELEASE_CHECKLIST.md` sections B, C, and E.

- Home, Explore, Categories, Map, Listing Detail, Messages, Profile, Dashboard, Housing, Services, Jobs, Community: fixture data only.
- Listing detail id, offer send, message send, report, and save on that page: local React state.
- Messages accept/decline: local `offerStatus`. Counter button has no handler.
- Dashboard stats, offers, meetups, reviews, activity: constants in `Dashboard.tsx` plus `listings` fixtures.
- Explore filters, map radius, job apply/save, community RSVP, profile follow/report: local state.
- Refresh tokens, payments, uploads, notifications, reports, moderation, reviews, matching.

## Environment the API expects

`backend/src/common/config/env.validation.ts` requires `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (≥ 32), `JWT_REFRESH_SECRET` (≥ 32), `CORS_ORIGIN`, and S3 settings. Stripe, Mapbox, and Sentry may be empty. `docker-compose.yml` starts Postgres (PostGIS image) and Redis only. MinIO, the Nest app container, and a Vite service are not in that compose file.

The typed client defaults to `http://localhost:3000/api/v1` unless `VITE_API_URL` is set.
