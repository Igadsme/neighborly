# Project Status

Neighborly status board. Sprint 2 vertical persistence was added on `main` after `fec3b1e`. Housing, jobs, services, and community now have PostgreSQL tables and Nest routes. The four Figma pages still render `src/data/index.ts`. Wiring them is a separate PR.

The June Sprint 1 notes below are the handoff from `d0dab1c`. Where they disagree with the "What is running today" list, the running list is the current contract.

## Source of truth

- **Visual source of truth:** the Figma-generated React screens under `src/pages` and `src/components`. Layout, color, type, and component structure stay as generated.
- **App shell:** Vite + React 19 + Tailwind CSS v4. Page changes are client state in `src/App.tsx` (`page` ids), not a URL router. That shell stays.
- **Backend:** NestJS modular monolith under `backend/`, Prisma/PostgreSQL, global prefix `/api/v1`, Swagger at `/docs`.
- **June Sprint 1 write scope was** `docs/` only. Sprint 2 adds `backend/` persistence for housing, jobs, services, and community, plus the docs that describe those routes. It does not rewrite the Figma pages.

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
- Categories: `GET /api/v1/categories` (seed list in `backend/prisma/seed.ts`).
- Listings: list, get, create (always `PUBLISHED`), owner update, owner archive, favorite toggle, favorites list, saved searches.
- Requests: public list and get, authenticated create (always `PUBLISHED`), create offer, counter, accept, and reject. Accept creates one conversation and one `ACCEPTED` transaction.
- Messaging: list conversations, list/send messages, mark read, for existing participants. Socket.IO namespace `/realtime` requires a JWT and emits `message.created` after a participant sends.
- Transactions: list for a participant, status transition through `backend/src/transactions/transaction-state.ts`.
- Reviews: `POST /reviews` for a participant when the transaction is `COMPLETED`.
- Housing, jobs, services, community: list/get are public; create, update, and archive require the owner. Jobs apply and save, service quotes (street address hidden until the provider accepts), community reactions, comments, RSVPs, and giveaway claims are implemented. See `docs/API_SPEC.md`.
- Health: `GET /api/v1/health`, `GET /api/v1/ready` (Postgres `SELECT 1` only).
- Local infra: `docker-compose.yml` runs PostGIS 16 and Redis 7. The schema stores latitude/longitude as decimals. There is no geometry column. `pnpm prisma:seed` loads categories plus fixture-shaped rows for the four verticals.

Frontend pages that call the API include `App` (session), `Landing` (login), `Onboarding`, `CreateListing`, `SavedItems`, `ListingCard`, and the request/message/review paths on Dashboard and Messages. **Housing, Jobs, Services, and Community still render `src/data/index.ts`.** Home, Explore, and other marketplace screens may still mix fixtures with live listing calls. Do not treat the new vertical APIs as wired UI.

## Request-first flow status

The product flow is: post a need, receive offers, compare and counter, message, complete, review.

| Step | UI that already exists | API that already exists | Gap Nova must not invent a screen for |
| --- | --- | --- | --- |
| Compose and publish a request | `create` → `src/pages/CreateListing.tsx` wizard | `POST /api/v1/requests` (the page calls `api.requests.create`) | No draft route. |
| See offers | `dashboard` Offers tab and Overview pending cards; `messages` offer card | `GET /api/v1/requests` and `GET /api/v1/requests/:id` (offers include amount, message, and the offerer public card) | List is still every published request, not requester-scoped. |
| Accept / decline | Dashboard and Messages buttons | `POST /api/v1/requests/:id/offers/:offerId/accept` and `.../reject`. Counter: `POST /api/v1/requests/offers/:id/counter`. | Accept opens one conversation and one `ACCEPTED` transaction. |
| Thread | `messages` | Conversation read/send for an existing participant. Accept creates the thread. `/realtime` requires a JWT. | There is still no standalone create-conversation route. |
| Complete exchange | Messages progress strip; Dashboard meetups | `GET` + `PATCH /api/v1/transactions/:id/status` | No appointment route. Accept inserts the transaction. |
| Review | Dashboard "Reviews to complete" cards; Profile reviews tab is read-only fixture | `POST /api/v1/reviews` | Profile reviews list is still fixture text. |

State-by-state wiring instructions are in `docs/UX_REQUEST_FLOW_STATES.md`.

## Page inventory


`src/App.tsx` page ids, in order: `landing`, `onboarding`, `home`, `explore`, `categories`, `map`, `listing`, `create`, `messages`, `saved`, `profile`, `dashboard`, `housing`, `services`, `jobs`, `community`.

Signed-out visitors can open `landing` and `onboarding`. Any other id shows the existing "Sign in to continue" gate. `Navigation` is hidden on `landing` and `onboarding`. `unreadMessages={2}` is hardcoded. The landing page has a fixed "Preview" bar for prototype jumps.

`listing` always renders `listings[0]` from fixtures. Cards navigate to that same screen. There is no selected-id argument.

## Nova handoff

1. Read `docs/DECISIONS.md` before changing behavior.
2. Wire only the states in `docs/UX_REQUEST_FLOW_STATES.md`. Do not add page ids, routes, or layouts.
3. Treat `docs/API_SPEC.md` and `docs/DATABASE_DESIGN.md` **IMPLEMENTED** sections as the contract that exists. **TARGET** sections are not permission to pretend the UI is persisted.
4. Where a control has no endpoint (Accept, Decline, Save draft, review submit, conversation create), keep the control and surface the existing error treatment. Do not flip local fixture state and call it success.
5. Leave Figma sample copy and the AI Review step on the Create Listing wizard. Do not call a model.

## Explicitly not in this status

- No `src/` or `backend/` diff in the June Sprint 1 docs PR.
- No AI feature work.
- Map and profile remain fixture screens. Housing, services, jobs, and community now have APIs (`0003_verticals`) and are still fixture screens until the wiring PR. They are mapped in `docs/FRONTEND_BACKEND_MAP.md`.

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
- Next spine: offer accept/reject → conversation + transaction; then Nova wiring and Sentinel tests.

