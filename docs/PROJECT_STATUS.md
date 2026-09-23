# Project Status

Neighborly Sprint 1 — June (UI/UX), documentation pass. Inspected from `main` at `d0dab1c` ("Build Neighborly marketplace foundation") on 2026-09-23. This file is the Atlas status board for the Nova handoff.

## Source of truth

- **Visual source of truth:** the Figma-generated React screens under `src/pages` and `src/components`. Layout, color, type, and component structure stay as generated.
- **App shell:** Vite + React 19 + Tailwind CSS v4. Page changes are client state in `src/App.tsx` (`page` ids), not a URL router. That shell stays.
- **Backend:** NestJS modular monolith under `backend/`, Prisma/PostgreSQL, global prefix `/api/v1`, Swagger at `/docs`.
- **This sprint's write scope:** `docs/` only. June does not edit `src/` or `backend/`.

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
- Requests: public list of published requests, authenticated create (always `PUBLISHED`), create offer, counter-offer.
- Messaging: list conversations, list/send messages, mark read, for existing participants. Socket.IO namespace `/realtime` is declared and does not authenticate or emit from the send path.
- Transactions: list for a participant, status transition through `backend/src/transactions/transaction-state.ts`. Nothing in the API creates a transaction, appointment, or review.
- Health: `GET /api/v1/health`, `GET /api/v1/ready` (Postgres `SELECT 1` only).
- Local infra: `docker-compose.yml` runs PostGIS 16 and Redis 7. The schema stores latitude/longitude as decimals. There is no geometry column.

Frontend pages that call the API: `App` (session), `Landing` (login), `Onboarding` (register + onboarding), `CreateListing` (categories + `POST /listings`), `SavedItems` (favorites + saved searches), and `ListingCard` heart when a page does not override `onSavedChange`.

Every other page still renders `src/data/index.ts`.

## Request-first flow status

The product flow is: post a need, receive offers, compare and counter, message, complete, review.

| Step | UI that already exists | API that already exists | Gap Nova must not invent a screen for |
| --- | --- | --- | --- |
| Compose and publish a request | `create` → `src/pages/CreateListing.tsx` wizard | `POST /api/v1/requests` (client method `api.requests.create` is unused by the page) | Page still publishes a listing. No draft route. |
| See offers | `dashboard` Offers tab and Overview pending cards; `messages` offer card | `GET /api/v1/requests` returns offer `id` + `status` only, for every published request | No requester-scoped offer payload (amount, message, offerer). |
| Accept / decline | Dashboard and Messages buttons | Not implemented | Counter exists: `POST /api/v1/requests/offers/:id/counter`. |
| Thread | `messages` | Conversation read/send for an existing participant | No create-conversation route. Messages page uses `conversations` fixtures. |
| Complete exchange | Messages progress strip; Dashboard meetups | `GET` + `PATCH /api/v1/transactions/:id/status` | No create-transaction or appointment route. |
| Review | Dashboard "Reviews to complete" cards; Profile reviews tab is read-only fixture | `Review` model only | No review route. |

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
- Housing, services, jobs, community, map, and profile remain fixture screens. They are mapped in `docs/FRONTEND_BACKEND_MAP.md` and are out of the request-flow wiring slice.
