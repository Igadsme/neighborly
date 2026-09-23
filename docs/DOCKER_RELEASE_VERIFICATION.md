# Docker release verification

Live Docker and database gate for Neighborly on the Mac at `/Volumes/T7 Shield/Projects/neighborly`.

This document is a verification record. It is not a release. **Release readiness: NOT claimed** until the Product Owner reviews a fully green run of every required row below.

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

`backend/prisma/seed.ts` upserts categories, nine local users, and housing, jobs, services, and community rows. Local fixture password only, shared by every seed user: `neighborly-local-seed`. Emails are `seed.<firstname>@example.com` (for example `seed.marcus@example.com`, `seed.priya@example.com`). This password is a local fixture, not a production credential.

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

- [ ] Browser pass (bonus, not required). Not run in this gate.

## 10. Results

Live run on this Mac. Checked rows above match this table. The browser row stays open.

| Field | Value |
| --- | --- |
| Timestamp (America/New_York) | 2026-09-23 15:04:16 EDT start; API loop finished 15:06:28 EDT (`2026-09-23T19:06:28.192Z`) |
| SHA | `df5aae1b0ceac63d7c449ee377eeae98743830a8` (`df5aae1`) |
| Docker Desktop | 4.92.0 |
| Docker Engine | client and server 29.8.0 |
| Docker Compose | v5.5.1 |
| Host | arm64 |
| Node / pnpm | v22.23.2 / 10.34.3 |
| Postgres healthy | Pass. `neighborly-postgres-1` healthy. `pg_isready` exit 0, `accepting connections` |
| Redis ping | Pass. `PONG`, exit 0. Compose does not define a Redis healthcheck, so `docker compose ps` shows no health state for Redis |
| Migrations | Pass. `pnpm prisma:deploy` exit 0. Applied `0001_init`, `0002_onboarding`, `0003_verticals` |
| Seed | Pass. `pnpm prisma:seed` exit 0 |
| Health / ready | Pass. HTTP 200 on both. See snippets below |
| Unit and build smoke | Pass. Frontend tsc 0, Vitest 51/51, vite build 0. Backend tsc 0, Jest 124/124, nest build 0 |
| Two-user API loop | Pass. `node scripts/docker-release-e2e.mjs` exit 0 |
| Browser pass | Not run |
| Blockers | None on the required rows. Warnings are listed under Command log and do not flip those rows to fail |

**Release readiness: NOT claimed.**

### Environment

`backend/.env` and the repo-root `.env` were already present, matched `env.example`, and were left in place. Both are gitignored. `DATABASE_URL` matched `postgresql://neighborly:neighborly@localhost:5432/neighborly`. `JWT_SECRET` length was 58 (at least 32). `CORS_ORIGIN` was `http://localhost:8443`. `VITE_API_URL` was `http://localhost:3000/api/v1`. The secret value is not recorded here.

### Compose

`docker compose up -d` exit 0. New volumes `neighborly_neighborly-postgres` and `neighborly_neighborly-redis`. Port 5432 was free, so stopped containers were left alone, including `devdash-postgres-1` (exited, published `5432`) and the other exited DevDash, insta-clone, and Azure SQL Edge containers. Their volumes were not removed.

Docker printed: the PostGIS image platform is `linux/amd64` and the host is `linux/arm64/v8`, with no platform pin in `docker-compose.yml`. The container still reached `healthy` and `pg_isready` succeeded. That warning is not a failed row.

### API port

`backend/.env` sets `PORT=3000`. Host port 3000 was already taken by an unrelated Next.js process (a portfolio site, not this repo). It was not stopped. `GET http://127.0.0.1:3000/api/v1/health` returned that app's HTML 404. The Neighborly API was started with `PORT=3001 pnpm start` from `backend/` (`pnpm start` runs `node dist/main.js`). A first `nohup` child exited when its launching shell ended, after Nest had logged a successful start. The process that served the checks below stayed up for the health calls and the API loop, then was stopped. Compose was left running. `tmux` is not installed on this Mac, so that process was a background `pnpm start`.

### Health bodies

`GET http://127.0.0.1:3001/api/v1/health` HTTP 200:

```json
{"status":"ok","service":"neighborly-api","timestamp":"2026-09-23T19:06:27.691Z"}
```

`GET http://127.0.0.1:3001/api/v1/ready` HTTP 200:

```json
{"status":"ready","dependencies":{"postgres":"up"}}
```

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

### Two-user API loop

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

### Not run

Signed-in browser pass. Housing, Jobs, Services, and Community pages were not clicked. `VITE_API_URL` still points at port 3000, which this gate did not use for the API.

**Release readiness: NOT claimed.**

## 11. Out of scope

Do not read a green Docker gate as feature-complete.

- Landing marketing fixtures (`src/data/index.ts` on Landing) and other painted chrome that is not on this loop
- Vertical leftovers called out in `docs/RELEASE_CHECKLIST.md` section C (lost-and-found and giveaway composers, reply/share, Dashboard Pause / Promote / Mark sold)
- Trust and safety: computed trust scores, MFA, device sessions, disputes and refunds beyond the status enum, the payment-safety banner (it does not send)
- Refresh tokens, image upload, radius / PostGIS search, Redis inside `/ready`, notification feed
- A signed-in browser walk of Housing, Jobs, Services, and Community (the required gate is the API loop above)
- Any new page id, Figma restyle, or AI call

Related record: `docs/RELEASE_CHECKLIST.md` section E.
