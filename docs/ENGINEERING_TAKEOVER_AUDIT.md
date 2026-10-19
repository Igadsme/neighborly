# Engineering Takeover Audit — Phase 1

Audit date: 2026-10-19
Auditor run: read-only against `main`
Baseline: `dc761e51864e03a57c056b4bb2068c6362ced40b` (merge of PR #27)
Owner: Imani Gad
Scope: inventory, wiring, the defects flagged on older `main` (`848ebf7`), and the existing quality gates. Application code was not changed.

Prior milestone reports, `docs/FINAL_12_MILESTONE_AUDIT.md`, `docs/PRE_LAUNCH_READINESS_REPORT.md`, and `docs/FINAL_INTEGRATION_REPORT.md` were treated as hypotheses and checked against the tree at this SHA.

## How a row earns "Implemented and verified"

A feature is in that column only when the source was inspected and a test from this run or a GitHub Actions job on `dc761e5` covers the behavior. Three evidence bands are kept separate throughout:

- **Passed locally on this VM** — frozen installs, Prisma generate, lint, typecheck, unit tests, production builds, and production dependency audits.
- **Passed in CI on `dc761e5`** — [Actions run 38623514967](https://github.com/Igadsme/neighborly/actions/runs/38623514967) (push of the PR #27 merge, 2026-10-14, all six jobs green).
- **Could not run** — anything that needs Docker, a live API, or a browser. Docker is not installed on this VM (`docker: command not found`). Disk had 247G free (`df -h`, `/` 254G, 3% used), so space was not the blocker.

Journey scripts (`scripts/final-audit-journeys.mjs`, `scripts/final-audit-security.mjs`) and browser harnesses (`scripts/milestone10-auth-check.mjs`, `scripts/milestone10-browser-check.mjs`, `scripts/docker-release-e2e.mjs`) are not jobs in `.github/workflows/ci.yml`. Their earlier pass claims are from the 2026-10-13 audit of `343584a`, not from this SHA's CI and not from this run.

---

## 1. Repository inventory

### Git

| Item | State |
| --- | --- |
| Branch audited | `main` |
| HEAD | `dc761e51864e03a57c056b4bb2068c6362ced40b` |
| Tip subject | Merge pull request #27 from Igadsme/integration/final-neighborly-release |
| History length | 84 commits |
| Open pull requests | **None** (`gh pr list --state open` empty) |
| Closed pull requests | #1–#27, all **MERGED** |
| Remote feature branches | 29 still present (cursor/phase*, cursor/sprint*, milestone*, `final-audit-12-milestones`, `integration/final-neighborly-release`). None are open PRs. |

Recent history on `main`, newest first:

| SHA | Subject |
| --- | --- |
| `dc761e5` | Merge pull request #27 |
| `35face3` | docs: add the final integration report |
| `5005103` | Point the storage job at the object store that actually starts |
| `8b422e2` | Fix the two CI failures the merge surfaced |
| `d0f2559` | Integrate milestones 1–12 and the final audit onto main |
| `16f2391` | docs: add the final 12-milestone audit and pre-launch readiness report |
| `f994f29` | fix(ops): enable graceful shutdown on SIGTERM and SIGINT |
| `aa83e15` | fix(a11y): correct landing page contrast and heading order |
| `93e425d` | fix(responsive): remove horizontal overflow at 768, 1024 and 320 |
| `f2358fc` | fix(a11y): repair accessibility defects on messages and notifications |

This checkout also had 19 pre-existing modifications under `artifacts/docker-release-verification/browser-smoke/*.png`. They were left unstaged.

### Stack that is actually in the tree

- Frontend: React 19, TypeScript, Vite 8, Tailwind CSS v4. Root package name is still `figma-make-app`.
- API: NestJS 11 modular monolith, Prisma 6, global prefix `/api/v1`, Swagger at `/docs` when enabled.
- Data: PostgreSQL 16 via Compose image `postgis/postgis:16-3.4`, Redis 7, Socket.IO.
- Object storage: AWS SDK S3 client. CI and `scripts/run-storage-tests.sh` use `rustfs/rustfs:1.0.1` because `minio/minio` was withdrawn from Docker Hub.
- Delivery: Docker Compose (dev Postgres/Redis plus a `staging` profile), GitHub Actions CI, manual deploy workflows that refuse to deploy.

### Migrations

Thirteen SQL migrations, `0001_init` through `0013_neighborhood_missions`, plus `migration_lock.toml`. Drift was **not** re-run locally. CI job **Migration drift** on this SHA succeeded.

### Prisma models

`User`, `Profile`, `UserPreference`, `NotificationPreference`, `RefreshSession`, `EmailVerificationToken`, `PasswordResetToken`, `EmailOutbox`, `Category`, `Listing`, `ListingImage`, `Favorite`, `SavedSearch`, `PriceHistory`, `NeedRequest`, `RequestStatusEvent`, `RequestOffer`, `OfferItem`, `CounterOffer`, `RequestMatch`, `Conversation`, `ConversationParticipant`, `Message`, `Transaction`, `TransactionParticipant`, `TransactionMilestone`, `Appointment`, `Review`, `Notification`, `SavedSearchAlert`, `DomainEventOutbox`, `HousingListing`, `HousingImage`, `JobListing`, `JobApplication`, `JobSave`, `ServiceListing`, `ServiceQuote`, `CommunityPost`, `CommunityReaction`, `CommunityComment`, `CommunityEvent`, `CommunityEventRsvp`, `LostFoundItem`, `Giveaway`, borrow models (`BorrowRequest`, `BorrowReservation`, `BorrowAvailabilityWindow`, `BorrowHandoff`, `BorrowConditionReport`, `BorrowExtension`, `BorrowDispute`, `BorrowDisputeEvidence`, `BorrowDisputeEvent`, `BorrowStatusEvent`), passport and trust (`PassportPrivacySettings`, `VerificationRecord`, `TrustAuditEvent`, `ModerationAppeal`), missions (`NeighborhoodMission`, `MissionParticipant`, `MissionStatusEvent`, `CommunityBadge`, `MemberBadge`, `MissionModerationEvent`), and safety (`StaffRoleAssignment`, `BlockedUser`, `Report`, `ModerationAction`).

### Backend modules

Registered in `backend/src/app.module.ts`: `Config`, `Prisma`, `Events`, `Borrow`, `Missions`, `Health`, `Auth`, `Listings`, `Requests`, `Passport`, `Transactions`, `Messaging`, `Users`, `Categories`, `Housing`, `Jobs`, `Services`, `Community`, `Safety`, `Storage`, `Notifications`.

### API surface

All routes sit under `/api/v1`. UUID parameters use `ParseUUIDPipe` only where noted.

| Controller | Prefix | What it serves | `ParseUUIDPipe` on ids |
| --- | --- | --- | --- |
| Health | `/health`, `/ready` | Liveness and dependency readiness | n/a |
| Auth | `/auth` | Register, login, refresh, logout, logout-all, sessions, verify-email, resend, forgot/reset/change password | Session id only |
| Users | `/users` | `me`, onboarding, status, profile, privacy, email change, sessions, delete account, public profile and reviews | Yes |
| Categories | `/categories` | Category list | n/a |
| Listings | `/listings` | Search, CRUD, drafts, publish/pause/sold/restore, favorites, saved searches, neighborhoods, images | Saved-search id and image id only. Listing `:id` is a raw string |
| Requests | `/requests` | Discovery, drafts, lifecycle, matches, offers, accept/reject | Yes |
| Conversations | `/conversations` | Create, list, messages, send, read, unread | **No** |
| Transactions | `/transactions` | List and status transition | **No** |
| Reviews | `/reviews` | Create, edit, report, subject and mine | Yes |
| Passport | `/passport` | Public passport, privacy, verifications, appeals, staff queue | Yes |
| Notifications | `/notifications` | Inbox, unread, preferences, saved-search alerts | Yes |
| Borrow | `/borrow` | Items, availability, requests, handoff, extensions, disputes, evidence | Yes |
| Missions | `/missions` | Feed, join, attendance, badges, staff moderation | Yes |
| Housing | `/housing` | List, get, create, update, delete | **No** |
| Jobs | `/jobs` | List, get, create, update, delete, apply, save, applications | **No** |
| Services | `/services` | List, get, create, update, delete, quotes, accept | **No** |
| Community | `/community` | Summary, posts, comments, reactions, events, RSVP, lost-found, giveaways, claim | **No** |
| Safety | `/safety` | Reports and blocks | Blocked user id |
| Moderation | `/moderation` | Staff report queue and actions | Yes |
| Media | `/media/:kind/:listingId/:file` | Authenticated or public object reads | **No** |

### Frontend pages

`src/App.tsx` swaps a `page` string. There is no client router. Screens, all lazy except `Landing`:

Landing, Onboarding, HomeFeed, Explore, Categories, MapDiscovery, ListingDetail, CreateListing, Messages, SavedItems, Profile, Dashboard, Housing, Services, Jobs, Community, AccountSettings, ForgotPassword, ResetPassword, VerifyEmail, CreateListingFlow, MyListings, request feed/detail/form, Borrow marketplace/item/form/detail/lists/disputes, mission feed/detail/editor/manage/contributions/moderation, passport view/edit/settings/staff queue, notification center/preferences/saved searches.

Client methods live in `src/api/client.ts` and cover the controllers above, including refresh-on-401, logout, image upload, borrow, missions, and passport. `GET /moderation` has **no** frontend caller.

### Integrations

| Integration | Wiring |
| --- | --- |
| PostgreSQL | Prisma. Required to boot. |
| Redis | Optional in development. Production validation requires `REDIS_URL`. Rate limits and readiness use it. No Socket.IO Redis adapter. |
| Socket.IO | Gateway emits `message.created`, `notification.created`, `conversation.unread`. Client in `src/lib/realtime.ts` listens for all three. Vite proxies `/socket.io` and `/realtime`. |
| S3-compatible storage | `StorageService` when `S3_*` is complete. Listing images and private dispute evidence. |
| Email | `OutboxEmailSender` (default) or `ConsoleEmailSender`. No SES, Postmark, or Resend dependency. |
| Sentry | `SENTRY_DSN` is validated. `captureException` only writes a log line. `@sentry/node` is not installed. |
| Mapbox / Stripe | `MAPBOX_TOKEN`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` are in `env.example` and unused. |
| Google / Apple sign-in | Buttons on Onboarding explain that social sign-in is not connected. |

`docs/FRONTEND_BACKEND_MAP.md` and `docs/PROJECT_STATUS.md` are behind the code. Dashboard pause and mark-sold call the API. Community neighbor count comes from `GET /community/summary`. Explore "Save search" calls `POST /listings/saved-searches`. The map still describes several of those as local-only.

`env.example` is also behind the code. It still says refresh tokens are not issued and that no upload route is mounted. Both exist. `PUBLIC_WEB_ORIGIN` in that template is `http://localhost:5173` while Vite listens on `$PORT` or 8443, so verification links built from the template origin miss the app.

---

## 2. Quality gates

### Passed locally (this VM, 2026-10-19)

pnpm was activated at the pinned **10.34.3** (the image had 10.33.4). Node is **v22.14.0**.

| Command | Exit | Result |
| --- | --- | --- |
| `df -h` | 0 | 247G free on `/` |
| `docker version` | 127 | `docker: command not found` |
| `pnpm install --frozen-lockfile` (repo root) | 0 | 315 packages |
| `pnpm install --frozen-lockfile` (`backend/`) | 0 | 734 packages. Prisma client generated in postinstall. Ignored build scripts: `@scarf/scarf`, `esbuild` |
| `pnpm lint` (root) | 0 | clean |
| `pnpm exec tsc --noEmit` (root) | 0 | clean |
| `pnpm test` (root, Vitest) | 0 | **250 passed**, 22 files |
| `pnpm build` (root) | 0 | Vite production build, 105 modules |
| `pnpm exec prisma generate` (`backend/`) | 0 | Prisma Client 6.19.3 |
| `pnpm exec prisma validate` with no `DATABASE_URL` | **1** | P1012, env var missing. Schema was not rejected on content |
| `DATABASE_URL=postgresql://neighborly:neighborly@localhost:5432/neighborly pnpm exec prisma validate` | 0 | "The schema at prisma/schema.prisma is valid". No database connection was opened |
| `pnpm lint` (`backend/`) | 0 | clean |
| `pnpm exec tsc --noEmit` (`backend/`) | 0 | clean |
| `pnpm test` (`backend/`, Jest unit) | 0 | **294 passed**, 36 suites |
| `pnpm build` (`backend/`) | 0 | `nest build` |
| `pnpm audit --prod --audit-level=moderate` (root) | 0 | No known vulnerabilities |
| `pnpm audit` (root, all deps) | 0 | No known vulnerabilities |
| `pnpm audit --prod --audit-level=moderate` (`backend/`) | 0 | No known vulnerabilities |
| `pnpm audit` (`backend/`, all deps) | **1** | 1 high: `braces` `<=3.0.3` via `@types/jest → expect → micromatch`. Advisory says patched versions `<0.0.0` (no fix). Dev-only. Production audit stays green |

### Passed in CI on `dc761e5`

Run [38623514967](https://github.com/Igadsme/neighborly/actions/runs/38623514967), workflow **CI**, event `push`, conclusion **success**, about 2m 42s.

| Job | Conclusion |
| --- | --- |
| Dependency security audit | success |
| Frontend (lint, `tsc`, `pnpm test`, `pnpm build`) | success |
| Backend (generate, validate, lint, `tsc`, `pnpm test`, `pnpm build`) | success |
| Integration (PostgreSQL) — `prisma migrate deploy` then `jest.integration.config.cjs` | success |
| Storage integration (S3) — rustfs plus storage Jest config | success |
| Migration drift — `prisma migrate diff --exit-code` | success |

Deploy workflows did not run on this push. They are `workflow_dispatch` only. Production deploy is a stub that refuses even when enabled.

### Could not run

| Suite | Why |
| --- | --- |
| `scripts/run-integration-tests.sh` | Needs Docker to start disposable Postgres |
| `scripts/run-storage-tests.sh` | Needs Docker for Postgres and rustfs |
| `prisma migrate diff` against a shadow database | Needs Postgres |
| `scripts/final-audit-journeys.mjs` | Needs a running API and database |
| `scripts/final-audit-security.mjs` | Needs a running API and database |
| `scripts/milestone10-auth-check.mjs` and `milestone10-browser-check.mjs` | Need API, web, and a browser |
| `scripts/docker-release-e2e.mjs` | Needs Compose |
| Backup/restore rehearsal | Needs Postgres |

CI already covers the PostgreSQL integration, storage, and migration-drift jobs for this SHA. It does **not** cover the journey, security-probe, or browser harnesses.

---

## 3. Items flagged on older `main` (`848ebf7`)

| Earlier finding | Status on `dc761e5` | Evidence |
| --- | --- | --- |
| Duplicate reviews | **Fixed** | `Review` has `@@unique([transactionId, authorId])`. `ReviewsService.createReview` turns a unique violation into 409. Publication waits for the other party or `windowClosesAt`. CI integration includes `refuses a second review of the same exchange` and a concurrent-submit case in `passport.integration.spec.ts`. |
| Paused listings readable by direct link | **Still open** | `ListingsService.pause` sets `status: 'ARCHIVED'` and `deletedAt: null` (`listings.service.spec.ts` asserts that). `get()` returns any non-draft row with `deletedAt: null`, so a paused listing is still `GET /listings/:id`. Browse defaults to `PUBLISHED`, so the list hides it. `archive()` sets `deletedAt` and is hidden. |
| Suspended users' listings still visible | **Still open** | `SUSPEND_USER` updates `User.status` and does not touch listings (`safety.service.ts`). `publicWhere` and `get()` do not join seller status. A suspended member cannot authenticate, and their published listings stay on the public read. |
| One-sided `COMPLETED` and self-settled disputes | **Fixed for Borrow. Still open for marketplace transactions** | Borrow `complete()` requires `RETURNED`, which itself requires both handoff confirmations. `reviewDispute` calls `assertStaff` before `RESOLVED` or `CLOSED`. Marketplace `TransactionsService.transition` allows any participant to move `IN_PROGRESS → COMPLETED` and `DISPUTED → COMPLETED \| REFUNDED \| CANCELLED` with no counterparty or staff check (`transaction-state.ts`). |
| Missing `ParseUUIDPipe` causing 500s | **Partial** | Pipe is on requests, borrow, missions, passport, reviews, notifications, safety blocks, user profiles, and moderation. It is absent on listing `:id`, conversations, transactions, housing, jobs, services, community, and media `listingId`. Invalid ids reach Prisma and the logging filter records status 500 for non-`HttpException` errors. |
| False "verified" claims and badges | **Partial** | Landing count is the API total, not a hardcoded "3,200+". `listingFromApi` forces `verified: false` and `idVerified: false`. Housing and job create DTOs do not accept `verified` (column defaults false). Still false: `Services.tsx` passes `verified` on every provider avatar. HomeFeed "Neighbors to follow" still renders verified avatars and star ratings; the section is labeled "Preview · Examples. Not live ratings." Service `rating`, `reviewCount`, and `backgroundCheck` are stored columns with no writer in the create path, and the UI will display them if a row has them (seed or a direct write). |
| Email verification and password recovery do not send mail | **Still open. Code path exists** | Register, verify, resend, forgot, and reset persist tokens and call `EmailSender`. Production refuses `EMAIL_SENDER=console`. The default adapter inserts `EmailOutbox`. No provider drains it. `docs/EMAIL_DELIVERY.md` matches the code. |
| No upload route or file-signature checks | **Fixed** | `POST /listings/:id/images` and `POST /borrow/disputes/:disputeId/evidence` accept multipart. `detectImageType` checks JPEG, PNG, WebP, and GIF bytes and rejects a declared type that disagrees. CI storage job passed. Local `uploads.spec.ts` passed. `env.example` still says no upload route is mounted. |
| No URL routing, deep links, or 404 | **Partial** | `/?verify=` and `/?reset=` open verify and reset, then `replaceState` strips the token. Every other screen is `useState` in `App.tsx`. Refresh returns to landing or home. There is no 404 route. Share buttons say sharing a link is not available in this version. |
| Frontend not subscribed to Socket.IO `message.created` | **Fixed** | `src/lib/realtime.ts` registers `message.created` and forwards `onMessage`. `Messages.tsx` subscribes and refetches. Local `realtime.test.ts` passed. Gateway emits the event (`messaging.gateway.ts`). Multi-instance fan-out is still missing (`@socket.io/redis-adapter` is not a dependency). |
| PostGIS not actually used | **Still true** | Compose uses `postgis/postgis:16-3.4`. Migrations enable `pg_trgm` and `btree_gist` only. No `geography` column and no `ST_*` call. Radius search is a bounding box in `ListingsService.radiusWhere` plus an in-process distance. |
| No appointment creation | **Still true** | `Appointment` exists and is included on `GET /transactions`. No service creates a row. Dashboard renders `tx.appointments` when present. |
| Missing rate limits on several write routes, and no `Retry-After` | **Partial** | Policies exist for auth, messaging, listings, listing images, offers, requests, reviews, missions, and reports. Housing, jobs, services, community, transaction transitions, and account profile/email writes do not call `enforceRateLimit`. The 429 is `throw new HttpException('Too many requests', 429)` with no `Retry-After` header (`rate-limit.ts`). Local `rate-limit.spec.ts` passed and does not assert the header. |
| 15-minute access token with no refresh or logout | **Fixed** | Access TTL still defaults to `15m` (`access-token.ts`). `POST /auth/refresh` rotates an httpOnly cookie. `POST /auth/logout` and `POST /auth/logout-all` exist. The client refreshes once on 401 and `signOut` calls `/auth/logout`. Local `auth.jwt.spec.ts` and `session-renewal.test.ts` passed. CI auth HTTP integration covers cookie rotation. `env.example` still says refresh tokens are not issued. |
| Root package named `figma-make-app`, Figma Make boilerplate, "Figma Make App" title | **Partial** | `package.json` name is still `figma-make-app`. `index.html` still has `figma:lang`, `figma:title`, and `figma:head` markers. The production build title is "Neighborly — Your local community marketplace" because Vite fills it from `.figma/make/site.json`. `robots` stays `noindex, nofollow`. |
| Localhost API fallback | **Still present** | `src/api/client.ts` uses `import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1"`. A production build without the variable calls localhost. |
| Dev Postgres/Redis ports bound to `0.0.0.0` | **Still true for the default Compose services** | `postgres` publishes `5432:5432` and `redis` publishes `6379:6379` (all interfaces). The `staging` profile binds `127.0.0.1` for Postgres, Redis, MinIO, API, and Caddy. |
| Committed artifacts clutter | **Smaller than the prior audit claimed, still present** | `git ls-files artifacts` is 49 paths, 19 PNGs, about 7.2 MB. The "211 PNGs / 33 MB" line in the 12-milestone audit does not match this tree. `.gitignore` already drops later milestone screenshot passes. These 19 browser-smoke PNGs stay tracked. |
| Dead buttons and accessibility gaps | **Partial** | Many former dead controls now set an explicit "isn't available yet" note (promote, reserve, share, follow, save home, save service, commute, social sign-in). They still do not perform the action. Compare on Saved Items is local. Create Listing "AI Review" is painted copy. Local `messages-accessibility.test.tsx` passed. The axe browser harness was not re-run here. WCAG conformance is not claimed. |

---

## 4. Feature matrix

Each feature is in exactly one column.

### Implemented and verified

Evidence is source plus a local unit test, a CI job on `dc761e5`, or both. Browser confirmation of these flows was not repeated in this run.

| Feature | Evidence |
| --- | --- |
| Registration, login, argon2id passwords, CSRF double-submit, refresh rotation, logout | `auth.controller.ts`, `auth.service.ts`, `session-cookie.ts`. Local `auth.jwt.spec.ts`, `auth.guard.spec.ts`, `session-renewal.test.ts`. CI Integration job includes `auth.http.integration.spec.ts`. |
| Account settings, email-change tokens, session revoke, anonymizing deletion | `users.controller.ts`, `AccountSettings.tsx`. CI Integration covers `account.integration.spec.ts`. Local account-flow UI tests passed. |
| Suspension blocks REST and Socket.IO for that account | `auth.guard.ts`, gateway connect check. Local guard and gateway specs. CI `suspension.integration.spec.ts`. |
| Marketplace create, draft, publish, edit, favorite, search, saved search | `listings.service.ts`, `src/api/client.ts`. Local listings unit and HTTP specs, frontend marketplace tests. CI `listings.integration.spec.ts`. |
| Listing and dispute image upload with byte signatures | `storage.service.ts` `detectImageType`, listing and borrow upload routes. Local `uploads.spec.ts`. CI Storage integration job. |
| Need requests, offers, counter, single-winner accept, matching | `requests.service.ts`, `request-lifecycle.service.ts`, `match-engine.ts`. Local `match-engine.spec.ts` and request specs. CI `requests.accept.integration.spec.ts`, `requests-lifecycle.integration.spec.ts`, `requests.privacy.integration.spec.ts`. |
| Conversations, messages, unread counts | `messaging.service.ts`, `Messages.tsx`, nav badge. Local messaging specs and `messages.test.tsx`. CI realtime integration spec. |
| Client subscription to `message.created` | `realtime.ts`, `Messages.tsx`. Local `realtime.test.ts`. Gateway unit specs. End-to-end browser socket was not re-run. |
| Notifications, preferences, saved-search alert worker | `notifications.module.ts` polls `SAVED_SEARCH_POLL_MS` (default 60s) and borrow overdue. Local `notification-worker.spec.ts`. CI `notifications.integration.spec.ts`. |
| Borrow lifecycle, overlap exclusion, two-sided handoff | `borrow-state.ts`, `borrow.service.ts`. Local `borrow-state.spec.ts` and borrow UI tests. CI `borrow.integration.spec.ts`. |
| Borrow disputes: participants file and upload evidence; only staff resolve | `reviewDispute` staff gate. CI borrow integration. Local borrow UI tests. |
| Reviews: one per author per exchange, held until the other side reviews or the window closes | Schema unique index, `reviews.service.ts`. CI passport integration (duplicate and concurrent cases). |
| Passport read model, privacy defaults, staff verification and appeal queue | `passport.service.ts`, `PassportView.tsx`, `StaffQueue.tsx`. CI `passport.integration.spec.ts` and `community-passport.integration.spec.ts`. Local passport flow tests. |
| Neighborhood missions, capacity, badges, mission moderation UI | `missions.service.ts`, mission pages. CI `missions.integration.spec.ts`. Local `mission-flows.test.tsx`. |
| Member reports and blocks from listing, profile, and message screens | `safety.controller.ts`, `ListingDetail.tsx`, `Profile.tsx`, `Messages.tsx`. Local `safety.http.spec.ts` and `safety.service.spec.ts`. |
| Health, readiness, helmet, graceful `SIGTERM`/`SIGINT` | `main.ts`, `health.controller.ts`. Local `readiness.spec.ts` and `http-security.spec.ts`. CI startup integration is inside the PostgreSQL job. |
| Production dependency audit gate | Local `--prod` audits clean. CI Dependency security audit job succeeded. |

### Implemented but broken

The behavior ships and is reachable. It does the wrong thing relative to the product rule the earlier review named.

| Feature | What is wrong |
| --- | --- |
| Pause a marketplace listing | Pause stores `ARCHIVED` with `deletedAt: null`. `GET /listings/:id` returns that row. Anyone with the id can still open it. |
| Hide a suspended member's listings | Suspension flips `User.status` and revokes sessions. Public listing reads do not look at seller status, so published rows stay up. |
| Marketplace transaction completion and dispute settlement | Any participant may set `COMPLETED` from `IN_PROGRESS`, and may move `DISPUTED` to `COMPLETED`, `REFUNDED`, or `CANCELLED`, alone. Borrow does not have this hole. |
| Service provider trust badge | `Services.tsx` sets `verified` on the avatar for every provider the API returns. The flag is not an email or identity check. |

### Partially implemented

| Feature | What exists | What is missing |
| --- | --- | --- |
| Housing, jobs, services, community | CRUD and the matching screens call `/api/v1`. Local mock HTTP specs passed. | No PostgreSQL integration suite for these four modules. No rate limits. No `ParseUUIDPipe` (invalid ids can 500). Housing save, commute, and service save are explicit stubs. Job and housing `verified` is a column the UI will render, with no staff workflow that sets it. |
| Shareable URLs, deep links, 404 | Verify and reset query parameters work once. | In-app navigation does not change the path. Refresh drops the screen. No 404. Share controls decline. |
| Geographic discovery | Latitude/longitude columns, bounding-box filter, painted map pins (`src/lib/map-pins.ts`). | PostGIS is unused. Mapbox is unused. Pins use neighborhood centroids, not listing coordinates. Safe-spot pins are painted. |
| Appointments | Model, relation, included on transaction list, rendered on Dashboard when present. | No create or update endpoint, so a member cannot schedule one. |
| Rate limiting | Auth, listings, images, requests, offers, messaging, reviews, missions, reports. Redis with in-memory fallback. | Housing, jobs, services, community, transaction transitions, and profile/email writes are unlimited. 429 responses omit `Retry-After`. |
| Invalid identifier handling | `ParseUUIDPipe` on the newer modules listed above. | Listing, conversation, transaction, housing, job, service, community, and media ids skip it. |
| Honest trust presentation | Marketplace cards no longer invent verification. Landing count comes from the API. Preview neighbors are labeled examples. | Service avatars stay universally verified. Preview cards still wear a verified badge. Ratings on listing cards are hardcoded `0` in `listingFromApi`, so a real passport rating does not show there. |
| Staff report moderation | `GET/POST /moderation` with hide, suspend, restore. Local safety specs. | No screen calls it. Staff UI covers passport verifications, review hiding, appeals, and mission moderation only. |
| Saved items | Favorites and saved searches are API-backed. | Compare bar is local. Price-alert copy is not `PriceHistory`. |
| Listing photos during first publish | `ImageManager` uploads once a listing id exists (`MyListings`). | `CreateListingFlow` mounts `ImageManager` with `listingId={null}`. The older `CreateListing` wizard still shows an AI Review step that does not call a model. |
| Email verification and password recovery *as an in-app token exchange* | Tokens, hashed storage, verify and reset screens, outbox row. CI account tests complete the flow by reading the outbox. | Delivery to a mailbox is the blocked row below. `PUBLIC_WEB_ORIGIN` in the template points at port 5173. |
| Accessibility of primary screens | Skip link, some button names, local messages a11y tests, prior axe claim on `343584a`. | Browser axe and screen readers were not run on this SHA. Several controls are still unlabeled icon buttons in older screens. Conformance is not claimed. |
| Figma Make shell removal | Built document title is Neighborly. | Package name, `index.html` markers, and `.figma/make/site.json` `noindex` remain. |
| Production operations prep | Env validation, cookie secure flag, health, manual deploy stubs, backup scripts under `scripts/`. | Backup and restore were not executed here and are not CI jobs. No down migrations. Deploy workflows do not deploy. |
| Error monitoring hook | `SENTRY_DSN` is a validated env var. Exceptions are logged. | No SDK. Setting the DSN does not send an event. |
| Legal pages | Placeholder files in `docs/legal/`. | Footer and onboarding links are `href="#"` and do not open those files. Copy is explicitly not a contract. |
| Dev/staging Compose | Default Compose starts Postgres and Redis. Staging profile adds API, web, Caddy, MinIO. | Default database ports listen on every interface. Staging MinIO image is `quay.io/minio/minio`, which CI comments say is not anonymously pullable; storage tests moved to rustfs. Staging and CI storage images disagree. |

### Missing

| Feature | Notes |
| --- | --- |
| In-app payments, deposits, payouts | `depositCents` is stored and never charged. Dashboard "Earned" is an em dash. Promote explains that payments are not connected. Intentional product boundary. |
| AI review, scam detection, semantic search | Painted copy on Create Listing and the landing page. No model client. Intentional boundary. |
| Google and Apple sign-in | Buttons tell the member to use email. |
| Appointment scheduling API | See partial row. Creation is absent, not merely unwired in the UI. |
| Socket.IO Redis adapter | Realtime is correct on one API process. A second replica does not see the other's sockets. |
| Down migrations | Rollback is restore-from-backup only. |
| General staff moderation screen | API exists. UI does not. |
| Map provider | No Mapbox (or other) map. The discovery page is a positioned overlay. |

### Blocked by external credentials or infrastructure

| Feature | Blocker |
| --- | --- |
| Verification and password-reset email that reaches a person | No provider is a dependency. Outbox is the integration point. Needs an owner choice (SES, Postmark, Resend, or similar) and credentials. Production already rejects `console`. |
| Production hosting, DNS, and TLS for a public hostname | Deploy workflows are stubs. No production target. Needs an owner hosting decision. This audit did not deploy. |
| Lawyer-reviewed Terms, Privacy, and Cookie policy | Placeholders only. Owner and counsel decision. Do not link the placeholders as consent. |
| External uptime, APM, or error tracking | No vendor is connected. `SENTRY_DSN` alone does nothing until a SDK and a project exist. |
| Real map tiles | `MAPBOX_TOKEN` is an empty template slot. The current map does not read it. Turning it on is a product decision, not a missing key in an otherwise live client. |

---

## 5. Release blockers

These block a real-user launch even on a single API replica. Multi-instance items follow.

1. **Email does not leave the database.** A new member can register, and cannot verify or reset a password unless someone reads `EmailOutbox`. `PUBLIC_WEB_ORIGIN` in `env.example` is the wrong port, so the first provider wiring will emit bad links if that value is copied.
2. **Paused listings and suspended sellers stay publicly readable** by id (paused) or by browse (suspended sellers' published rows).
3. **Either party can complete a marketplace exchange or close its dispute alone.** Reviews then become eligible, because review eligibility keys off `Transaction.status === COMPLETED`.
4. **Service screens mark every provider verified.**
5. **No shareable URL and no 404.** Support, notifications, and "share" cannot point at a listing, request, or conversation. Notification `link` values are internal page names.
6. **Invalid UUIDs on older write and read routes can 500** instead of 400.
7. **Several write routes have no rate limit, and limited routes omit `Retry-After`.**
8. **A frontend build without `VITE_API_URL` calls `http://localhost:3000/api/v1`.**
9. **Legal consent copy is a placeholder** and the visible links go nowhere.
10. **No production host, monitoring, or email vendor** is configured. Launch needs owner decisions before those rows can move.

Single-replica launch can proceed without the Redis adapter. Two API replicas cannot, because Socket.IO rooms are process-local.

Dev Compose publishing Postgres and Redis on `0.0.0.0` is a workstation risk, not a production config. Staging binds loopback. Do not copy the dev port lines into a shared network.

---

## 6. Fix plan by workstream

Ordered so release blockers come first inside each workstream. Items that need Imani Gad (or counsel) are marked **Owner decision**.

### Backend

1. **Paused listing visibility.** `GET /listings/:id` should return 404 for `ARCHIVED` rows with a null `deletedAt` (the pause shape), and keep owner `GET /listings/:id/manage` working. Add a regression that pause then public get is 404, and that archive stays 404.
2. **Suspended seller visibility.** Public listing, housing, job, service, community, and request reads should exclude rows whose owner is not `ACTIVE`. Suspending should be tested against `GET /listings/:id` and the public list.
3. **Marketplace settlement.** Require both participants, or a staff actor, before `COMPLETED`. Require staff before leaving `DISPUTED`. Mirror the borrow rules already in `reviewDispute`. Add a test that the counterparty's objection cannot be overwritten by the other side.
4. **`ParseUUIDPipe` on every UUID param** still using a raw `@Param('id')`: listings, conversations, transactions, housing, jobs, services, community, media. Assert 400 for `not-a-uuid`.
5. **Rate limits and `Retry-After`.** Cover housing, jobs, services, community, transaction transition, and account email/profile writes. Put `Retry-After` (and a machine-readable body) on the 429 from `enforceRateLimit`.
6. **Appointment creation** only if the product still wants meetups. Smallest change is `POST /transactions/:id/appointments` limited to participants, after settlement rules exist. Otherwise remove the empty Dashboard meetup UI so it does not imply a scheduler. **Owner decision** on whether v1 schedules meetups.
7. **PostGIS.** Either query with `ST_DWithin` on a real geography column, or stop shipping the PostGIS image and document the bounding-box behavior. **Owner decision** only if the launch promise is "true radius search." The code change itself is internal.
8. **Staff moderation.** Keep the API. A minimal queue screen is frontend work fed by `GET /moderation/reports`.

### Frontend

1. **Stop the unconditional verified avatar** on `Services.tsx`. Show a badge only for a signal the API actually computed (email verified is not currently on the public service payload; do not invent one).
2. **HomeFeed preview people.** Remove the verified badge and star row, or remove the section, before any public launch. The label already says they are examples. **Owner decision** if the section should stay as a clearly fake preview.
3. **`VITE_API_URL`.** Fail the production build when the variable is unset, instead of falling back to localhost.
4. **URL routing.** Introduce real paths for listing, request, conversation, borrow, mission, and profile, plus a 404. Keep `/?verify=` and `/?reset=`. This is the largest frontend change and should land before notification links are treated as shareable.
5. **Package identity.** Rename `figma-make-app` when the owner wants the npm name changed. Remove Figma markers from `index.html` once Vite no longer depends on them for the title. **Owner decision** on dropping the Figma Make site config, because `robots.index: false` is the current pre-launch posture.
6. **Dead controls.** Leave the honest "isn't available yet" copy until the endpoint exists. Do not wire Promote, payments, or AI review under those labels.
7. **Create-listing photos.** Point the first-publish wizard at `ImageManager` after the listing id exists, or keep photos on My Listings and say so on the wizard.

### Full-stack integration (media and email)

1. **Email provider. Owner decision and credentials.** Implement `EmailSender` or a worker that drains `EmailOutbox`. Set `PUBLIC_WEB_ORIGIN` to the real web origin (the template's port 5173 does not match Vite). Keep production's refusal of `console`.
2. **Media.** Upload and signatures are in place and CI-verified. Align the staging Compose object store with rustfs, or document why staging still references MinIO on quay.io. Confirm `CreateListingFlow` can attach bytes after publish.
3. **Trust fields on services.** `rating`, `reviewCount`, and `backgroundCheck` should be derived (passport or a staff check) or omitted from the public serializer so a stale seed cannot paint a background-check badge.

### QA and end-to-end

1. Re-run, on a machine with Docker, `scripts/run-integration-tests.sh`, `scripts/run-storage-tests.sh`, and `prisma migrate diff --exit-code`. CI is green for this SHA; a local rerun is the takeover baseline.
2. Re-run `final-audit-journeys.mjs` and `final-audit-security.mjs` against this SHA. They are not in CI, so the 42/42 and 28/28 figures are from `343584a`.
3. Re-run `milestone10-auth-check.mjs` (axe). Do not claim WCAG from that run alone.
4. Add regression tests for the four still-open product bugs: paused get, suspended seller listing, one-sided transaction complete, service verified badge.
5. Add vertical modules to the PostgreSQL integration job, or accept that housing, jobs, services, and community are verified only by mocked HTTP specs.

### Security

1. Settlement, suspension visibility, UUID 400s, and rate-limit gaps above are the product security work.
2. Bind dev Compose Postgres and Redis to `127.0.0.1`, matching the staging profile.
3. Keep the production `pnpm audit --prod` gate. Leave the unfixed `braces` dev advisory visible in the full audit. Do not pretend a suppress is a patch.
4. Access tokens in `localStorage` plus an httpOnly refresh cookie is the current design. A follow-up can move the access token out of script-readable storage. That is hardening, not a launch blocker by itself, because XSS would already own the session.
5. Do not commit secrets. Templates are placeholders. This audit found no live keys in the tree.

### DevOps

1. **Hosting, DNS, and a real deploy target. Owner decision.** Leave `deploy-production.yml` refusing until that exists. Do not dispatch it.
2. **Monitoring. Owner decision** on vendor. Then implement the hook `captureException` already documents.
3. **Object storage in staging.** Point the staging profile at the same rustfs image CI uses, or record a pullable MinIO mirror. The current quay.io pin is called out in CI comments as not anonymously pullable.
4. **Artifacts.** Delete or gitignore `artifacts/docker-release-verification/browser-smoke/*.png` in a dedicated commit. **Owner decision** only because an earlier audit left removal to the owner. The set is 19 files, about 7 MB, not 211 files.
5. **Docs drift, same change as the code fixes:** `env.example` (refresh tokens, uploads, `PUBLIC_WEB_ORIGIN`), `docs/FRONTEND_BACKEND_MAP.md`, `docs/PROJECT_STATUS.md` (still headed "Milestone 7"), and `docs/legal/TERMS_OF_SERVICE_PLACEHOLDER.md` (says v1 does not upload images).
6. Backup scripts stay the rollback path until down migrations exist. Rehearse them once Docker is available. They were not run here.

---

## 7. What this audit did not do

No application source was modified. Nothing was merged, deployed, or purchased. No email, map, or error-tracking credential was requested or stored. Docker-backed suites and browser journeys were not executed on this VM. CI results above are the remote record for `dc761e5`, reported separately from the local commands.
