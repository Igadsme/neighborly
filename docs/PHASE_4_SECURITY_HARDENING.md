# Phase 4 — Security and reliability hardening

Completion record for branch `cursor/phase4-harden-c3d4`. **Release readiness is not claimed.** This PR does not start Phase 5. Atlas starts Phase 5 after this merges. Nothing here was deployed to staging or production.

Base before this work: `46d6589` (`feat: Phase 3 trust and safety`).

## Commits

| SHA | Subject |
| --- | --- |
| `f8243f6` | feat: harden sessions, boot checks, and readiness |
| `0d3f2b2` | fix: patch Vite, multer, and deepmerge-ts advisories |
| docs commit on this branch | docs: record Phase 4 security hardening |

## Checklist

| Item | Result |
| --- | --- |
| 1. Production environment validation | `backend/src/common/config/env.validation.ts` fails boot when required values are missing or unsafe. Production also requires `REDIS_URL`, `TRUST_PROXY` of `0` or `1`, and a JWT secret that is not a placeholder or low-diversity. A partial S3 set is rejected. `*` is not a CORS origin. |
| 2. Secrets handling | Live env files stay gitignored (`.env*`). The committed template is `env.example`. Docs use that contract. No new secret was added to the tree. |
| 3. CORS, Helmet, cookies, JWT | Explicit origin list, `credentials: false`. No cookie is set. Access tokens are HS256 bearer tokens only. Helmet is on; HSTS and the default CSP apply in production. Swagger at `/docs` is off in production. |
| 4. Input validation and uploads | Global `ValidationPipe` is unchanged. Auth strings gained max lengths. JSON bodies are capped at 256kb. `multipart/form-data` returns 415. No upload route is mounted. `assertImageUpload` is the gate for a later image route (default 5 MB, max 10, JPEG/PNG/WebP). |
| 5. Dependency audit | `pnpm audit` is clean for the frontend and the backend after the upgrades below. |
| 6. Database backup and restore | `scripts/backup-postgres.sh` and `scripts/restore-postgres.sh`. Procedure is in `docs/DEPLOYMENT.md`. |
| 7. Redis readiness and failure | Production boot requires `REDIS_URL`. `/ready` pings it. If Redis errors at runtime, rate limits stay on in memory and the process logs `rate_limit.redis_fallback` once. Compose Redis uses AOF. |
| 8. Structured logging and error hook | JSON lines from `backend/src/common/logger.ts`. `captureException` is the Sentry hook. `@sentry/node` is not bundled. |
| 9. Health and readiness | `GET /api/v1/health` is liveness. `GET /api/v1/ready` checks Postgres and, when `REDIS_URL` is set, Redis. |
| 10. Request ids and audit logging | `x-request-id` on responses. `http.request` omits the query string. Register, login, suspend, and restore write `audit: true` lines. |
| 11. Indexes and slow queries | Migration `0005_query_indexes`. Optional `SLOW_QUERY_LOG=1` logs SQL text with placeholders, not bound values. |
| 12. Rate-limit and abuse notes | Documented below and in `docs/DEPLOYMENT.md`. |
| 13. Security and deployment docs | `docs/SECURITY.md` and `docs/DEPLOYMENT.md` now describe what the API does. `env.example` matches the boot schema. |

Phase 3 follow-up that fit this pass: `AuthGuard` and the `/realtime` handshake load `User.status` and `deletedAt`, so a suspended or deleted account cannot keep using an access token. Production docs and boot validation prefer Redis for rate limits.

## Audit

Run on 23 Sep 2026 with `pnpm audit` at the repo root and in `backend/` (pnpm 10.34.3, Node 22.23.2).

Before upgrades, the frontend reported 6 high and 3 moderate (Vite `<=8.0.15`, PostCSS, and nanoid under Vite). The backend reported 4 high and 1 low (multer `<2.3.0` via `@nestjs/platform-express`) plus 1 high (`deepmerge-ts` `<8` via Prisma's config loader).

Remediation:

| Package | Was | Now | Why |
| --- | --- | --- | --- |
| `vite` | 8.0.5 | 8.3.0 | Fixes the Vite advisories and pulls PostCSS 8.5.28 and nanoid 3.3.18. |
| `multer` | 2.2.0 | 2.4.0 | pnpm override. No upload route calls it. The override removes the known DoS advisories from the tree. |
| `deepmerge-ts` | 7.1.5 | 8.0.2 | pnpm override. Prisma config still imports `deepmerge`. `pnpm exec prisma generate` succeeded after the pin. |

After those changes both audits reported zero known vulnerabilities (`info` 0, `low` 0, `moderate` 0, `high` 0, `critical` 0).

`pnpm install` in `backend/` still warns that `glob@7.2.3` and `inflight@1.0.6` are deprecated. They are transitive install-time packages, not audit findings, and were not replaced in this pass.

## Backup and restore

Scripts:

- `scripts/backup-postgres.sh [output.dump]` runs `pg_dump -Fc` through Compose into `artifacts/backups/` by default. That directory is gitignored.
- `scripts/restore-postgres.sh <dump>` runs `pg_restore --clean --if-exists` into the existing `neighborly` database. Stop the API first.

Checked on this machine against the already-running Compose Postgres (not recreated):

- The backup script wrote a 101 KB custom-format dump of database `neighborly`.
- `pg_restore` into a new database `neighborly_p4_restore_check` restored 9 `User` rows. That database was then dropped.
- `scripts/restore-postgres.sh` was not pointed at the live `neighborly` database.
- `0005_query_indexes` was executed inside a transaction and rolled back. It did not remain on the live database. The live database does not yet have the `Report` table, so that trial stopped on the report index. The statements before it parsed. Apply `0004_trust_safety` before `0005_query_indexes`.

Redis is not backed up as source data. Compose now starts Redis with `--appendonly yes` on the next container recreate. The container that was already running was left as-is. Losing Redis resets rate-limit counters only.

Hosted Postgres needs the provider's backups. These scripts cover Compose only.

## Rate limits and abuse signals

Unchanged caps (override with a positive integer env var):

| Action | Env | Default | Window | Key |
| --- | --- | --- | --- | --- |
| Register | `RATE_LIMIT_AUTH_REGISTER` | 5 | 15 minutes | client address |
| Login | `RATE_LIMIT_AUTH_LOGIN` | 10 | 15 minutes | client address |
| Conversation and message | `RATE_LIMIT_MESSAGING` | 30 | 1 minute | caller id |
| Listing create and draft | `RATE_LIMIT_LISTINGS` | 20 | 1 hour | caller id |
| Offer create and counter | `RATE_LIMIT_OFFERS` | 30 | 1 hour | caller id |
| Report create | `RATE_LIMIT_REPORTS` | 10 | 1 hour | caller id |

The client address is the socket address unless `TRUST_PROXY=1`, in which case it is the first `X-Forwarded-For` hop. Set `1` only when the proxy overwrites that header. A shared proxy address with `TRUST_PROXY=0` puts every caller in one auth bucket.

Watch `http.request` lines with status 429, and a single `rate_limit.redis_fallback` warning. That warning means the process has switched to a private counter until restart. `auth.login.failure` includes the submitted email.

## Tests

Backend Jest (`pnpm test` in `backend/`): 31 suites, 172 tests passed. Frontend Vitest (`pnpm test`): 9 files, 55 tests passed. `pnpm exec tsc --noEmit` and `pnpm build` passed for both. CI on the pull request is the check that must be green before merge.

New coverage includes suspended and missing accounts on `AuthGuard`, a suspended socket, Redis errors falling back to memory, ignored `X-Forwarded-For` unless `TRUST_PROXY=1`, production env rejection, readiness when Redis is down, multipart rejection, request ids, and the slow-query threshold.

## Known issues

- Not production ready. No staging or production deploy was done. Phase 5 is not started.
- No refresh-token rotation, no MFA, no server session table, and no admin UI.
- `captureException` logs a JSON line. It does not send the event to Sentry. Set `SENTRY_DSN` only after the SDK is added at that function.
- No upload route exists. Multipart requests are rejected. `ListingImage.objectKey` still has no writer.
- A failed Redis connect is remembered until the process restarts. Limits keep working per process. `/ready` stays 503 while the ping fails, so a load balancer can stop sending traffic.
- Socket.IO CORS is read when the gateway module is imported. Start the process with `CORS_ORIGIN` already in the environment. Compose `env_file` does that. `ConfigModule` still validates it before listen.
- `0005_query_indexes` is additive and was not applied to the local database during this check.
- The same Phase 3 limits remain: one report per target even after dismiss, hiding content sets `deletedAt` with no restore action, and community/housing/jobs/services reporting has no painted control.
- `pnpm install` in `backend/` still prints deprecation warnings for `glob@7.2.3` and `inflight@1.0.6`.
- Docker was used only to prove backup and the index SQL. The signed-in browser pass was not re-run. This phase does not change a Figma screen.

## Rollback

App rollback: deploy the previous build (`46d6589`). That build does not read `TRUST_PROXY`, does not ping Redis from `/ready`, and does not reload `User.status` inside `AuthGuard`.

Database rollback is optional. `0005_query_indexes` only adds indexes. Dropping them is safe if the previous build is running. Leaving them is also safe. Do not drop Phase 3 tables as part of this rollback.

Dependency rollback: revert `0d3f2b2` to return to Vite 8.0.5 and the unpinned multer and deepmerge-ts versions. Those versions have the advisories listed above.

Do not merge this branch if frontend or backend CI is red.
