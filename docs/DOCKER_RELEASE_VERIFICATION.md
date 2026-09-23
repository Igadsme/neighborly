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

- [ ] `backend/.env` and root `.env` exist, match the table, and are not tracked by git

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

- [ ] `docker compose up -d` exits 0
- [ ] Postgres container is healthy
- [ ] `pg_isready` accepts connections
- [ ] Redis `PING` returns `PONG`

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

- [ ] `pnpm prisma:deploy` exits 0 and lists the migrations applied

## 6. Seed

```bash
cd backend
pnpm prisma:seed
```

`backend/prisma/seed.ts` upserts categories, nine local users, and housing, jobs, services, and community rows. Local fixture password only, shared by every seed user: `neighborly-local-seed`. Emails are `seed.<firstname>@example.com` (for example `seed.marcus@example.com`, `seed.priya@example.com`). This password is a local fixture, not a production credential.

- [ ] `pnpm prisma:seed` exits 0

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

- [ ] `GET /api/v1/health` returns HTTP 200 and `status: ok`
- [ ] `GET /api/v1/ready` returns HTTP 200 and `postgres: up`

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

- [ ] Frontend `tsc --noEmit` exits 0
- [ ] Frontend Vitest passes (record test counts)
- [ ] Frontend `vite build` exits 0
- [ ] Backend `tsc --noEmit` exits 0
- [ ] Backend Jest passes (record test counts)
- [ ] Backend `nest build` exits 0

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

- [ ] Seed or fresh login for user A and user B
- [ ] A publishes a request (`POST /api/v1/requests`)
- [ ] B creates an offer
- [ ] A accepts the offer (conversation id + transaction status `ACCEPTED`)
- [ ] A and B each send one message
- [ ] Transaction reaches `COMPLETED` through the real status API
- [ ] A submits `POST /api/v1/reviews` and receives a review id

Browser signed-in pass: not part of the required loop.

- [ ] Browser pass (bonus, not required)

## 10. Results

Filled only from commands run on this Mac. Until that section replaces the placeholder below, treat every box above as open.

| Field | Value |
| --- | --- |
| Timestamp (America/New_York) | Pending live run |
| SHA | `df5aae1b0ceac63d7c449ee377eeae98743830a8` |
| Docker Desktop | Pending |
| Docker Engine | Pending |
| Docker Compose | Pending |
| Node / pnpm | Pending |
| Postgres healthy | Pending |
| Redis ping | Pending |
| Migrations | Pending |
| Seed | Pending |
| Health / ready | Pending |
| Unit and build smoke | Pending |
| Two-user API loop | Pending |
| Browser pass | Not run |
| Blockers | Pending |

**Release readiness: NOT claimed.**

### Command log

Pending. The live run will replace this subsection with exit codes and short response snippets. Full redacted API output, when the script runs, is `artifacts/docker-release-verification/e2e-report.json`.

## 11. Out of scope

Do not read a green Docker gate as feature-complete.

- Landing marketing fixtures (`src/data/index.ts` on Landing) and other painted chrome that is not on this loop
- Vertical leftovers called out in `docs/RELEASE_CHECKLIST.md` section C (lost-and-found and giveaway composers, reply/share, Dashboard Pause / Promote / Mark sold)
- Trust and safety: computed trust scores, MFA, device sessions, disputes and refunds beyond the status enum, the payment-safety banner (it does not send)
- Refresh tokens, image upload, radius / PostGIS search, Redis inside `/ready`, notification feed
- A signed-in browser walk of Housing, Jobs, Services, and Community (the required gate is the API loop above)
- Any new page id, Figma restyle, or AI call

Related record: `docs/RELEASE_CHECKLIST.md` section E.
