# Release Checklist

Two checklists. The first is the June Sprint 1 docs gate. The second is the product gate for wiring the request-first flow. Do not treat the second list as done.

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

Nova checks these against the running app. June is not implementing them in this PR.

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

- [ ] Loading uses the Saved Items loading card treatment
- [ ] Empty uses `EmptyState` already exported from `src/components/ui.tsx`
- [ ] A real offer row uses the existing Dashboard offer card (thumb, title, offerer line, Accept / Counter / Decline)
- [ ] Counter calls `POST /api/v1/requests/offers/:id/counter` and does not add a new dialog
- [ ] Accept and Decline do not show the Messages green/coral confirmation until those routes exist
- [ ] Failures use the existing alert or warning banner classes, not a new toast system
- [ ] Fixture offer arrays in `Dashboard.tsx` are not shown once the page is API-backed

### Messages

- [ ] Thread list and bubbles stay the current two-pane layout
- [ ] When `GET /conversations` is empty, the pane uses the empty treatment from the UX spec, not a blank crash
- [ ] Send uses `POST /conversations/:id/messages` only for a real conversation id
- [ ] The payment-safety banner still appears for the existing Venmo/Zelle/PayPal check and does not send

### Reviews (`dashboard`)

- [ ] "Reviews to complete" stays the current card row
- [ ] Rate opens the existing Listing Detail message-modal shell
- [ ] Skip and the modal X close without a network call
- [ ] Submit does not show the success check until `POST /reviews` exists
- [ ] Profile reviews tab stays the read-only Figma layout

### Regression

- [ ] Landing login, onboarding register, create-listing category load, and Saved Items favorites still behave as in `docs/INTEGRATION_LOG.md`
- [ ] Signed-out gate and the landing Preview bar still work
- [ ] Home, Explore, Map, Housing, Services, Jobs, and Community still show their Figma fixtures until their own slice

## C. Not a release blocker for the docs PR, and not done in product

These are target. Shipping them is outside June's docs PR.

- Refresh tokens, MFA, device sessions
- Draft requests and draft listings
- `GET /requests/:id` with offer amount, message, and offerer
- Accept, reject, and withdraw
- Create conversation, typing, attachments
- Authenticated realtime emits
- Create transaction from an accepted offer; appointment writes
- Review create/list; trust scores computed from reviews
- Image upload (S3 is env-only)
- Price history writes and real price-drop alerts
- Radius / PostGIS search (columns are decimals)
- Payments, refunds, disputes beyond the status enum
- Community, housing, jobs, services APIs
- Redis health in `/ready`
- The custom error envelope (`code`, `details`, `timestamp`)

## D. Visual freeze check before merge of any wiring PR

- [ ] Diff does not restyle shared tokens (`#FAFAF7`, `#1B2A4A`, `#2D6A4F`, `#E8694A`, `#E8E6DF`, `#8A9AB5`)
- [ ] No new page id in `src/App.tsx`
- [ ] Create Listing still has six steps: Type, Photos, Details, AI Review, Preview, Publish
- [ ] Dashboard tabs remain Overview, My Listings, Offers, Activity
- [ ] Messages filters remain all, active, archived, transactions
