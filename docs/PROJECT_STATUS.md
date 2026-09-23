# Project status

Sprint 1 P0 snapshot: auth identity mapping, a boot path that does not require unused services, and the minimum repo wiring (env template, README, CI, Postgres healthcheck).

## What runs

### Frontend (Vite + React)

The app stays a Vite SPA. These flows call the API through `src/api/client.ts`:

- Session restore on load (`GET /users/me`) and sign-out in `src/App.tsx`
- Email and password login on the landing page
- Registration and onboarding (neighborhood, interests, notification preferences)
- Create listing: category list plus `POST /listings` (images stay local)
- Saved items: favorites and saved searches, including unfavorite

### Backend (NestJS)

Protected handlers read `request.user.id`. Access tokens are signed as `{ sub, email }`. `AuthGuard` is a provider on `AuthModule`, so Nest injects `JwtService`, verifies the bearer token with `JWT_SECRET`, and sets `request.user` to `{ id: payload.sub, email }`.

Endpoints that exist today:

- `GET /api/v1/health`, `GET /api/v1/ready` (Postgres ping)
- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`
- `GET /api/v1/users/me`, `PATCH /api/v1/users/me/onboarding`
- `GET /api/v1/categories`
- Listings: list, get, create, update, archive, favorites, saved searches
- Requests: list, create, create offer, counter offer
- Transactions: list for the caller, status transition (state machine covered by a unit test)
- Conversations: list, messages, send, mark read
- Swagger at `/docs`

Boot validation requires `DATABASE_URL`, `JWT_SECRET`, and `CORS_ORIGIN`. `REDIS_URL`, `JWT_REFRESH_SECRET`, and every `S3_*` variable are optional. Nothing in `backend/src` opens Redis, S3, Stripe, or Mapbox. Refresh tokens are not issued.

Prisma schema and migrations live under `backend/prisma` (`0001_init`, `0002_onboarding`). `pnpm prisma:seed` upserts categories only.

`docker-compose.yml` runs PostGIS 16 and Redis 7. Postgres has a `pg_isready` healthcheck. There is no API container.

GitHub Actions (`.github/workflows/ci.yml`) typechecks and builds the frontend, and generates the Prisma client, typechecks, tests, and builds the backend.

## What is still fixtures or unfinished

These screens still render `src/data` and are not backed by live queries: home, explore, categories, map, listing detail, messages, profile, dashboard, housing, services, jobs, and community. Landing still uses fixture cards around the real login form.

Not in this sprint, and not implemented as product flows:

- Offer accept/reject, scheduling, completion, and reviews
- Housing, jobs, and community APIs
- Media upload (no S3 client)
- Redis-backed cache, rate limits, or queues
- AI providers
- Next.js

`src/api/client.ts` already types some of those calls so later slices can connect the existing screens without redesigning them.
