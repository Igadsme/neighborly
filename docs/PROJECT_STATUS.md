# Project Status

Neighborly status board. Housing, jobs, services, and community pages call the `/api/v1` routes added in `cfd0db3`. `1f38563` points those pages, plus Home and Dashboard, at the APIs with loading, empty, error, and 401 states. Dashboard and Home no longer render fixture arrays for listings, offers, messages, transactions, reviews, or those verticals. The app is not release-complete. `docs/RELEASE_CHECKLIST.md` Section B records the offer, message, and review wiring that is in this tree. Section E (local `.env`, Compose, migrate, seed, Node 22 on the Mac, signed-in e2e) stays unchecked: Docker Desktop is not installed on the Mac, and that e2e was not run.

The June Sprint 1 notes below are the handoff from `d0dab1c`. Where they disagree with the "What is running today" list, the running list is the current contract.

## Source of truth

- **Visual source of truth:** the Figma-generated React screens under `src/pages` and `src/components`. Layout, color, type, and component structure stay as generated.
- **App shell:** Vite + React 19 + Tailwind CSS v4. Page changes are client state in `src/App.tsx` (`page` ids), not a URL router. That shell stays.
- **Backend:** NestJS modular monolith under `backend/`, Prisma/PostgreSQL, global prefix `/api/v1`, Swagger at `/docs`.
- **June Sprint 1 write scope was** `docs/` only. Sprint 2 added `backend/` persistence for housing, jobs, services, and community. The wiring pass points the existing Figma pages at those routes. It does not add page ids or a new visual design.

v1 product docs do not add OpenAI, embeddings, or semantic search. Copy already painted into the Figma screens (the Create Listing "AI Review" step, the landing "Scam Detection" line) stays on screen and is not a v1 capability.

## Sprint 1 outcome

June's Sprint 1 deliverable is the orchestration and UX-state docs Nova needs to wire the request-first flow onto screens that already exist.

| Doc | Role |
| --- | --- |
| `docs/PROJECT_STATUS.md` | This board |
| `docs/DECISIONS.md` | Locked choices for Nova |
| `docs/INTEGRATION_LOG.md` | What is actually wired today |
| `docs/RELEASE_CHECKLIST.md` | What must be true before a request-flow release |
| `docs/API_SPEC.md` | Implemented routes vs target contract |
| `docs/DATABASE_DESIGN.md` | Prisma models that exist vs target entities |
| `docs/FRONTEND_BACKEND_MAP.md` | Every page id, fixture vs API |
| `docs/UX_REQUEST_FLOW_STATES.md` | Request composer, offer compare, and review prompt states |

## What is running today

Implemented and reachable in code:

- Auth: `POST /api/v1/auth/register`, `POST /api/v1/auth/login` (Argon2, JWT access token only).
- Session read: `GET /api/v1/users/me`. Onboarding write: `PATCH /api/v1/users/me/onboarding`.
- Categories: `GET /api/v1/categories` (seed list in `backend/prisma/seed.ts`), plus `listingCount` for published listings.
- Listings: list, get (drafts hidden), create (`PUBLISHED`), `POST /listings/drafts`, `POST /listings/:id/publish`, owner update, owner archive, favorite toggle, favorites list, saved searches. `ListingStatus.DRAFT` was already in `0001_init`; this pass did not add a migration.
- Requests: public list and get, authenticated create (always `PUBLISHED`), `GET /requests/offers` (`scope` `received` by default, plus `sent` and `all`), create offer, counter, accept, and reject. Accept creates one conversation and one `ACCEPTED` transaction.
- Messaging: list conversations, list/send messages, mark read, for existing participants. Socket.IO namespace `/realtime` requires a JWT and emits `message.created` after a participant sends.
- Transactions: list for a participant, status transition through `backend/src/transactions/transaction-state.ts`.
- Reviews: `POST /reviews` for a participant when the transaction is `COMPLETED`. `GET /users/:id/reviews` lists reviews about that user. `GET /users/:id/profile` is the public profile card.
- Housing, jobs, services, community: list/get are public; create, update, and archive require the owner. Jobs apply and save, service quotes (street address hidden until the provider accepts), community reactions, comments, RSVPs, and giveaway claims are implemented. See `docs/API_SPEC.md`. The Housing, Jobs, Services, and Community pages call the public lists and the mutations that already have a control (apply, save, quote, post, reaction, RSVP, claim).
- Health: `GET /api/v1/health`, `GET /api/v1/ready` (Postgres `SELECT 1` only).
- Local infra: `docker-compose.yml` runs PostGIS 16 and Redis 7. The schema stores latitude/longitude as decimals. There is no geometry column. `pnpm prisma:seed` loads categories plus fixture-shaped rows for the four verticals. Booting that stack from a local `.env` on a Mac is still a separate step.

Frontend pages that call the API include `App` (session), `Landing` (login), `Onboarding`, `CreateListing` (`POST /listings` and draft save), `Categories` (`GET /categories`), `SavedItems`, `ListingCard`, Dashboard (`GET /requests/offers?scope=all`), Messages, Home (listings plus services, events, and posts), Housing, Jobs, Services, Community, Map (`GET /listings`), and Profile (`GET /users/me`, `GET /users/:id/profile`, `GET /users/:id/reviews`, seller listings). Explore still loads listings and then applies extra filters in the browser. Categories still uses fixture cards for the featured strip and the tiles that have no matching category name. Listing Detail still uses `src/data/index.ts` when the id is not a UUID. Map pins are neighborhood centroids on the painted map; listing and profile coordinates are not returned. Do not treat this as a finished product.

## Request-first flow status

The product flow is: post a need, receive offers, compare and counter, message, complete, review.

| Step | UI that already exists | API that already exists | Gap Nova must not invent a screen for |
| --- | --- | --- | --- |
| Compose and publish a listing | `create` → `src/pages/CreateListing.tsx` wizard | `POST /api/v1/listings` and `POST /api/v1/listings/drafts` | The wizard does not post a need. AI Review is still copy only. |
| See offers | `dashboard` Offers tab and Overview pending cards; `messages` offer card | Dashboard: `GET /api/v1/requests/offers?scope=all`. Messages still uses `GET /api/v1/requests` and `GET /api/v1/requests/:id`. | Public request list is still every published request. |
| Accept / decline | Dashboard and Messages buttons | `POST /api/v1/requests/:id/offers/:offerId/accept` and `.../reject`. Counter: `POST /api/v1/requests/offers/:id/counter`. | Accept opens one conversation and one `ACCEPTED` transaction. |
| Thread | `messages` | Conversation read/send for an existing participant. Accept creates the thread. `/realtime` requires a JWT. | There is still no standalone create-conversation route. |
| Complete exchange | Messages progress strip; Dashboard meetups | `GET` + `PATCH /api/v1/transactions/:id/status` | No appointment route. Accept inserts the transaction. |
| Review | Dashboard "Reviews to complete" cards; Profile reviews tab | `POST /api/v1/reviews`, `GET /api/v1/users/:id/reviews` | Profile reviews load from the API. Dashboard still does not hide a prompt when a review already exists. Follow and report on Profile stay local. |

State-by-state wiring instructions are in `docs/UX_REQUEST_FLOW_STATES.md`.

## Page inventory


`src/App.tsx` page ids, in order: `landing`, `onboarding`, `home`, `explore`, `categories`, `map`, `listing`, `create`, `messages`, `saved`, `profile`, `dashboard`, `housing`, `services`, `jobs`, `community`.

Signed-out visitors can open `landing` and `onboarding`. Any other id shows the existing "Sign in to continue" gate. `Navigation` is hidden on `landing` and `onboarding`. `unreadMessages={2}` is hardcoded. Landing header Browse, Services, Housing, Jobs, and "Post a Listing" open the sign-in dialog. They do not jump into signed-in pages. Get started still opens onboarding. Login still calls `POST /auth/login`.

`listing` loads `GET /listings/:id` when the selected id is a UUID. Non-UUID navigation still falls back to fixture listings. There is no selected-id route in the URL bar; `App` holds `listingId` in state.

## Nova handoff

1. Read `docs/DECISIONS.md` before changing behavior.
2. Wire only the states in `docs/UX_REQUEST_FLOW_STATES.md`. Do not add page ids, routes, or layouts.
3. Treat `docs/API_SPEC.md` and `docs/DATABASE_DESIGN.md` **IMPLEMENTED** sections as the contract that exists. **TARGET** sections are not permission to pretend the UI is persisted.
4. Where a control has no endpoint (Pause, Promote, Mark sold, Save draft, conversation create from a listing, profile follow), keep the control and surface the existing error treatment when a call is attempted. Do not flip local fixture state and call it success.
5. Leave Figma sample copy and the AI Review step on the Create Listing wizard. Do not call a model.

## Explicitly not in this status

- No `src/` or `backend/` diff in the June Sprint 1 docs PR.
- No AI feature work.
- Landing marketing cards and the categories featured strip remain fixture screens. Map and Profile read the API. Map still paints the Atlanta map, the mile line, and safe spots; it does not call Mapbox. The categories grid reads `GET /categories` for counts on Housing, Jobs, Services, and Vehicles. Housing, services, jobs, and community pages read the APIs from `0003_verticals`. They are mapped in `docs/FRONTEND_BACKEND_MAP.md`.
- This board is not a release-complete claim. Docker Compose, migrate, seed, and signed-in browser e2e were not run for this pass. Docker Desktop is still missing on this Mac, so those steps stay blocked.
- Local `.env`, `docker compose`, and a full browser pass against Postgres on a Mac are not part of this wiring. CI runs frontend `tsc`, Vitest, and `vite build`, plus the existing backend Jest suite.

## Workspace (T7 Shield)

- **Canonical local path:** `/Volumes/T7 Shield/Projects/neighborly`
- **Backup only (do not modify):** `~/Desktop/Neighborly/app`
- **Paused:** 2026-09-23 00:00 EDT for SSD transfer; see `docs/PAUSE_CHECKPOINT.md`.
- **Resumed:** 2026-09-23 — feature work continues from this path only. Node 22 via `.mise.toml` (Vite/Rolldown). Do not weaken for Node 20.
- **GitHub remote:** `https://github.com/Igadsme/neighborly.git`
- **Secrets:** recreate local `.env` from `env.example` on T7; never commit real secrets. Required to boot API: `DATABASE_URL`, `JWT_SECRET` (≥32 chars), `CORS_ORIGIN`. Frontend: `VITE_API_URL`.

## Resume verification (2026-09-23)

- Path on T7 Shield confirmed; Desktop copy left untouched.
- Branch `main` after June docs merge; frontend `tsc` + `vite build` pass under Node 22; backend prisma generate, `tsc`, tests, nest build pass.
- `prisma validate` needs `DATABASE_URL` (expected without local `.env`).
- Offer accept/reject → conversation + transaction is in the API and on Dashboard/Messages. Vertical screens are wired to the same client. Release is not complete. Mac `.env`, Compose, migrate, seed, and signed-in e2e are still open (`docs/RELEASE_CHECKLIST.md` Section E).

