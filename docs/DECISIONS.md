# Decisions

Locked for Neighborly Sprint 1 (June UI/UX → Nova wiring). Dates are the docs pass, 2026-09-23, against foundation commit `d0dab1c`.

## D1 — Figma screens are the visual source of truth

The generated UI in `src/pages` and `src/components` is the product surface. Nova does not redesign it, restyle it, or swap the palette, type, radii, or component set. Tailwind utilities already on those nodes stay.

Allowed inside an existing node: bind data, loading, error, and disabled behavior specified in `docs/UX_REQUEST_FLOW_STATES.md`. Not allowed: new page ids, new marketing sections, new empty-state illustrations, or a second design system.

## D2 — Vite client page state stays

Navigation remains `setPage` in `src/App.tsx`. Page ids stay:

`landing`, `onboarding`, `home`, `explore`, `categories`, `map`, `listing`, `create`, `messages`, `saved`, `profile`, `dashboard`, `housing`, `services`, `jobs`, `community`.

Sprint 1 does not introduce React Router or URL-backed routes. A control that needs a destination uses one of those ids.

## D3 — June Sprint 1 is documentation only

June writes `docs/` and does not edit `src/` or `backend/`. Nova owns later wiring. Docs describe the repo as it is, then the target contract separately.

## D4 — No AI in v1

v1 does not call OpenAI or any other model. v1 does not add embeddings or semantic search.

These existing visuals stay, unwired:

- Create Listing step "AI Review" (`steps[3]` in `src/pages/CreateListing.tsx`), including the photo-review panel and price bar.
- Landing feature copy that says "AI-powered" scam detection.

Listing search that exists today is Prisma `contains` on title and description (`mode: insensitive`). That is the v1 search behavior. Full-text and radius filters are target work, not a vector index.

## D5 — Request flow reuses three existing screens

No new screens for the request-first path.

| Flow | Existing surface |
| --- | --- |
| Request composer | `create` → `src/pages/CreateListing.tsx` |
| Offer compare | `dashboard` Offers tab, Overview pending-offer cards, and the Messages offer card |
| Review prompt | Dashboard "Reviews to complete" row, using the Listing Detail message-modal shell for submit |

Details, including which API call is real, are in `docs/UX_REQUEST_FLOW_STATES.md`.

## D6 — Type card ids map to exchange mode without new cards

`CreateListing` already has eight type cards. Labels and layout stay. When Nova publishes a need from that wizard, `mode` is derived from the selected card id:

| Card id | Label on screen | `ExchangeMode` |
| --- | --- | --- |
| `item` | Item for Sale | `BUY` |
| `free` | Free Item | `FREE` |
| `housing` | Housing | `RENT` |
| `job` | Job or Gig | `HIRE` |
| `service` | Service | `SKILL_SWAP` |
| `vehicle` | Vehicle | `BUY` |
| `event` | Event | `TRADE` |
| `lost-found` | Lost & Found | `BORROW` |

This table is a wiring map. It does not change card copy. `POST /api/v1/requests` requires `mode`.

## D7 — Publish persists; draft and cancel do not

`POST /api/v1/requests` and `POST /api/v1/listings` both write `status: PUBLISHED`. The `DRAFT` enum values are unused by those handlers.

The wizard's "Cancel" (step 0) and "Save draft" (header and step 5) already navigate to `home` and write nothing. They stay that way until a draft endpoint exists. Nova must not show the success panel after those clicks.

## D8 — Validation library and error shape match the server

Implemented validation is `class-validator` via the global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`). The older "Zod envelope" wording is withdrawn.

Implemented error bodies are Nest HTTP exceptions. The client reads `message` (`src/api/client.ts`). `message` may be a string or a string array. There is no `{ code, details, timestamp }` envelope in code.

A structured envelope remains target-only. Do not document the target shape as if the UI already receives it.

## D9 — Access token only

Register and login return `{ user: { id, email }, accessToken }`. The client stores `neighborly.access_token` in `localStorage`. Sign-out removes that key. There is no refresh route, even though `JWT_REFRESH_SECRET` is required in `backend/src/common/config/env.validation.ts`.

v1 wiring uses the access token. Refresh rotation, device sessions, and MFA stay target.

## D10 — Offer actions that exist vs buttons that are only painted

Implemented offer writes:

- `POST /api/v1/requests/:id/offers` creates a `PENDING` offer. The offerer cannot be the requester. `listingIds` must be that offerer's `PUBLISHED` listings.
- `POST /api/v1/requests/offers/:id/counter` is allowed for the requester or the offerer while status is `PENDING` or `COUNTERED`. It sets status to `COUNTERED` and inserts `CounterOffer`.

Not implemented: accept, reject, withdraw, expire. The Accept and Decline buttons in Dashboard and Messages stay visible (D1) and must not locally flip to the green "accepted" or coral "declined" confirmation once Nova is on real data. Counter may call the counter endpoint. See the UX state spec for the error treatment.

## D11 — Do not attach fixture ids to UUID routes

Fixture listing ids are `l1`, `l2`, and so on (`src/data/index.ts`). Favorite, listing get, and offer routes expect UUIDs. `ListingCard` already calls `POST /listings/:id/favorite` unless the page passes `onSavedChange`. On fixture feeds that call fails and the card reverts the heart. Nova does not "fix" that by sending fixture ids. Those feeds stay on fixtures until they load `GET /listings`.

## D12 — Reviews are a model, not an endpoint

`Review` exists on the Prisma schema (`transactionId`, `authorId`, `subjectId`, `rating`, `body`). No controller writes or reads it. `GET /transactions` does not include reviews. The Dashboard prompt can render from transaction status only after Nova can tell a transaction is `COMPLETED`. Submitting a review is target. The UX spec says how the existing modal behaves when the call is missing.

## D13 — Community, housing, jobs, services, and map stay fixture-backed

They are out of the Sprint 1 request-flow slice. Do not block request wiring on those modules, and do not replace their fixtures with empty API shells that remove the Figma content.
