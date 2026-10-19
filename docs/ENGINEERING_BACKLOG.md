# Engineering backlog

Date: 2026-10-19
Baseline: `dc761e51864e03a57c056b4bb2068c6362ced40b` on `main`
Source: `docs/ENGINEERING_TAKEOVER_AUDIT.md`
State: no item below has been implemented. This file is the queue, not a progress log. Progress lives in `docs/IMPLEMENTATION_PROGRESS.md`.

## How to read a row

| Field | Rule |
| --- | --- |
| Priority | **P0** release-blocking. **P1** required before a second replica, a public share link, or a staff workflow. **P2** hardening and honesty. **P3** out of scope until the owner asks. |
| Evidence | **Confirmed** only when this audit reproduced it from source, a command exit code, or CI on `dc761e5`. **Suspected** when it was not re-checked line by line. |
| Cause | One of `genuine code defect`, `missing infrastructure`, `missing credentials or owner decision`, `environment or disk limits`. |
| Complexity | **S** one module or screen and its unit test. **M** a contract change across a few modules. **L** a new navigation model, provider, or multi-service proof. Complexity is scope, not a calendar estimate. |
| Without local Docker | **Yes** means implementation and the acceptance check named here can finish on a machine with Node and pnpm only. **No** means acceptance needs a local Docker daemon. GitHub Actions may still be the place a Docker-backed proof runs; that does not make a not-run suite a pass. |
| Owner | June (UX/a11y), Nova (frontend), Forge (backend), Orbit (DevOps/CI), Sentinel (QA/E2E), Cipher (security), Atlas (integration). One primary. Partners are named when the change crosses a boundary. |

A suite that could not run is not a closed item and is not a pass.

---

## P0

### BL-001 Pause hides the listing from a direct read

- Priority: P0
- Evidence: confirmed
- Cause: `genuine code defect`
- Owner: Forge
- Depends on: none
- Complexity: S. `ListingsService.get` and `pause`, plus the existing listings unit spec.
- Without local Docker: Yes
- Acceptance criteria:
  - `POST /listings/:id/pause` still sets a reversible paused state and does not set `deletedAt` the way archive does.
  - `GET /listings/:id` returns 404 for that paused row.
  - `GET /listings/:id/manage` still returns it to the owner.
  - The public list stays limited to `PUBLISHED`.
  - A unit test fails on today's `get()` behavior and passes after the change.

### BL-002 Suspended members' public rows disappear

- Priority: P0
- Evidence: confirmed
- Cause: `genuine code defect`
- Owner: Cipher. Partner: Forge
- Depends on: none
- Complexity: M. Public reads in listings, and the same owner-status hole on housing, jobs, services, community, and requests.
- Without local Docker: Yes for unit tests that stub Prisma. A PostgreSQL proof is CI's integration job, not a local-Docker requirement for the patch itself.
- Acceptance criteria:
  - After `SUSPEND_USER`, `GET /listings/:id` and `GET /listings` omit that seller's published rows.
  - The same rule holds for the other public vertical reads.
  - The suspended account still cannot call authenticated routes (already true; do not regress it).
  - Restoring the account makes the rows public again without a manual republish, unless the owner decides unpublish-on-suspend is the policy. Default in this item: hide while suspended, show again when `ACTIVE`.

### BL-003 Marketplace completion and disputes need both sides or staff

- Priority: P0
- Evidence: confirmed
- Cause: `genuine code defect`
- Owner: Cipher. Partner: Forge
- Depends on: none. Borrow's staff gate is the pattern, not a blocker.
- Complexity: M. `transaction-state.ts`, `TransactionsService.transition`, review eligibility.
- Without local Docker: Yes
- Acceptance criteria:
  - A single participant cannot move `IN_PROGRESS` to `COMPLETED`.
  - A single participant cannot move `DISPUTED` to `COMPLETED`, `REFUNDED`, or `CANCELLED`.
  - Staff can resolve `DISPUTED`. Both participants, or an explicit two-step confirm, are required for `COMPLETED`.
  - A review cannot be created from a one-sided status write.
  - Unit tests cover the rejected transitions.

### BL-004 Service avatars are not universally verified

- Priority: P0
- Evidence: confirmed
- Cause: `genuine code defect`
- Owner: Nova. Partner: June
- Depends on: none
- Complexity: S. `src/pages/Services.tsx` and `vertical-screens.test.tsx`.
- Without local Docker: Yes
- Acceptance criteria:
  - The provider avatar does not receive `verified` unless the API payload carries a real verification signal.
  - The public service payload today does not include email or identity verification, so the badge is absent.
  - A frontend test fails if every card renders the verified treatment.

### BL-005 Addressable URLs, deep links, and a 404

- Priority: P0
- Evidence: confirmed
- Cause: `genuine code defect`
- Owner: Nova. Partner: June
- Depends on: none. Notification link values should be updated in the same change or immediately after (Atlas).
- Complexity: L. `src/App.tsx` page state becomes real paths for listing, request, conversation, borrow, mission, profile, and account token routes. A 404 screen is part of the same change.
- Without local Docker: Yes for the router and unit tests. Browser proof of refresh and back is a later Sentinel run and is not required to land the routes.
- Acceptance criteria:
  - A listing, request, conversation, borrow item, mission, and profile each have a path that survives refresh.
  - `/?verify=` and `/?reset=` still open the token screens and still strip the token from the address bar.
  - An unknown path renders a 404 with a way back to home.
  - Share controls either copy that path or stay disabled with the existing honest copy until they do. They must not pretend a share happened.
  - Notification targets use those paths.

### BL-006 Invalid UUIDs return 400

- Priority: P0
- Evidence: confirmed for the missing pipe. A live HTTP 500 was not reproduced on this VM (no API process). The defect is the raw `@Param` on UUID routes.
- Cause: `genuine code defect`
- Owner: Forge
- Depends on: none
- Complexity: M. Controllers for listings, conversations, transactions, housing, jobs, services, community, and media.
- Without local Docker: Yes
- Acceptance criteria:
  - Every UUID route parameter uses `ParseUUIDPipe` or an equivalent that returns 400 before Prisma.
  - A controller test requests `not-a-uuid` and expects 400, not 500, on at least one route per controller above.

### BL-007 Rate limits on the remaining writes, with Retry-After

- Priority: P0
- Evidence: confirmed
- Cause: `genuine code defect`
- Owner: Cipher. Partner: Forge
- Depends on: none
- Complexity: M. `rate-limit.ts` plus housing, jobs, services, community, transactions, and user profile/email writes.
- Without local Docker: Yes
- Acceptance criteria:
  - Those write routes call `enforceRateLimit` with a named policy.
  - A 429 response sets `Retry-After` to the remaining window.
  - `rate-limit.spec.ts` asserts the header.
  - Existing auth and listing limits still return 429 when exceeded.

### BL-008 Production frontend build fails closed without VITE_API_URL

- Priority: P0
- Evidence: confirmed
- Cause: `genuine code defect`
- Owner: Nova
- Depends on: none
- Complexity: S. `src/api/client.ts` and the Vite build.
- Without local Docker: Yes
- Acceptance criteria:
  - `pnpm build` with `VITE_API_URL` unset fails.
  - Dev may keep a localhost default, and that default is not what `vite build` ships.
  - A built bundle does not contain `http://localhost:3000/api/v1` unless that string was the explicit variable.

### BL-009 Template web origin matches the app

- Priority: P0
- Evidence: confirmed
- Cause: `genuine code defect`
- Owner: Atlas
- Depends on: BL-011 for real delivery. The template fix itself does not.
- Complexity: S. `env.example` and any copy of `PUBLIC_WEB_ORIGIN` that still says port 5173.
- Without local Docker: Yes
- Acceptance criteria:
  - `PUBLIC_WEB_ORIGIN` in the local template is the Vite origin (`http://localhost:8443` unless the repo's dev port changes).
  - `env.example` no longer says refresh tokens are not issued, and no longer says no upload route is mounted.
  - A comment states that production must set the public origin or verification links point at the wrong host.

### BL-010 Demo seed must not mint trust

- Priority: P0
- Evidence: confirmed. `backend/prisma/seed.ts` sets housing and job `verified: true`, and service `backgroundCheck`, `rating`, and `reviewCount`.
- Cause: `genuine code defect`
- Owner: Forge. Partner: Nova
- Depends on: BL-004 for the avatar. This item is the data behind badges the API will still return.
- Complexity: S
- Without local Docker: Yes
- Acceptance criteria:
  - Seed rows do not set `verified`, `backgroundCheck`, `rating`, or `reviewCount` to a passing trust value.
  - Public serializers omit those fields or return them only when a staff or passport record computed them.
  - README's "never seed production" rule stays. This item still stops a local demo from teaching the UI to show fake checks.

### BL-011 Email that reaches a person

- Priority: P0
- Evidence: confirmed. Delivery is the outbox or stdout. No provider package is installed.
- Cause: `missing credentials or owner decision`
- Owner: Atlas. Partner: Orbit
- Depends on: an owner choice of provider and credentials. BL-009 should land first so links use the right origin.
- Complexity: L. An `EmailSender` implementation or an outbox drainer, env validation, and a test that uses a fake transport.
- Without local Docker: Yes for the adapter and a fake-transport test. A live provider send needs credentials and is not required to prove the seam.
- Acceptance criteria:
  - Owner names the provider. Until then this item stays open.
  - Production still refuses `EMAIL_SENDER=console`.
  - A verification and a password-reset message can be handed to the provider adapter without writing the token to logs.
  - With the adapter faked, register and forgot-password return success and enqueue one message.
  - A real mailbox send is demonstrated only after credentials exist. It is not claimed before that.

### BL-012 Lawyer-reviewed legal text

- Priority: P0
- Evidence: confirmed. `docs/legal/*_PLACEHOLDER.md` and `href="#"` links.
- Cause: `missing credentials or owner decision`
- Owner: June
- Depends on: counsel and Imani Gad. Do not invent legal text.
- Complexity: S once the text exists. The writing is the owner's, not an engineering estimate.
- Without local Docker: Yes
- Acceptance criteria:
  - Placeholder files are not linked as consent.
  - When reviewed text lands, footer and onboarding open it, and the placeholder banner is gone.
  - Until that text exists, the UI does not say the member agreed to a policy the repo does not have.

### BL-013 Production host, DNS, and TLS

- Priority: P0
- Evidence: confirmed. `deploy-production.yml` refuses even when enabled. Nothing was deployed.
- Cause: `missing credentials or owner decision`
- Owner: Orbit
- Depends on: owner hosting decision. Do not dispatch the production workflow.
- Complexity: L after the decision. The current stub stays until a reviewed job replaces it.
- Without local Docker: The decision needs no Docker. A deploy proof needs the chosen host, which is outside this VM.
- Acceptance criteria:
  - Owner names the host and the public name.
  - The production workflow still refuses until that target is reviewed.
  - This backlog item does not authorize a deploy.

---

## P1

### BL-014 HomeFeed preview neighbors

- Priority: P1
- Evidence: confirmed. `suggestedPeople` in `HomeFeed.tsx` renders a verified avatar and a star rating under a preview label.
- Cause: `genuine code defect` if the section ships on a public launch. Keeping a clearly fake preview is `missing credentials or owner decision`.
- Owner: June
- Depends on: owner choice to remove the section or keep it visibly fake.
- Complexity: S
- Without local Docker: Yes
- Acceptance criteria:
  - Either the section is gone, or it shows no verified badge and no star rating.
  - The preview label, if the section remains, is still visible.

### BL-015 Staff report queue screen

- Priority: P1
- Evidence: confirmed. `src/` has no caller of `/moderation`.
- Cause: `genuine code defect`
- Owner: Nova. Partner: Forge
- Depends on: the existing moderation API. No new moderation rule.
- Complexity: M
- Without local Docker: Yes
- Acceptance criteria:
  - A signed-in staff member can open the report queue, and a non-staff member cannot.
  - Hide, suspend, and restore call the existing endpoints and show the error when the API rejects them.
  - Passport and mission staff tools keep working.

### BL-016 Appointments: create them or stop implying them

- Priority: P1
- Evidence: confirmed. Model and `GET /transactions` include exist. No create call exists in `backend/src`.
- Cause: `genuine code defect`
- Owner: Forge. Partner: Nova
- Depends on: BL-003 if creation is allowed only after a real two-sided accept. Owner chooses create versus remove.
- Complexity: M
- Without local Docker: Yes
- Acceptance criteria:
  - If the owner keeps meetups: `POST /transactions/:id/appointments` is participant-only, and Dashboard shows the created row.
  - If the owner drops meetups: Dashboard does not render an empty meetup list as if scheduling worked, and the API does not grow a new route.
  - One of those two is done. Leaving both the model and a silent UI is not done.

### BL-017 Photos on first listing publish

- Priority: P1
- Evidence: confirmed. `CreateListingFlow` mounts `ImageManager` with `listingId={null}`.
- Cause: `genuine code defect`
- Owner: Nova. Partner: Atlas
- Depends on: upload route, which already exists.
- Complexity: S
- Without local Docker: Yes for the UI state. A byte-level storage proof is the existing CI storage job.
- Acceptance criteria:
  - After a listing id exists, the create flow can upload a JPEG, PNG, WebP, or GIF through `POST /listings/:id/images`.
  - The wizard tells the member when photos wait until the draft exists, if that is still the sequence.
  - The AI Review step stays decorative. Do not call a model.

### BL-018 Dev database ports bind to loopback

- Priority: P1
- Evidence: confirmed from `docker-compose.yml` (`5432:5432`, `6379:6379`). A live bind was not probed. Cause of the config is a code defect. Cause of the missing probe is the environment.
- Cause: `genuine code defect`
- Owner: Orbit. Partner: Cipher
- Depends on: none
- Complexity: S
- Without local Docker: Yes to edit the file. Confirming the listen address needs Docker, so that confirmation is not claimed here.
- Acceptance criteria:
  - Default `postgres` and `redis` ports are `127.0.0.1:5432:5432` and `127.0.0.1:6379:6379`, matching staging.
  - `env.example` hostnames stay `localhost`.

### BL-019 Docs match the tree

- Priority: P1
- Evidence: confirmed
- Cause: `genuine code defect`
- Owner: Atlas
- Depends on: BL-009 can land inside this item.
- Complexity: S
- Without local Docker: Yes
- Acceptance criteria:
  - `docs/FRONTEND_BACKEND_MAP.md` no longer lists Dashboard pause, community neighbor count, or Explore save-search as unwired.
  - `docs/PROJECT_STATUS.md` is not headed as if Milestone 7 were the tip.
  - `docs/legal/TERMS_OF_SERVICE_PLACEHOLDER.md` does not say v1 has no image upload.
  - No application behavior changes in the doc-only commit.

### BL-020 Staging object store matches CI

- Priority: P1
- Evidence: confirmed from `docker-compose.yml` (`quay.io/minio/minio`) and the CI comment that MinIO is not anonymously pullable and CI uses `rustfs/rustfs:1.0.1`. The pull was not attempted on this VM.
- Cause: `genuine code defect` in the pin. Proving a pull is `environment or disk limits` until Docker exists, and that proof is not a pass today.
- Owner: Orbit
- Depends on: none
- Complexity: S
- Without local Docker: Yes to change the pin. A boot of the staging profile needs Docker and is a follow-up, not a pass.
- Acceptance criteria:
  - The staging profile uses the same rustfs image and the same S3 API settings the storage CI job uses, or the compose comment names a mirror that was actually pulled.
  - `scripts/run-storage-tests.sh` and CI stay on that image.

### BL-021 Realtime fan-out across API processes

- Priority: P1 for more than one API process. Not a blocker for a single process.
- Evidence: confirmed. `@socket.io/redis-adapter` is not in `backend/package.json`. Single-process emit is covered by unit specs.
- Cause: `missing infrastructure`
- Owner: Forge. Partner: Orbit
- Depends on: Redis, which production validation already requires.
- Complexity: M
- Without local Docker: Yes to add the adapter behind a test double. Two real processes need Docker or CI, and that proof is not done.
- Acceptance criteria:
  - A message emitted on process A is delivered to a socket connected to process B in a test that actually starts two gateways.
  - One-process behavior stays green.
  - Until that test exists, docs keep the single-replica limit. Do not mark this item done from a code reading.

### BL-022 Error tracking that sends

- Priority: P1
- Evidence: confirmed. `captureException` only logs. `@sentry/node` is not a dependency.
- Cause: vendor choice is `missing credentials or owner decision`. The hook that ignores a set DSN is `genuine code defect`.
- Owner: Orbit
- Depends on: owner names a vendor and provides the project. Do not add a paid SDK before that.
- Complexity: M after the decision. S to make a missing DSN stay a log and a set DSN fail startup until the SDK exists, if that is the chosen guard.
- Without local Docker: Yes
- Acceptance criteria:
  - With no DSN, exceptions still log and the process still boots.
  - With a DSN and no SDK, startup fails with a clear message, or the SDK is installed and a test double records one captured exception.
  - No secret is committed.

### BL-023 Package name and Figma HTML shell

- Priority: P1
- Evidence: confirmed
- Cause: `genuine code defect` for `figma-make-app` and the `figma:*` markers. `noindex` stays until BL-037.
- Owner: Nova
- Depends on: Vite's use of `.figma/make/site.json` for the title. Do not drop `noindex` in this item.
- Complexity: S
- Without local Docker: Yes
- Acceptance criteria:
  - Root `package.json` name is `neighborly` or another owner-approved name, not `figma-make-app`.
  - Built `index.html` title remains "Neighborly — Your local community marketplace".
  - `robots` stays `noindex, nofollow` until BL-037.
  - `pnpm lint`, `tsc`, and `pnpm build` pass.

### BL-024 Tracked browser-smoke PNGs

- Priority: P1
- Evidence: confirmed. 19 tracked PNGs under `artifacts/docker-release-verification/browser-smoke/`, about 7.2 MB. The older "211 PNGs / 33 MB" claim does not match this tree.
- Cause: `missing credentials or owner decision` (a prior audit left deletion to the owner)
- Owner: Orbit
- Depends on: owner says the smoke PNGs can leave git.
- Complexity: S
- Without local Docker: Yes
- Acceptance criteria:
  - Owner agrees.
  - Those PNGs are gitignored or removed in a commit that does not touch application code.
  - `.gitignore` still ignores AppleDouble `._*` files.

### BL-025 Controls that look active and are not

- Priority: P1
- Evidence: confirmed for share, reserve, follow, save-home, save-service, commute, and Saved Items compare. Each sets a local note or local state. Payments, Promote, AI Review, and Google/Apple are the P3 boundary items, not this one.
- Cause: `genuine code defect`
- Owner: June. Partner: Nova
- Depends on: BL-005 before share copies a URL. The others can ship as removed or as disabled controls with the existing honest sentence.
- Complexity: M
- Without local Docker: Yes
- Acceptance criteria:
  - Each control either performs its API action or is disabled and explained.
  - Compare does not present a result that was not computed.
  - Price-alert copy does not invent a discount.

### BL-026 PostGIS or an honest radius

- Priority: P1
- Evidence: confirmed. No `ST_*` and no `geography` column. Image is `postgis/postgis:16-3.4`.
- Cause: `genuine code defect` (image and queries disagree). Whether marketing says "true radius" is `missing credentials or owner decision`.
- Owner: Forge
- Depends on: owner only if the product promise must be PostGIS. The code can document the bounding box without that decision.
- Complexity: M
- Without local Docker: Yes to switch the Compose image off PostGIS or to add a query. Proving `ST_DWithin` on a real server needs Postgres with PostGIS, which is Docker or CI, and is not done.
- Acceptance criteria:
  - Either migrations enable PostGIS and radius uses it, with a test, or Compose stops using the PostGIS image and the API docs say the filter is a bounding box plus an in-process distance.
  - Do not claim a PostGIS test passed until that test runs.

### BL-027 Rollback path

- Priority: P1
- Evidence: confirmed there is no `down.sql`. Backup scripts exist. The rehearsal did not run.
- Cause: no down migrations is `missing infrastructure`. The un-run rehearsal is `environment or disk limits` and is not a pass.
- Owner: Orbit
- Depends on: a Docker host for the rehearsal.
- Complexity: M
- Without local Docker: No for the acceptance rehearsal. Writing a runbook can proceed without Docker and does not close the item.
- Acceptance criteria:
  - `scripts/backup-postgres.sh` and `scripts/restore-postgres.sh` are run against a disposable database and the row counts match.
  - The log of that run is kept out of git if it contains connection strings.
  - Docs say schema rollback is restore-only until down migrations exist.

### BL-028 Vertical modules in the PostgreSQL suite

- Priority: P1
- Evidence: confirmed. Housing, jobs, services, and community have mock HTTP specs and no `*.integration.spec.ts`.
- Cause: `genuine code defect` in coverage. Running the new specs is `environment or disk limits` on this VM and is not a pass until CI or a Docker host runs them.
- Owner: Sentinel. Partner: Forge
- Depends on: BL-002 and BL-006 if those fixes should be in the same suite.
- Complexity: M
- Without local Docker: The specs can be written without Docker. Acceptance is a green integration job. Local acceptance needs Docker.
- Acceptance criteria:
  - Each vertical has an integration spec on real Postgres for create, public get, and non-owner update rejection.
  - CI's Integration job runs them.
  - Mock HTTP specs stay.

### BL-029 Re-run journey and security probes on this SHA

- Priority: P1
- Evidence: confirmed they did not run. The 42/42 and 28/28 results belong to `343584a`.
- Cause: `environment or disk limits`
- Owner: Sentinel
- Depends on: Docker, a migrated database, and a running API. Product fixes BL-001 through BL-004 should land first so the probe sees the intended behavior.
- Complexity: S to execute. Not a code change by itself.
- Without local Docker: No
- Acceptance criteria:
  - Both scripts run against `dc761e5` or a descendant that contains the P0 code fixes.
  - The report records command, exit code, and counts.
  - A skipped run is written as not run. It is not written as a pass.

### BL-030 Re-run the authenticated axe harness

- Priority: P1
- Evidence: confirmed it did not run. Local `messages-accessibility.test.tsx` did pass (250 frontend tests include it).
- Cause: `environment or disk limits` for the browser harness. A residual unlabeled-icon problem on older screens is **suspected** and is not confirmed by this audit.
- Owner: Sentinel. Partner: June
- Depends on: Docker or a running web+API, plus a browser.
- Complexity: S to execute. Any defect it finds is a new item.
- Without local Docker: No for the full harness. The existing Vitest a11y test needs no Docker and already passed; that does not close this item.
- Acceptance criteria:
  - `scripts/milestone10-auth-check.mjs` runs on this SHA or a descendant.
  - Violations become June tickets.
  - WCAG conformance is still not claimed from axe alone.

### BL-031 braces dev advisory

- Priority: P1 to keep visible. Not a production blocker.
- Evidence: confirmed. `pnpm audit` in `backend/` exited 1. `pnpm audit --prod` exited 0. Path is `@types/jest → expect → micromatch → braces`. Patched versions reported as `<0.0.0`.
- Cause: `genuine code defect` in the dev graph, with no available patch.
- Owner: Cipher
- Depends on: an upstream patched `braces` release. Do not suppress the advisory.
- Complexity: S
- Without local Docker: Yes
- Acceptance criteria:
  - CI keeps `--prod` as the blocking gate.
  - The full audit stays non-blocking and still prints `braces`.
  - When a patched release exists, the lockfile moves to it and the full audit exits 0.

### BL-032 Listing cards show a real rating or none

- Priority: P1
- Evidence: confirmed. `listingFromApi` sets `rating: 0` and `reviews: 0`.
- Cause: `genuine code defect`
- Owner: Nova. Partner: Atlas
- Depends on: a public rating field if one should show. Passport ratings exist. Wiring them is the work. Inventing a number is not allowed.
- Complexity: S if the card hides the zeros. M if it loads the passport summary.
- Without local Docker: Yes
- Acceptance criteria:
  - A card with no rating source does not render a zero as if it were a score.
  - If a rating is shown, it comes from the review aggregate, and a test uses a fixture with a non-zero value.

---

## P2

### BL-033 Access token storage

- Priority: P2
- Evidence: confirmed. Access token is in `localStorage` (`neighborly.access_token`). Refresh is an httpOnly cookie.
- Cause: `genuine code defect` only as hardening. It is the current design and is not a P0.
- Owner: Cipher. Partner: Nova
- Depends on: none
- Complexity: M
- Without local Docker: Yes
- Acceptance criteria:
  - A written decision stays with the cookie-plus-memory design or moves the access token out of `localStorage`.
  - Refresh rotation and logout still work.
  - XSS is still treated as session compromise either way.

### BL-034 Map product decision

- Priority: P2
- Evidence: confirmed the page uses `src/lib/map-pins.ts` and does not read `MAPBOX_TOKEN`.
- Cause: `missing credentials or owner decision`
- Owner: June. Partner: Nova
- Depends on: owner decides painted map versus a tile provider.
- Complexity: S to document the painted map. L to add a provider.
- Without local Docker: Yes for the painted-map documentation. A tile provider needs a credential to accept.
- Acceptance criteria:
  - The screen does not say it is a live map of listing coordinates.
  - If a provider is chosen, the token stays in env and out of git, and pins use listing coordinates.

### BL-035 Saved-item compare and price alerts

- Priority: P2
- Evidence: confirmed local compare state and non-`PriceHistory` alert copy in the audit of `SavedItems.tsx`.
- Cause: `genuine code defect`
- Owner: Nova
- Depends on: BL-025. Price history needs a real series or the copy goes away.
- Complexity: M
- Without local Docker: Yes
- Acceptance criteria:
  - Compare is removed or it compares fields the API returned.
  - No synthetic "$100 off" string remains.

### BL-036 Unlabeled icon controls

- Priority: P2
- Evidence: **suspected**. Messages a11y tests passed. A full pass over older icon-only buttons was not done in this run. Do not treat the suspicion as a failure that was reproduced.
- Cause: if reproduced, `genuine code defect`
- Owner: June
- Depends on: BL-030 if the harness is the way to confirm.
- Complexity: S once a failing control is named.
- Without local Docker: Yes for a Testing Library audit. The browser axe run is BL-030.
- Acceptance criteria:
  - Every icon-only control in `src/pages` and `src/components` has an accessible name, or a listed exception with a reason.
  - The survey names files. An unnamed suspicion does not close or open a defect by itself.

### BL-037 Search indexing decision

- Priority: P2
- Evidence: confirmed. `.figma/make/site.json` sets `robots.index: false`, and the production build emits `noindex, nofollow`.
- Cause: `missing credentials or owner decision`
- Owner: June. Partner: Orbit
- Depends on: BL-012 and BL-013. Indexing before legal text and a public host is the wrong order.
- Complexity: S
- Without local Docker: Yes
- Acceptance criteria:
  - `noindex` stays until the owner says to index.
  - The change that removes it is a separate commit after that decision.

---

## P3

### BL-038 Payments

- Priority: P3
- Evidence: confirmed absent. `depositCents` is stored. No charge call. Stripe env vars are unused.
- Cause: `missing credentials or owner decision`
- Owner: Atlas
- Depends on: an owner request to add payments. Do not start from this backlog.
- Complexity: L if requested.
- Without local Docker: Not applicable until the owner asks.
- Acceptance criteria:
  - Promote, Earned, and borrow deposits stay honest about the absence of payments.
  - No Stripe code lands without an explicit owner request.

### BL-039 AI features

- Priority: P3
- Evidence: confirmed. Create Listing "AI Review" is local copy. No model client.
- Cause: `missing credentials or owner decision`
- Owner: June
- Depends on: an owner request. v1 excludes AI.
- Complexity: S to keep the step labeled as a preview. L to build a model.
- Without local Docker: Yes to relabel. Do not build a model from this item.
- Acceptance criteria:
  - The step does not say a model reviewed the listing.
  - No AI SDK is added.

### BL-040 Social sign-in

- Priority: P3
- Evidence: confirmed. Onboarding explains Google and Apple are not connected.
- Cause: `missing credentials or owner decision`
- Owner: Forge. Partner: Nova
- Depends on: owner request and provider credentials.
- Complexity: L
- Without local Docker: The seam can be designed without Docker. Acceptance of a real provider needs credentials.
- Acceptance criteria:
  - Buttons stay honest until a provider is chosen.
  - Email registration keeps working.

---

## Not a backlog item

These passed and are not open work:

- Local frontend lint, typecheck, Vitest 250, and production build.
- Local backend lint, typecheck, Jest unit 294, production build, Prisma generate, and Prisma validate once `DATABASE_URL` was set.
- Production dependency audits in both workspaces.
- CI on `dc761e5`: frontend, backend, PostgreSQL integration, storage integration, migration drift, production dependency audit.

`prisma validate` without `DATABASE_URL` failed because the variable was unset (`environment or disk limits`). The schema validated on the retry. That is not an open defect.
