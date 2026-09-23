# Release Checklist

Three gates. Section A is the June Sprint 1 docs gate. Section B is the request-first wiring gate. Section E is the Sprint 2 vertical wiring record plus the local Mac boot that has not been run. Checked boxes in B and E are code reads against `main` at `1f38563`. They are not a live signed-in browser pass, and they are not a release.

Visual rule for every item: Figma screens stay. Vite stays. No new page ids.

## A. June Sprint 1 docs gate

- [x] `docs/PROJECT_STATUS.md` seeded from `src/App.tsx`, `src/pages`, `src/api/client.ts`, and `backend/src`
- [x] `docs/DECISIONS.md` records Figma source of truth, Vite page state, and no-AI v1
- [x] `docs/INTEGRATION_LOG.md` lists real calls versus fixture pages
- [x] `docs/API_SPEC.md` split into **IMPLEMENTED** and **TARGET**
- [x] `docs/DATABASE_DESIGN.md` split into **IMPLEMENTED** and **TARGET**
- [x] `docs/FRONTEND_BACKEND_MAP.md` inventories every page id and links the UX spec
- [x] `docs/UX_REQUEST_FLOW_STATES.md` covers composer, offer compare, and review prompt states on existing screens
- [x] No files under `src/` or `backend/` change in this PR
- [x] v1 docs do not specify OpenAI, embeddings, or semantic search

## B. Request-flow wiring gate (Nova)

Checked items below were read in `src/pages/Dashboard.tsx`, `src/pages/Messages.tsx`, and `src/pages/Profile.tsx` at `1f38563`. Composer boxes stay open. This section is not a release.

### Composer (`create`)

- [ ] Type card still required before Continue (existing disabled rule)
- [ ] Publish calls `POST /api/v1/requests` with `categoryId`, `title`, `description`, `mode` from `docs/DECISIONS.md` D6, and `budgetCents` when the price field is numeric
- [ ] Title shorter than 3 or description shorter than 10 keeps the user on the wizard and shows the existing step-5 alert
- [ ] Category fetch failure still shows "Categories are unavailable. Please retry before publishing."
- [ ] In-flight publish shows "Publishing..." on the existing primary card and disables both cards
- [ ] Success uses the existing celebration block, then navigates with existing buttons only (`dashboard` or `home`)
- [ ] Cancel and Save draft navigate home and do not show success
- [ ] AI Review step still renders and does not call a model
- [ ] Photos, tags, and shipping controls still render and are not sent on the request payload

### Offers (`dashboard`, `messages`)

- [x] Loading uses the Saved Items loading card (`bg-white rounded-2xl border border-[#E8E6DF] p-8 text-center text-sm text-[#8A9AB5]`, text `Loading offers…`) on Overview pending offers and the Offers tab
- [x] An empty offer list uses `EmptyState` from `src/components/ui.tsx` (`No offers yet`, action `Post a request`). Overview skips that empty state when other non-pending offers exist
- [x] Overview pending rows use the existing card: thumb, request title, offerer line, Accept / Counter / Decline. Offers-tab rows stay badge-only
- [x] Messages Counter uses the existing composer and `POST /api/v1/requests/offers/:id/counter` (no new dialog). Dashboard Counter opens Messages only when that offer already has a conversation; otherwise the card shows `Open Messages isn't available for this offer yet.`
- [x] Accept and Decline call `POST /api/v1/requests/:id/offers/:offerId/accept` and `.../reject`. They do not paint `✓ Offer accepted!` or `✗ Offer declined`. A failure stays on the card alert
- [x] Load and action failures use the existing `#FFF5F2` / `#E8694A` alert classes, not a new toast
- [x] `Dashboard.tsx` has no fixture offer array. Rows come from `GET /requests` and `GET /requests/:id`

### Messages

- [x] Thread list and bubbles stay the current two-pane layout
- [x] When `GET /conversations` is empty, the list pane uses `EmptyState` (`No messages yet`, `Back to dashboard`)
- [x] Send uses `POST /conversations/:id/messages` only when a conversation id from that list is selected
- [x] The payment-safety banner still appears for the Venmo/Zelle/PayPal check and does not send

### Reviews (`dashboard`)

- [x] "Reviews to complete" stays the Overview card row, built from `COMPLETED` transactions the caller is on
- [x] Rate opens the existing Listing Detail message-modal shell
- [x] Skip and the modal X close without a network call. Skip is session-local
- [x] The success check (`Review submitted`) renders only after `POST /reviews` resolves. `GET /users/:id/reviews` exists; Dashboard does not call it yet
- [x] Profile reviews tab stays the read-only Figma layout and loads `GET /users/:id/reviews`

### Regression

- [ ] Landing login, onboarding register, create-listing category load, and Saved Items favorites still behave as they do in the current pages (not re-run against a database in this docs pass)
- [ ] Signed-out gate and the landing Preview bar still work when clicked (both are still in `src/App.tsx` / `Landing`; this docs pass did not exercise them)
- [x] Housing, Services, Jobs, and Community call `/api/v1` with loading, empty, error, and 401 copy (`Sign in to continue.`). Home listing rails and the service, event, and discussion strips call the APIs. They do not render the old vertical fixture arrays
- [x] Explore loads `GET /listings` and still applies extra filters in the browser. Map loads `GET /listings` and places pins from public neighborhood labels. Landing and Categories still import `src/data/index.ts` for surfaces with no read endpoint. Profile does not

## C. Not a release

These are outside the June docs PR. A checked line is in the tree at `1f38563` with the caveat on that line. Unchecked lines are still target. None of this is a release.

### In the tree, with caveats

- [x] `GET /requests/:id` includes offer amount, message, and a public offerer card. `GET /requests` is still every published request, not requester-scoped
- [x] Accept and reject exist. Accept creates one conversation and one `ACCEPTED` transaction. Withdraw is not implemented. There is no appointment write route
- [x] `POST /reviews` exists for a participant when the transaction is `COMPLETED`. `GET /users/:id/reviews` lists them for Profile. The Dashboard trust banner stays painted copy
- [x] `/realtime` requires a JWT, and send emits `message.created`. Typing, attachments, and `POST /conversations` are not implemented
- [x] Housing, jobs, services, and community PostgreSQL APIs exist (`cfd0db3`), including public list/get and the mutations those pages call (jobs apply/save, service quotes, community post/reaction/RSVP/claim). `pnpm prisma:seed` loads fixture-shaped rows. Remaining UI gaps are the unchecked list below

### Still open

- Refresh tokens, MFA, device sessions
- Draft requests and draft listings
- Withdraw an offer
- Create a conversation from a listing or the Messages plus button; typing; attachments
- Trust scores computed from reviews. The reviews list route exists; Dashboard still does not use it to hide a prompt
- Lost-and-found and giveaway composers (`+ Post lost/found` and `+ Give something` have no form). Reply, Share, and lost-and-found Contact do not start a thread
- Dashboard Pause, Promote, and Mark sold (the buttons render and have no route)
- Landing marketing cards and the Categories featured strip (`listings` fixtures). Map and Profile primary content read the API
- `Navigation` unread badge (`unreadMessages={2}` in `src/App.tsx`). Dashboard's own message count reads conversations
- Image upload (S3 is env-only)
- Price history writes and real price-drop alerts
- Radius / PostGIS search (columns are decimals)
- Payments, refunds, disputes beyond the status enum
- Redis health in `/ready`
- The custom error envelope (`code`, `details`, `timestamp`)

## D. Visual freeze check before merge of any wiring PR

PR #9 (`1f38563`) claimed no new page ids and that the Figma UI was preserved. `src/App.tsx` still lists the same sixteen ids: `landing`, `onboarding`, `home`, `explore`, `categories`, `map`, `listing`, `create`, `messages`, `saved`, `profile`, `dashboard`, `housing`, `services`, `jobs`, `community`. The boxes stay open. This docs pass did not re-diff shared tokens or re-run a visual pass.

- [ ] Diff does not restyle shared tokens (`#FAFAF7`, `#1B2A4A`, `#2D6A4F`, `#E8694A`, `#E8E6DF`, `#8A9AB5`)
- [ ] No new page id in `src/App.tsx`
- [ ] Create Listing still has six steps: Type, Photos, Details, AI Review, Preview, Publish
- [ ] Dashboard tabs remain Overview, My Listings, Offers, Activity
- [ ] Messages filters remain all, active, archived, transactions

## E. Sprint 2 vertical wiring and local Mac boot

Code items are what `cfd0db3` and `1f38563` contain. The Mac boot boxes stay open: Docker Desktop is not installed on the Mac, and a live signed-in browser pass against the seeded database was not run. This section is not a release.

### Vertical wiring (in the tree)

- [x] Housing, jobs, services, and community PostgreSQL APIs, plus seed rows (`cfd0db3`)
- [x] Those four pages, plus Home and Dashboard, call `/api/v1` with loading, empty, error, and 401 states (`1f38563`)
- [x] Frontend CI runs Vitest (`pnpm test` in `.github/workflows/ci.yml`) with `tsc` and `vite build`

### Local Mac boot (not run)

- [ ] `.env` copied from `env.example` to `backend/.env` and the repo root (`DATABASE_URL`, `JWT_SECRET` of at least 32 characters, `CORS_ORIGIN`, `VITE_API_URL`)
- [ ] `docker compose up -d` for Postgres (PostGIS 16) and Redis 7
- [ ] `pnpm prisma:migrate` in `backend/` against that database
- [ ] `pnpm prisma:seed`
- [ ] Node 22 (`.mise.toml`) verify on the Mac: frontend `tsc`, Vitest, and `vite build`; backend `tsc`, Jest, and nest build
- [ ] Full signed-in e2e against the seeded database (publish, offer, accept, message, review, and the four verticals)
