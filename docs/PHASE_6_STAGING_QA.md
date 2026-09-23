# Phase 6 — Staging QA

Completion record for branch `cursor/phase6-staging-qa-g7h8`. **This is not a production launch.** Phase 7 was not started. No public DNS, certificate, or paid host was changed. Staging remains the Compose profile on this machine.

Base before this pass: `00c5bfb` (`feat: Phase 5 local Compose staging`).

## What was exercised

Staging was already up at `https://staging.neighborly.localhost:8444/` (Caddy internal CA). Checks used that origin for the edge, and `http://127.0.0.1:3001` for calls that must not share the Docker-bridge rate-limit bucket. Seed login is `seed.<firstname>@example.com` / `neighborly-local-seed` (`backend/prisma/seed.ts`). That password is a fixture.

Node 22.23.2. Frontend Vitest: 9 files, 56 tests. Backend Jest: 31 suites, 175 tests. `pnpm audit` on 23 Sep 2026 reported zero known vulnerabilities in the frontend and the backend.

`docker compose down -v` was not used. The dev Postgres container on port 5432 was left running.

## Pass / fail

| # | Check | Result | Severity | Area |
| --- | --- | --- | --- | --- |
| 1 | Two-user request → offer → counter → accept → message → schedule → complete → review | Pass, with gaps below | — | Requests, messaging, transactions, reviews |
| 2 | Listing draft, publish, edit, favorite, saved search, archive | Pass after the saved-search fix | P1 fixed | Listings |
| 3 | Share | Disabled on purpose. The listing control now says so | P2 fixed | Listings UI |
| 4 | Search, categories, neighborhoods, map data, profile | Pass | — | Browse |
| 5 | Housing, jobs, services, community reads and owner mutations | Pass | — | Verticals |
| 6 | Report, block, moderation dismiss, suspend, restore | Pass after the restore fix | P1 fixed | Safety |
| 7 | Authn, authz, IDOR/BOLA | Pass | — | Auth |
| 8 | Desktop and mobile browser smoke | Pass after session-restore fix | P1 fixed | App shell |
| 9 | axe (WCAG 2 A/AA) | Contrast deferred. Named the unlabeled chrome controls that failed | P2 deferred / P1 fixed | A11y |
| 10 | Loading, empty, error, disabled | Pass where the API or an existing control shows them. Offline emulation cannot fail loopback | — | UI |
| 11 | Light load | Pass | — | Perf |
| 12 | `pnpm audit` | Pass | — | Dependencies |
| 13 | Staging backup and side-database restore | Pass | — | Ops |
| 14 | `scripts/staging-rollback.sh` | Pass, then the fixed images were put back | — | Ops |

P0 open: **0**. P1 open: **0**.

## Two-user flow

Marcus (`seed.marcus@example.com`) posted a furniture request. Priya offered her seeded walnut table. Marcus countered. David and Priya were forbidden from accepting. Marcus accepted. That created one conversation and one `ACCEPTED` transaction. A stranger could not read or mark the thread. Priya sent a message; Marcus read it.

Scheduling an appointment is not implemented. `POST /transactions/:id/appointments` is **404**. The schedule step that does exist is the transaction state machine: `ACCEPTED` → `SCHEDULED` → `IN_PROGRESS` → `COMPLETED`. Skipping straight to `COMPLETED` is 400. Both participants then posted a review. A review before `COMPLETED` is 400. Reviewing yourself is 400. A non-participant is 403.

Gap, deferred **P2**: a second review from the same author on the same transaction returned **201**. There is still no unique constraint. The API spec already calls that out as follow-on work. Dashboard still does not hide a prompt after a review exists.

## Listings

Against Marcus, on the rebuilt API:

- A draft is omitted from `GET /listings/:id` (404) until publish.
- Unknown fields such as `sellerId` and `status` on create are 400.
- Markup in a title is stripped (`<script>` does not remain).
- Another user gets 403 on patch, delete, and pause.
- Favorite toggles and does not appear in another user's saved searches or `GET /listings/mine`.
- Archive sets `deletedAt`. The public read is then 404.
- Pause sets `ARCHIVED` without `deletedAt`. The public list drops it. `GET /listings/:id` still returns it. That matches the current read rule (any non-deleted, non-draft row). Taking the direct URL down is what archive does. Deferred **P2** if pause is later meant to hide the URL as well.

Saved search was **P1**. `POST /listings/saved-searches` rejected `{ query, filters }` with `property filters should not exist` because `filters` had no validator and the whitelist dropped it. Explore always sends `filters`, so Save search could not succeed. `filters` is now an optional object. A staging call with `{ query: "phase6 walnut", filters: { category: "Furniture", verifiedOnly: true } }` returned 201.

Share stays disabled. Jobs and Community already said "Sharing a link isn't available in this version." The listing photo button did nothing and had no name. It now uses that same sentence. There is no share sheet and no public listing URL router.

## Browse, verticals, safety

Public list and detail payloads for listings, housing, jobs, services, community, and profiles did not include `passwordHash`, an email field, or listing coordinates. Categories returned 15 rows. Neighborhood counts included Inman Park. A search for a stamp that does not exist returned `[]`. A quote-style query stayed 200.

Housing, job, service, community post, and giveaway creates were owner-scoped. A non-owner update or delete was 403. A pending service quote omitted the street address from the provider list; the address was present after the provider accepted. A second person claiming a giveaway was 409. Job applications do not include email. The employer cannot apply to their own job.

Safety, on the staging data:

- Reporting your own listing is 409. A duplicate report is 409. Report details are sanitized.
- `GET /safety/reports` does not include another person's report.
- `GET /moderation/reports` without a staff role is 403.
- Blocking is symmetric for a new conversation and a new offer (403). Unblocking someone else's block is 404.
- Dismiss on an open report works. A second action on that closed report is 409.
- Suspend sets `SUSPENDED` and resolves the report. The old access token then gets **401** on `GET /users/me`.

Restore was **P1**. `SUSPEND_USER` closed the report, and every action on a closed report returned 409, including `RESTORE_USER`. The account could not be put back through the route that the spec describes. `RESTORE_USER` is now allowed on a `RESOLVED` report when that account is still `SUSPENDED`. Checked live: suspend 401, then restore, then `GET /users/me` 200. The temporary `MODERATOR` row on Rosa was deleted afterward. Seed users were not suspended.

Rate limits, Redis-backed:

- 429 on login for one direct `X-Forwarded-For` after the cap of 10.
- A spoofed `X-Forwarded-For` through Caddy did not create its own Redis key. Caddy replaces the header. The edge bucket was `authLogin:172.20.0.1` (the Docker bridge). Every browser on this host shares that login and register bucket. Deferred **P2** for this Compose publish: it is not the client address a public proxy would see.
- `127.0.0.1:3001` does honor a client `X-Forwarded-For` because `TRUST_PROXY=1`. That port is bound to loopback. Deferred **P2**: do not publish it.
- Report create and conversation create returned 429 over their caps.

`alg: none` and a junk bearer are 401. Login rejects an extra `role` field. `multipart/form-data` is 415. Direct `/docs` is 404. Edge `/docs` is the SPA shell, not Swagger.

## Browser, states, performance

Desktop 1440×1100, signed in as Marcus through the landing dialog: Home, Explore, Map, Housing, Services, Jobs, Community, and the walnut listing ("Message seller") rendered. No "could not be loaded" and no sign-in gate on those screens.

Mobile 390×844 after the session fix: reload with a stored token shows "Good evening, Marcus" and the Home / Explore / Messages / Profile tab bar.

Session restore was **P1**. A stored token set `isSignedIn` but left `page` on `landing`, so refresh painted the marketing page under the app header and never opened Home. A signed-in session that is still on `landing` now moves to `home`.

Loading copy exists on the vertical pages ("Loading jobs…", and the same pattern elsewhere). Empty search is the API returning `[]`; the Explore empty state is the painted "no match" panel. Disabled controls that were confirmed in the product: empty message send, Jobs "Sharing a link isn't available in this version.", and the listing share control after this pass. Chrome's offline emulation does not fail loopback, so a stuck-network error was not reproduced in the browser. Those strings are covered by the existing page tests.

Light load: 50 `GET /listings?limit=10` through Caddy, 5 waves of 10. All 200. About 470 ms wall time, p50 57 ms, p95 110 ms. This is one local client, not a capacity test.

axe-core 4.10.3, WCAG 2 A/AA, on the signed-in shell over the landing page (the session bug above):

- **Critical** `button-name` on the icon-only Messages and Saved buttons. Fixed with accessible names, including the mobile Messages button, the account menu, the listing save and share icons, and `aria-label="City"` / `aria-label="Search"` on the landing search row. Those strings are in the rebuilt bundle `index-6wK208-0.js`.
- **Serious** `color-contrast` on `#8A9AB5` at 11–12 px on white (counts, "No rating yet", "nearby"). That is the Figma secondary text. Deferred **P2**. This pass does not recolor the screens.
- Other selects (Housing, Jobs, Explore, Create, Services) were not all given names. Deferred **P2**.

## Audit, backup, rollback

`pnpm audit` at the repo root and in `backend/`: info 0, low 0, moderate 0, high 0, critical 0. `pnpm install` in `backend/` can still warn that `glob@7.2.3` and `inflight@1.0.6` are deprecated. They are not audit findings.

`scripts/staging-backup.sh` wrote a 122 KB custom-format dump. `pg_restore` into a new database `neighborly_p6_restore` on `staging-postgres` restored 14 users, 17 listings, and 15 categories, matching the live database at that moment. That database was dropped. The live `neighborly` database was not restored over. A later token-check user was added after the dump, so live user count is now 15.

`scripts/staging-rollback.sh` with no dump stopped `api`, `web`, and `caddy`, started the previous images, and left `staging-postgres`, `staging-redis`, and MinIO running. Direct `/health` was 200 and `X-Powered-By: Express` was back, which is the pre-fix image. The fixed images were tagged again and started with `--no-build`. Ready is 200 with Postgres and Redis up, and `X-Powered-By` is absent. No dump was passed to rollback, so the database was not rewritten.

## Fixes in this branch

Fix commit: `d8c464f`.

| Item | Severity | Was | Fix |
| --- | --- | --- | --- |
| Restore after suspend | P1 | `RESTORE_USER` on the report that suspended someone returned 409 | Allowed when the report is `RESOLVED` and the account is still `SUSPENDED` |
| Save search | P1 | Explore's `{ query, filters }` body was 400 | `filters` is an optional object |
| Session restore | P1 | A stored token left the marketing page up | Signed-in `landing` moves to `home` |
| `X-Powered-By` | P2 | `helmet` `xPoweredBy: false` turns the remover off | Option removed so Helmet's default applies |
| Listing share and icon names | P2 | Silent unlabeled buttons | Names, and the same "not available" share sentence Jobs already uses |

Tests: `backend/src/safety/safety.service.spec.ts`, `backend/src/listings/listings.draft-http.spec.ts`, `backend/src/common/http-security.spec.ts`, `src/pages/listing-detail.test.tsx`. The API sentence for moderation and saved search is updated in `docs/API_SPEC.md`.

## Deferred P2

- Appointment records. Schedule is only the transaction status.
- One review per author per transaction.
- Dashboard review prompts that stay after a review exists.
- Pause still readable by id until archive.
- `#8A9AB5` small-text contrast, and unlabeled selects outside the landing search and the app chrome.
- Real share links. The control explains that they are not in this version.
- Follow, promote, reserve, and commute filters. Existing copy already says they are not available.
- Suspending a user does not archive their listings. Hiding content still has no undo. One report per target still blocks a second report after dismiss.
- Auth rate limits on this Compose port publish are per Docker-bridge address, not per browser. Loopback port 3001 trusts `X-Forwarded-For`.
- No Socket.IO client on the page. Payments, Mapbox, email, and uploads stay unwired.
- Six `phase6.*@example.com` fixture users from this QA remain `ACTIVE`. Their listings were archived. They are not seed users. Re-running the seed does not delete them.

## Not claimed

Staging QA on this machine is not a release. The TLS certificate is Caddy's local CA. The seed password is a fixture. CI on the pull request does not mean the product can launch. Do not start Phase 7 from this record.
