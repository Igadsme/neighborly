# Neighborly pause checkpoint

**Paused:** 2026-09-23 00:00 EDT  
**Reason:** Transfer workspace to external SSD **T7 Shield** and freeze feature development until resume.  
**Canonical local path after transfer:** `/Volumes/T7 Shield/Projects/neighborly`  
**GitHub remote (unchanged):** https://github.com/Igadsme/neighborly.git

## Git state at checkpoint

| Item | Value |
| --- | --- |
| Branch | `main` |
| Commit SHA | `d528f91a48066bb49d47bf69fe765b0471583056` |
| Commit subject | Sprint 1 P0: auth identity fix and local boot path |
| Uncommitted changes | None intended (working tree cleaned after exFAT copy). Ignore AppleDouble `._*` if they reappear on exFAT. |
| Untracked (source before transfer) | Only `.DS_Store` noise on Desktop copy |
| Local secrets present | **No** `.env` / `backend/.env` on source or destination |

### Remote branches present

- `origin/main` @ d528f91 (includes merged PR #1 auth+boot/CI)
- `origin/cursor/june-sprint1-ux-docs-41e9` (PR #2 docs — open)
- `origin/cursor/sentinel-sprint1-qa-d4e3` (Sentinel draft PR #3 — paused)
- `origin/cursor/sprint-1-p0-infra-auth-38f4` (merged via PR #1)

## Completed features (as of this pause)

- Vite + React Figma-generated frontend present; NestJS API foundation present
- Auth register/login; JWT access tokens; **AuthGuard maps `sub` → `request.user.id`** (PR #1)
- Env boots with `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` only; Redis/S3 optional
- `env.example`, root `README.md`, Postgres healthcheck in Compose, GitHub Actions CI
- Listings CRUD + favorites + saved searches; request create/list; offer create/counter
- Conversation read/send for existing participants; transaction list + status state machine
- Categories seed; health/ready endpoints; Swagger at `/docs`

## Incomplete / not started (blocked for resume)

- Offer **accept/reject** creating conversation + transaction + milestone
- `GET /requests/:id` with offers; strip private fields on public request list
- Reviews API; realtime gateway auth + publish from sendMessage
- Frontend: remove fake preview sign-in; hide AI copy; wire Home/Explore/listing ids; request composer; Messages/Dashboard live data
- URL router; image upload; housing/jobs/services/community APIs
- June PR #2 docs merge; Sentinel PR #3 tests; Nova wiring PR

## Current blockers

1. **Paused by Product Owner** for SSD transfer — do not continue feature work until resume.
2. Request-first commerce loop still open (no accept → conversation → transaction → review).
3. Most marketplace screens still use `src/data` fixtures.
4. Open PRs not merged: #2 (June docs), #3 (Sentinel draft).

## Last known passing commands (from Sprint 1 PR #1 / CI)

```bash
# frontend
pnpm install
pnpm exec tsc --noEmit
pnpm build

# backend
cd backend
pnpm install
pnpm exec prisma generate
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

CI on PR #1: Frontend **success**, Backend **success**.

## Database / migrations

- Migrations present: `0001_init`, `0002_onboarding`
- Seed: categories only (`pnpm prisma:seed`)
- Status on this machine at pause: not re-verified against a running Postgres during transfer

## Environment variables required (from `env.example`)

**Required to boot API:** `DATABASE_URL`, `JWT_SECRET` (≥32 chars), `CORS_ORIGIN`  
**Frontend:** `VITE_API_URL` (defaults documented in README)  
**Optional until clients exist:** `REDIS_URL`, `JWT_REFRESH_SECRET`, `S3_*`

**Do not copy real secrets.** Recreate `backend/.env` and root `.env` from `env.example` on the T7 when resuming.

## Docker / Redis / PostgreSQL

- `docker-compose.yml`: PostGIS 16 + Redis 7 (Postgres healthcheck added in PR #1)
- No app container
- Status at pause: not assumed running; start with `docker compose up -d` before local API work

## Exact next recommended task (on resume)

1. Read `docs/PAUSE_CHECKPOINT.md`, `docs/PROJECT_STATUS.md`, architecture/API/DB/security/deployment docs (and June PR #2 / `UX_REQUEST_FLOW_STATES` once merged).
2. Recreate local `.env` files from `env.example` (never commit secrets).
3. `docker compose up -d` → backend migrate/seed → `pnpm start:dev` → frontend `pnpm dev`.
4. Verify `tsc` / `test` / `build` from this T7 path.
5. **Resume product spine:** implement offer accept/reject → conversation + transaction → reviews; then Nova wires UI per June specs. Preserve Figma UI; no AI in v1.

## Transfer notes

- Source (pre-transfer): `/Users/gadimani/Desktop/Neighborly/app`
- Destination: `/Volumes/T7 Shield/Projects/neighborly` (confirmed on `/dev/disk5s1`, volume **T7 Shield**)
- Figma zip copied to: `/Volumes/T7 Shield/Projects/neighborly-assets/`
- `node_modules` / `dist` excluded from copy (reinstall with pnpm)


## Transfer verification (executed)

| Check | Result |
| --- | --- |
| T7 mounted | Yes — `/Volumes/T7 Shield` on `/dev/disk5s1` (exFAT, 1.8Ti) |
| Destination on T7 (not internal) | Yes — path under `/Volumes/T7 Shield/Projects/neighborly` |
| Git `HEAD` (pre-checkpoint commit) | `d528f91a48066bb49d47bf69fe765b0471583056` on `main` |
| Git remote | `https://github.com/Igadsme/neighborly.git` |
| Secrets copied | **No** `.env` / `backend/.env` |
| Frontend `tsc --noEmit` from T7 | **Pass** |
| Frontend `pnpm build` from T7 | **Fail** — Vite/rolldown native binding missing under Node **20.16.0**. Project pins Node **22** in `.mise.toml`. |
| Backend `prisma generate` from T7 | **Pass** |
| Backend `tsc --noEmit` from T7 | **Pass** |
| Backend `pnpm test` from T7 | **Pass** (6 tests) |
| Backend `pnpm build` from T7 | **Pass** |
| Docs present | Yes including `PAUSE_CHECKPOINT.md` |
| Figma zip | `/Volumes/T7 Shield/Projects/neighborly-assets/` |
| Original Desktop copy | **Not deleted** (`/Users/gadimani/Desktop/Neighborly/app`) |

### Open Cursor from T7

Open folder: `/Volumes/T7 Shield/Projects/neighborly`  
Recreate env files from `env.example` before running the API.

## Resumed

**Resumed:** 2026-09-23 (Atlas / Product Owner)  
**Active workspace:** `/Volumes/T7 Shield/Projects/neighborly` only.  
**Desktop copy:** leave `~/Desktop/Neighborly/app` untouched as backup.  
**Runtime:** Node 22 via `.mise.toml` (do not weaken for Node 20).  

Checkpoint blockers #1 (paused) and June PR #2 are cleared. Continue from incomplete list: accept-path → Nova wiring → Sentinel tests. See `docs/PROJECT_STATUS.md` resume verification.

