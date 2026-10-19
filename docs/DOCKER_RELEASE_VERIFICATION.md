# Docker release verification

Live Docker and database gate for Neighborly on the Mac at `/Volumes/T7 Shield/Projects/neighborly`.

This document is a verification record. It is not a release. **Release readiness: NOT claimed until a fully green run is reviewed.**

Checked boxes in this file mean a command was run on this machine and the recorded result matched the row. An open box means that row did not pass, was not run, or stopped because an earlier required row failed.

## 1. Purpose

Confirm the API can boot against the Compose PostGIS database, apply migrations, load the local seed, answer `/health` and `/ready`, pass the Node 22 unit and build smoke, and complete the two-user commerce loop (publish, offer, accept, message, complete, review) through the real HTTP API.

A green table in the Results section is still not a release. Landing fixtures, painted chrome, vertical leftovers, and trust/safety stay out of scope (section 11).

## 2. Preconditions

- Git tip used for this gate: `df5aae1b0ceac63d7c449ee377eeae98743830a8` (`df5aae1`, Wire Categories featured strip, PR #16). Do not merge feature PRs or advance `main` for features during this gate.
- Working tree was clean on `main` before the docs branch `cursor/docker-release-verification-59a4`.
- Node 22 from `.mise.toml` (this machine: Node `v22.23.2`, pnpm `10.34.3`).
- Docker Desktop running (`docker info` succeeds).
- Canonical path only: `/Volumes/T7 Shield/Projects/neighborly`. Do not use `~/Desktop/Neighborly` or Official-Portfolio.
- No feature-slice work during this gate. Docs and the verification script only.

## 3. Environment

Copy `env.example` to `backend/.env` and to `.env` at the repo root when those files are missing. Both are gitignored (`.env*` in `.gitignore`). Do not commit them.

Required values:

| Key | Value for this gate |
| --- | --- |
| `DATABASE_URL` | `postgresql://neighborly:neighborly@localhost:5432/neighborly` (matches `docker-compose.yml`) |
| `JWT_SECRET` | local-only string, at least 32 characters (`backend/src/common/config/env.validation.ts`) |
| `CORS_ORIGIN` | `http://localhost:8443` (Vite default in this repo) |
| `VITE_API_URL` | `http://localhost:3000/api/v1` |

`env.example` already shows those keys. The placeholder `JWT_SECRET` in the example is long enough to boot; a local file may replace it with another 32+ character local secret. Never paste that secret into this doc, a log, or a commit.

- [x] `backend/.env` and root `.env` exist, match the table, and are not tracked by git

## 4. Compose

From the repo root, `docker-compose.yml` starts:

- `postgis/postgis:16-3.4` as Postgres (`neighborly` / `neighborly` / database `neighborly`) on host port `5432`, with a `pg_isready` healthcheck
- `redis:7-alpine` on host port `6379`

```bash
docker compose up -d
docker compose ps
docker compose exec postgres pg_isready -U neighborly -d neighborly
docker compose exec redis redis-cli ping
```

Stopped containers that still publish `5432` (for example an old DevDash Postgres) can block the bind. Prefer stopping or removing the conflicting **stopped** container without `-v`, so unrelated volumes stay. Do not delete volumes that are still needed.

- [x] `docker compose up -d` exits 0
- [x] Postgres container is healthy
- [x] `pg_isready` accepts connections
- [x] Redis `PING` returns `PONG`

## 5. Migrations

Prefer the non-interactive deploy. Do not use interactive `pnpm prisma:migrate` (`prisma migrate dev`) unless deploy cannot apply the existing folders.

```bash
cd backend
pnpm exec prisma generate
pnpm prisma:deploy
```

Migration folders in this tree:

- `backend/prisma/migrations/0001_init`
- `backend/prisma/migrations/0002_onboarding`
- `backend/prisma/migrations/0003_verticals`

- [x] `pnpm prisma:deploy` exits 0 and lists the migrations applied

## 6. Seed

```bash
cd backend
pnpm prisma:seed
```

`backend/prisma/seed.ts` upserts categories, nine local users, and housing, jobs, services, and community rows. Phase 1 also upserts ten published marketplace `Listing` rows (section 12). Local fixture password only, shared by every seed user: `neighborly-local-seed`. Emails are `seed.<firstname>@example.com` (for example `seed.marcus@example.com`, `seed.priya@example.com`). This password is a local fixture, not a production credential.

- [x] `pnpm prisma:seed` exits 0

## 7. Health

`backend/src/main.ts` sets the global prefix `api/v1`. `HealthController` is mounted at the prefix root, so the live paths are:

- `GET /api/v1/health` — liveness, no database call. Body shape: `{ status, service, timestamp }`.
- `GET /api/v1/ready` — runs `SELECT 1`. Body shape on success: `{ status: "ready", dependencies: { postgres: "up" } }`. Database failure throws HTTP 503 `{ status: "not_ready", dependencies: { postgres: "down" } }`.

Redis is not part of `/ready` (still an open item in `docs/RELEASE_CHECKLIST.md` section C).

```bash
curl -sS -D - http://localhost:3000/api/v1/health
curl -sS -D - http://localhost:3000/api/v1/ready
```

Start the API from `backend/` with the existing scripts after migrate and seed (`pnpm start:dev`, or `pnpm build` then `pnpm start`). The API reads `backend/.env`.

- [x] `GET /api/v1/health` returns HTTP 200 and `status: ok`
- [x] `GET /api/v1/ready` returns HTTP 200 and `postgres: up`

## 8. Unit and build smoke (Node 22)

Same commands as `.github/workflows/ci.yml`. Backend `tsc` needs `pnpm exec prisma generate` first.

Frontend, repo root:

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

Backend, `backend/`:

```bash
pnpm exec prisma generate
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

- [x] Frontend `tsc --noEmit` exits 0
- [x] Frontend Vitest passes (record test counts)
- [x] Frontend `vite build` exits 0
- [x] Backend `tsc --noEmit` exits 0
- [x] Backend Jest passes (record test counts)
- [x] Backend `nest build` exits 0

## 9. Two-user API loop (required)

No Playwright suite is in this repo (`docs/SECURITY_FINDINGS.md` notes `test:e2e` was removed). The required pass is scripted HTTP against the live API: `node scripts/docker-release-e2e.mjs`. A browser pass is not required for this gate.

The script uses seed users when login works (`seed.marcus@example.com` as requester, `seed.priya@example.com` as offerer, password `neighborly-local-seed`). If seed login fails, it registers fresh `docker-gate-*@example.com` accounts with the same local fixture password.

Transaction status cannot jump from `ACCEPTED` to `COMPLETED`. `backend/src/transactions/transaction-state.ts` allows `ACCEPTED → SCHEDULED → IN_PROGRESS → COMPLETED`. The script expects HTTP 400 on a direct `COMPLETED` patch, then walks those three legal patches. That direct call is a negative check, not a product bug.

| Step | Endpoint | Who |
| --- | --- | --- |
| Health | `GET /api/v1/health` | anonymous |
| Ready | `GET /api/v1/ready` | anonymous |
| Login or register | `POST /api/v1/auth/login` or `POST /api/v1/auth/register` | A requester, B offerer |
| Categories | `GET /api/v1/categories` | anonymous |
| Publish need | `POST /api/v1/requests` | A |
| Offer | `POST /api/v1/requests/:id/offers` | B |
| Accept | `POST /api/v1/requests/:id/offers/:offerId/accept` | A (creates conversation + `ACCEPTED` transaction) |
| Messages | `POST /api/v1/conversations/:id/messages` | A, then B |
| Illegal hop | `PATCH /api/v1/transactions/:id/status` `{ "status": "COMPLETED" }` | A, expect 400 |
| Legal hops | same patch with `SCHEDULED`, then `IN_PROGRESS`, then `COMPLETED` | A |
| Review | `POST /api/v1/reviews` | A, subject is B |

The script writes `artifacts/docker-release-verification/e2e-report.json` and redacts token, password, and secret fields. It exits 1 at the first unexpected status and does not continue the loop.

- [x] Seed or fresh login for user A and user B
- [x] A publishes a request (`POST /api/v1/requests`)
- [x] B creates an offer
- [x] A accepts the offer (conversation id + transaction status `ACCEPTED`)
- [x] A and B each send one message
- [x] Transaction reaches `COMPLETED` through the real status API
- [x] A submits `POST /api/v1/reviews` and receives a review id

Browser signed-in pass: not part of the required loop.

- [ ] Browser smoke. Run on 2026-09-23 15:31 EDT. Not a full pass: Listing Detail, Save, and Message seller were not reached because the featured strip was empty. See the browser table in section 10. Phase 1 closed that seed gap and re-ran the smoke (section 12). This historical row stays open.

## 10. Results

Live run on this Mac. Checked rows above match this table. The browser row stays open.

| Field | Value |
| --- | --- |
| Timestamp (America/New_York) | Confirmation run 2026-09-23 15:10:01 EDT start; API loop finished 15:10:18 EDT (`2026-09-23T19:10:18.418Z`). Earlier pass the same day finished 15:06:28 EDT |
| SHA | `df5aae1b0ceac63d7c449ee377eeae98743830a8` (`df5aae1`) |
| Docker Desktop | 4.92.0 |
| Docker Engine | client and server 29.8.0 |
| Docker Compose | v5.5.1 |
| Host | arm64 |
| Node / pnpm | v22.23.2 / 10.34.3 |
| Postgres healthy | Pass. `neighborly-postgres-1` healthy. `pg_isready` exit 0, `accepting connections` |
| Redis ping | Pass. `PONG`, exit 0. Compose does not define a Redis healthcheck, so `docker compose ps` shows no health state for Redis |
| Migrations | Pass. First run applied `0001_init`, `0002_onboarding`, `0003_verticals`. Confirmation run exit 0: `No pending migrations to apply.` |
| Seed | Pass on both runs. `pnpm prisma:seed` exit 0 |
| Health / ready | Pass on both runs. HTTP 200. Latest bodies below |
| Unit and build smoke | Pass on the 15:04 EDT run. Frontend tsc 0, Vitest 51/51, vite build 0. Backend tsc 0, Jest 124/124, nest build 0. Not repeated at 15:10 |
| Two-user API loop | Pass on both runs. Confirmation `e2e_exit:0` |
| Browser pass | Partial. See the browser table below. Not a full pass |
| Blockers | None on the required rows. Warnings are listed under Command log and do not flip those rows to fail |

**Release readiness: NOT claimed until a fully green run is reviewed.**

### Environment

`backend/.env` and the repo-root `.env` were already present, matched `env.example`, and were left in place. Both are gitignored. `DATABASE_URL` matched `postgresql://neighborly:neighborly@localhost:5432/neighborly`. `JWT_SECRET` length was 58 (at least 32). `CORS_ORIGIN` was `http://localhost:8443`. `VITE_API_URL` was `http://localhost:3000/api/v1`. The secret value is not recorded here.

### Compose

`docker compose up -d` exit 0. New volumes `neighborly_neighborly-postgres` and `neighborly_neighborly-redis`. Port 5432 was free, so stopped containers were left alone, including `devdash-postgres-1` (exited, published `5432`) and the other exited DevDash, insta-clone, and Azure SQL Edge containers. Their volumes were not removed.

Docker printed: the PostGIS image platform is `linux/amd64` and the host is `linux/arm64/v8`, with no platform pin in `docker-compose.yml`. The container still reached `healthy` and `pg_isready` succeeded. That warning is not a failed row.

### Port alignment

The 15:06 and 15:10 EDT API loops used port 3001 because port 3000 was already taken. Local `PORT` and `VITE_API_URL` were left at 3000, which is what `env.example` specifies.

Listeners on TCP 3000 before they were stopped, both from `/Users/gadimani/copilot-worktrees/gad-os/igadsme-supreme-fishstick` (a portfolio Next.js app, not Neighborly):

| PID | Command | Role |
| --- | --- | --- |
| 70994 | `pnpm exec next dev --hostname 0.0.0.0` | parent of the dev server |
| 71023 | `next dev --hostname 0.0.0.0` | child |
| 88956 | `next-server (v16.3.3)` | listened on `*:3000` |
| 81375 | `pnpm start --hostname 127.0.0.1` | parent of the production server |
| 81419 | `next-server (v16.3.3)` | listened on `127.0.0.1:3000` |

Those two process trees were stopped with SIGTERM. Docker, Cursor, and other system processes were not touched. After that, nothing listened on 3000.

Neighborly was then started with `cd backend && pnpm start`, which reads `PORT=3000` from `backend/.env`. Vite was started with `PORT=8443 pnpm dev` so the root `.env` value `PORT=3000` did not take the API port. `VITE_API_URL` stayed `http://localhost:3000/api/v1`. `CORS_ORIGIN` stayed `http://localhost:8443`. Neither `.env` file was committed.

`GET http://127.0.0.1:3000/api/v1/health` HTTP 200:

```json
{"status":"ok","service":"neighborly-api","timestamp":"2026-09-23T19:25:18.240Z"}
```

`GET http://127.0.0.1:3000/api/v1/ready` HTTP 200:

```json
{"status":"ready","dependencies":{"postgres":"up"}}
```

Final ports for this smoke: API `http://localhost:3000`, Vite `http://localhost:8443`.

### Health bodies

Confirmation run, `GET http://127.0.0.1:3001/api/v1/health` HTTP 200:

```json
{"status":"ok","service":"neighborly-api","timestamp":"2026-09-23T19:10:17.905Z"}
```

Confirmation run, `GET http://127.0.0.1:3001/api/v1/ready` HTTP 200:

```json
{"status":"ready","dependencies":{"postgres":"up"}}
```

The 15:06 EDT pass returned the same shapes (`status: ok` at `2026-09-23T19:06:27.691Z`, and `postgres: up`).

### Confirmation commerce loop (15:10 EDT)

`pnpm prisma:deploy` exit 0 with no pending migrations. `pnpm prisma:seed` exit 0. Postgres was already healthy and Redis already returned `PONG` before this pass. `API_BASE=http://127.0.0.1:3001/api/v1 node scripts/docker-release-e2e.mjs` exit 0. Seed login worked again. Report: `artifacts/docker-release-verification/e2e-report-rerun.json`.

| Step | Endpoint | Status | Result |
| --- | --- | --- | --- |
| Login A | `POST /api/v1/auth/login` `seed.marcus@example.com` | 201 | user `10000000-0000-4000-8000-000000000001` |
| Login B | `POST /api/v1/auth/login` `seed.priya@example.com` | 201 | user `10000000-0000-4000-8000-000000000002` |
| Categories | `GET /api/v1/categories` | 200 | used `Art & Collectibles` `09c564d6-0521-471a-b090-eed16a1a5c3b` |
| Publish | `POST /api/v1/requests` | 201 | request `1c5d533b-df92-4ac9-91d3-c553407c8fc6`, status `PUBLISHED` |
| Offer | `POST /api/v1/requests/1c5d533b-df92-4ac9-91d3-c553407c8fc6/offers` | 201 | offer `7f62e41a-0c76-4800-8028-d5d3c3e0427c`, status `PENDING` |
| Accept | `POST .../offers/7f62e41a-0c76-4800-8028-d5d3c3e0427c/accept` | 201 | conversation `a5323028-98de-4cb2-8307-b3175edb7715`, transaction `84a5f430-62bf-4573-a91b-18792416290d`, status `ACCEPTED` |
| Message A | `POST /api/v1/conversations/a5323028-98de-4cb2-8307-b3175edb7715/messages` | 201 | message `dd74b283-98d7-429c-9198-fca7c236fc22` |
| Message B | same path, offerer token | 201 | message `60a74876-30c5-4821-a8c4-7ee6a865c46f` |
| Direct complete | `PATCH /api/v1/transactions/84a5f430-62bf-4573-a91b-18792416290d/status` `{ "status": "COMPLETED" }` | 400 | `Invalid transaction transition: ACCEPTED -> COMPLETED` (expected negative check) |
| Scheduled | same patch `{ "status": "SCHEDULED" }` | 200 | status `SCHEDULED` |
| In progress | same patch `{ "status": "IN_PROGRESS" }` | 200 | status `IN_PROGRESS` |
| Completed | same patch `{ "status": "COMPLETED" }` | 200 | status `COMPLETED` |
| Review | `POST /api/v1/reviews` | 201 | review `77d856fa-9a97-4d18-bf2b-56ee072c35f8`, rating 5, author A, subject B |

The API process for this pass was stopped after the loop. Compose was left running.

### Unit and build smoke

| Command | Exit | Count |
| --- | --- | --- |
| Frontend `pnpm exec tsc --noEmit` | 0 | |
| Frontend `pnpm test` (Vitest 5.0.1) | 0 | 8 files, 51 tests passed |
| Frontend `pnpm build` (Vite 8.0.5) | 0 | Built in 1.03s. Chunk-size warning for `dist/assets/index-N4qicXSn.js` (801.32 kB). Exit code stayed 0 |
| Backend `pnpm exec tsc --noEmit` | 0 | |
| Backend `pnpm test` (Jest, `--runInBand`) | 0 | 21 suites, 124 tests passed |
| Backend `pnpm build` (`nest build`) | 0 | |

`pnpm exec prisma generate` exit 0 before migrate and the backend smoke (Prisma Client 6.19.3). Prisma printed a deprecation warning for `package.json#prisma` and an upgrade notice. Exit code stayed 0.

### Earlier commerce loop (15:06 EDT)

`API_BASE=http://127.0.0.1:3001/api/v1 node scripts/docker-release-e2e.mjs` exit 0. Seed login worked. No fresh registration was required. Access tokens in `artifacts/docker-release-verification/e2e-report.json` are redacted.

| Step | Endpoint | Status | Result |
| --- | --- | --- | --- |
| Login A | `POST /api/v1/auth/login` `seed.marcus@example.com` | 201 | user `10000000-0000-4000-8000-000000000001` |
| Login B | `POST /api/v1/auth/login` `seed.priya@example.com` | 201 | user `10000000-0000-4000-8000-000000000002` |
| Categories | `GET /api/v1/categories` | 200 | used `Art & Collectibles` `09c564d6-0521-471a-b090-eed16a1a5c3b` |
| Publish | `POST /api/v1/requests` | 201 | request `d07a345f-0a6f-4f90-a50e-e119e6e38bcd`, status `PUBLISHED` |
| Offer | `POST /api/v1/requests/d07a345f-0a6f-4f90-a50e-e119e6e38bcd/offers` | 201 | offer `33b68579-fd14-471e-bbae-577541648bec`, status `PENDING` |
| Accept | `POST .../offers/33b68579-fd14-471e-bbae-577541648bec/accept` | 201 | conversation `2161ff5b-9dd1-4ecb-94cf-62b90599f059`, transaction `7badce0f-264e-4240-a8b9-ab78917629aa`, status `ACCEPTED` |
| Message A | `POST /api/v1/conversations/2161ff5b-9dd1-4ecb-94cf-62b90599f059/messages` | 201 | message `e02c7a33-9981-4ada-bbb0-3a63840a1299` |
| Message B | same path, offerer token | 201 | message `32521c04-d53f-49bd-bca0-06c4de56081a` |
| Direct complete | `PATCH /api/v1/transactions/7badce0f-264e-4240-a8b9-ab78917629aa/status` `{ "status": "COMPLETED" }` | 400 | `Invalid transaction transition: ACCEPTED -> COMPLETED` (expected negative check) |
| Scheduled | same patch `{ "status": "SCHEDULED" }` | 200 | status `SCHEDULED` |
| In progress | same patch `{ "status": "IN_PROGRESS" }` | 200 | status `IN_PROGRESS` |
| Completed | same patch `{ "status": "COMPLETED" }` | 200 | status `COMPLETED` |
| Review | `POST /api/v1/reviews` | 201 | review `393ea4b4-91d9-475d-9bad-a8dabd3eadb1`, rating 5, author A, subject B |

Nest's default for `@Post()` is HTTP 201, so login, publish, offer, accept, messages, and review returned 201. That matched the script's expected statuses.

### Logs

Redacted and command output for this run:

- `artifacts/docker-release-verification/e2e-report.json`
- `artifacts/docker-release-verification/e2e-stdout.log`
- `artifacts/docker-release-verification/health.log`
- `artifacts/docker-release-verification/migrate.log`
- `artifacts/docker-release-verification/seed.log`
- `artifacts/docker-release-verification/frontend-smoke.log`
- `artifacts/docker-release-verification/backend-smoke.log`
- `artifacts/docker-release-verification/api-server.log` (first boot, before that shell exited)
- `artifacts/docker-release-verification/compose-ps.txt`
- `artifacts/docker-release-verification/datastore.log`
- `artifacts/docker-release-verification/versions.txt`
- `artifacts/docker-release-verification/env-check.json` (lengths and matches only, no secret)
- Confirmation run: `migrate-rerun.log`, `seed-rerun.log`, `health-rerun.log`, `datastore-rerun.log`, `e2e-stdout-rerun.log`, `e2e-exit-rerun.txt`, `e2e-report-rerun.json`, `compose-ps-rerun.txt`, `rerun-started-at.txt`

### Browser smoke

Signed-in Chrome walk at 2026-09-23 15:31:37 EDT (`2026-09-23T19:31:37.166Z`), `http://localhost:8443`, user `seed.marcus@example.com`. Script: `node scripts/docker-release-browser-smoke.mjs`. Screenshots and `results.json` are under `artifacts/docker-release-verification/browser-smoke/`. This is not a feature-complete claim. Pages that rendered are not a release.

| Page | Result | Note |
| --- | --- | --- |
| Landing | Pass | Sign in and Get started were visible. `01-landing.png` |
| Onboarding | Pass | Get started opened the account step. No new account was submitted. `02-onboarding.png` |
| Sign-in dialog | Capture miss | The Sign in click returned true, but `03-sign-in-dialog.png` still shows the landing hero without the modal copy. The next step submitted the form |
| Home | Pass | Signed-in shell. Greeting was captured as "Good afternoon, there" before the first name arrived. Copy included "No free items posted nearby". `04-home.png` |
| Explore | Pass | Filters and a results count rendered. No listing card was available to open. `05-explore.png` |
| Categories | Pass, empty strip | "Browse by category" rendered. The featured strip contained both "Featured in Atlanta" and "No featured listings yet". `06-categories.png` |
| Map | Pass | Search area and neighborhood labels rendered. Not a crash. `07-map.png` |
| Listing Detail | Fail | No card to open. `GET /listings` returned `[]`. `backend/prisma/seed.ts` does not insert marketplace listings. `12-listing-detail.png` |
| Save / favorite | Not run | Depends on a listing detail page |
| Message seller | Not run | Depends on a listing detail page. The API message loop already passed |
| Create | Pass | Chose "Item for Sale" and reached the photos step. Did not publish. `15-create.png` |
| Messages | Pass | Inbox loaded the Priya Patel threads from the API loop ("Docker gate need…"). `16-messages.png` |
| Saved | Pass | Empty state: "No saved listings yet". `17-saved.png` |
| Profile | Pass | Loaded Marcus Johnson, Decatur, member since September 2026, 0 reviews. `18-profile.png` |
| Dashboard | Pass with painted trust copy | "My dashboard" and Marcus Johnson loaded. The trust banner still shows painted "52 transactions" and "4.9 rating". `19-dashboard.png` |
| Housing | Pass | "Find your next home" rendered. Not a 401. `08-housing.png` |
| Services | Pass | "Local services" rendered. Not a 401. Some category counts are painted. `09-services.png` |
| Jobs | Pass | "Local jobs & gigs" rendered. Not a 401. `10-jobs.png` |
| Community | Pass | Community shell rendered. Not a 401. Header counts such as "2,847 Neighbors active" are painted. `11-community.png` |

**Release readiness: NOT claimed until a fully green run is reviewed.**

## 11. Out of scope

Do not read a green Docker gate as feature-complete.

- Landing marketing fixtures (`src/data/index.ts` on Landing) and other painted chrome that is not on this loop
- Vertical leftovers called out in `docs/RELEASE_CHECKLIST.md` section C (lost-and-found and giveaway composers, reply/share, Dashboard Pause / Promote / Mark sold)
- Trust and safety: computed trust scores, MFA, device sessions, disputes and refunds beyond the status enum, the payment-safety banner (it does not send)
- Refresh tokens, image upload, radius / PostGIS search, Redis inside `/ready`, notification feed
- A signed-in browser walk of Housing, Jobs, Services, and Community (the required gate is the API loop above)
- Any new page id, Figma restyle, or AI call

Related record: `docs/RELEASE_CHECKLIST.md` section E.

## 12. Phase 1 — marketplace seed and signed-in smoke

Phase 1 only. It closes the seed gap from section 10: `GET /api/v1/listings` was `[]` because `backend/prisma/seed.ts` did not insert marketplace listings. Housing, jobs, services, and community rows were already seeded. This section does not start later phases.

**Release readiness: NOT claimed.**

| Field | Value |
| --- | --- |
| Timestamp (America/New_York) | 2026-09-23 15:50–15:56 EDT. Passing smoke finished 15:56 EDT |
| Base | `f9e28c87f57ae05dd22d0fd19fa82f159413dfeb` (`f9e28c8`, Docker release verification record, PR #17) |
| Seed commit | `1b7ac344f6a9968ac2ecc8c26fe1b73be473ea52` on `cursor/seed-marketplace-listings-3bd9` |
| Workspace | `/Volumes/T7 Shield/Projects/neighborly` |
| Node / pnpm | v22.23.2 / 10.34.3 |
| Postgres | Already healthy. `pg_isready` accepting connections. `prisma migrate deploy`: no pending migrations |
| Redis | `PONG` |
| API | Already running from `backend/` (`node dist/main.js`) on port 3000. Not restarted. Neighborly was the listener, so nothing was stopped |
| Vite | Already running `pnpm dev` on port 8443. HTTP 200 |
| Health / ready | HTTP 200. `status: ok`. `postgres: up`. Log: `artifacts/docker-release-verification/phase1-api.log` |

### Seed

`pnpm prisma:seed` exit 0. The new `seedMarketplace()` upserts 10 published listings with Unsplash `photo-` image keys, across Furniture, Electronics, Vehicles, Clothing & Accessories, Sports & Outdoors, Home & Garden, Housing, Services, Jobs, and Tools & Equipment. Sellers are the existing seed users. The six newest are not Marcus, so Message seller is allowed. Marcus's row is the older Decatur mower.

After seed, before the smoke published anything, `GET /api/v1/listings?status=PUBLISHED&limit=20` returned those 10 rows. Category `listingCount` values were 1 for each of those ten categories and 0 for the rest.

The passing smoke then used Create Listing's existing default form and clicked Publish now four times across script iterations (three earlier failures on Listing Detail or Save, then the passing run). That added four live rows titled "My Herman Miller Standing Desk", seller Marcus Johnson, category Furniture. Those are smoke output, not seed rows.

Counts after the passing smoke:

| Source | Published listings |
| --- | --- |
| Seed (`60000000-…`) | 10 |
| Smoke publishes (Herman Miller desk) | 4 |
| `GET /api/v1/listings` total | 14 |

Category counts after that smoke: Clothing & Accessories 1, Electronics 1, Furniture 5, Home & Garden 1, Housing 1, Jobs 1, Services 1, Sports & Outdoors 1, Tools & Equipment 1, Vehicles 1.

### Browser smoke

`node scripts/docker-release-browser-smoke.mjs` exit 0 at the end of the passing run. User `seed.marcus@example.com`. Screenshots and `results.json` replaced the section 10 files under `artifacts/docker-release-verification/browser-smoke/`. `failed` in `results.json` is false.

The sign-in dialog is a real control. The section 10 capture miss was the smoke reading the first 1,200 characters of page text, which never reached the dialog at the end of the landing page. This run waits for `[role="dialog"]` and "Welcome back". The card is in the screenshot (white panel, about 448×348). No Landing change was made.

| Page | Result | Note |
| --- | --- | --- |
| Landing | Pass | Sign in and Get started visible |
| Onboarding | Pass | Get started opened the account step. No new account submitted |
| Sign-in dialog | Pass | Dialog text "Welcome back", layout box 1440×1100 for the overlay. Sign-in then reached Home |
| Home | Pass | Greeting rendered. No listings error |
| Explore | Pass | Results shell rendered |
| Categories | Pass | Featured strip had 6 cards, including "Walnut mid-century dining table". Empty copy was absent. `06-categories.png` |
| Map | Pass | Search area rendered |
| Housing | Pass | "Find your next home" |
| Services | Pass | "Local services" |
| Jobs | Pass | "Local jobs" |
| Community | Pass | Community shell |
| Listing Detail | Pass | Opened Priya Patel's walnut table, $425, Inman Park. `12-listing-detail.png` |
| Save / favorite | Pass | The passing run found the heart already Saved from the earlier click in this same Phase 1 session. Saved items then listed the walnut table (`17-saved.png`) |
| Message seller | Pass | Sent "Can I pick up the walnut table on Saturday morning?" and saw "Message sent!". `14-message-modal.png` |
| Messages | Pass | That sentence is the latest line in the Priya Patel thread. The API reuses the existing two-person conversation, so the thread title is still the earlier Docker-gate request. `16-messages.png` |
| Create | Pass | Item for Sale, then through to "Listing published!" using the form's existing desk defaults. Did not add a new page or an AI call. The painted AI Review step was only clicked through |
| Profile | Pass | Marcus Johnson, Decatur, member since September 2026 |
| Dashboard | Pass | "My dashboard" and Marcus Johnson. The trust banner still shows painted "52 transactions" and "4.9 rating" |

**Release readiness: NOT claimed.**
