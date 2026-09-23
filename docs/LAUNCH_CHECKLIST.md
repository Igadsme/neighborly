# Launch checklist

Product Owner: Imani Gad. This checklist is the Phase 7 preparation list. **Checking a prep row does not authorize a launch.**

**NOT LAUNCHED / NOT DEPLOYED.** Do not treat a green CI run, Phase 6 staging QA (P0/P1 = 0), or a local Compose stack as a production launch.

Status words:

| Word | Meaning |
| --- | --- |
| PREPARED | A document or template exists in this repo. Nobody executed the public step |
| BLOCKED | Waiting on a product-owner decision. Do not proceed |
| VERIFIED | Already exercised on Compose staging or local dev. That environment is not production |

The intended path, still not executed, is `docs/PRODUCTION.md`. The completion record is `docs/PHASE_7_PROD_PREP.md`.

## Prep artifacts

| Item | Status | Where |
| --- | --- | --- |
| Completion record | PREPARED | `docs/PHASE_7_PROD_PREP.md` |
| Intended production path | PREPARED | `docs/PRODUCTION.md` |
| Staging path (the verified one) | VERIFIED | `docs/PHASE_5_STAGING.md`, `docs/PHASE_6_STAGING_QA.md`, `docs/DEPLOYMENT.md` section 8 |
| Env template with placeholders | PREPARED | `env.production.example` |
| Fail-fast boot rules | VERIFIED in code | `backend/src/common/config/env.validation.ts` |
| Manual production workflow stub | PREPARED, not dispatched | `.github/workflows/deploy-production.yml` |
| Incident and rollback summary | PREPARED | `docs/INCIDENT_ROLLBACK.md` |
| Release notes draft | PREPARED, not published | `docs/RELEASE_NOTES_DRAFT.md` |
| Legal placeholders | PREPARED, not counsel-reviewed | `docs/legal/` |

## Domain, DNS, and public TLS

| Item | Status | Notes |
| --- | --- | --- |
| Domain chosen and registered | BLOCKED | No domain was registered in Phase 7 |
| DNS host and records for the public app name | BLOCKED | No DNS record was changed |
| Public certificate | BLOCKED | Staging uses Caddy's internal CA on `staging.neighborly.localhost:8444`. That name resolves to loopback. It is not a public certificate |
| Public staging hostname | BLOCKED | Do not start one from this checklist. Staging stays on loopback |
| HTTP to HTTPS redirect and HSTS on the public edge | BLOCKED | The API turns HSTS on when `NODE_ENV=production`. The public edge still needs its own TLS terminator |

## Production Postgres and PostGIS

| Item | Status | Notes |
| --- | --- | --- |
| Provider, region, and billing | BLOCKED | Do not buy or provision |
| PostGIS | BLOCKED | Compose uses `postgis/postgis:16-3.4`. Match that major line unless the product owner accepts a different one |
| Network path | BLOCKED | The API is the only client. `deploy/staging/db-setup.sh` refuses every host except `staging-postgres`. A production migrate job needs its own guard and must not reuse that script |
| Migrations | PREPARED | `prisma migrate deploy` of the committed migrations, including `0004_trust_safety` and `0005_query_indexes`. They are forward-only. No down migration is in the tree |
| Empty database | BLOCKED | Production starts empty. See seed rules below |
| Backups | BLOCKED | Provider schedule plus a restore drill. Compose dumps are not that schedule |

## Redis

| Item | Status | Notes |
| --- | --- | --- |
| Provider and TLS URL (`rediss://`) | BLOCKED | Production boot requires `REDIS_URL` |
| What Redis stores | VERIFIED in code | Rate-limit counters only. It is not source data. Losing it resets counters |
| `/ready` behavior | VERIFIED in code | A failed ping returns 503 so a load balancer can stop traffic |
| Fallback | VERIFIED in code | A Redis error keeps an in-process window and logs `rate_limit.redis_fallback` once, until restart |
| Compose AOF | VERIFIED | Dev and staging Redis start with `--appendonly yes`. That is not production failover |

## Object storage

| Item | Status | Notes |
| --- | --- | --- |
| Provider, bucket, and credentials | BLOCKED | Staging MinIO is a local fixture so boot sees a complete S3 set. Those keys are not production secrets |
| Upload route | VERIFIED as absent | `multipart/form-data` returns 415. `ListingImage.objectKey` has no writer |
| Partial S3 configuration | VERIFIED in code | Boot fails unless `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, and `S3_SECRET_KEY` are all set or all empty |
| Lifecycle and versioning | BLOCKED | Needed only after an upload route exists. v1 can ship without uploads if the product owner says so |
| Browser credentials | BLOCKED | Do not put storage keys in the frontend. A future upload path should use pre-signed URLs. That path is not built |

## Application host

| Item | Status | Notes |
| --- | --- | --- |
| Host, region, and billing | BLOCKED | Do not buy or provision |
| Images | PREPARED, not pushed | Staging builds `neighborly-api:staging` and `neighborly-web:staging` locally. GHCR push for staging happens only when `STAGING_PUSH_IMAGES` is `true`. Leave it unset. Production push is a separate variable and the stub refuses |
| API port | BLOCKED | Do not publish the API on a public interface. Staging binds it to loopback (`127.0.0.1:3001`) and puts Caddy in front |
| Probes | VERIFIED in code | Liveness `GET /api/v1/health`. Readiness `GET /api/v1/ready` (Postgres, and Redis when `REDIS_URL` is set) |
| Swagger | VERIFIED in code | Off when `NODE_ENV=production`. Direct `/docs` is 404. An edge that sends `/docs` to the SPA returns the shell, not Swagger |
| Frontend API URL | BLOCKED | `VITE_API_URL` is baked at image build. Rebuild `web` after the public origin is chosen |
| Replicas | BLOCKED | More than one API process requires shared Redis. Production boot already requires `REDIS_URL` |

## Secrets

Placeholders live in `env.production.example`. Real values stay in the host secret store. `.env*` is gitignored. No production secret goes in the GitHub Environment named `staging`.

| Secret or setting | Status | Fail-fast rule |
| --- | --- | --- |
| `JWT_SECRET` | BLOCKED | Required. At least 32 characters. In production it must not match a placeholder (`change-me`, `replace-with`, `changeme`, `jwt_secret`, or the exact words `secret`, `password`, `neighborly`) and must contain at least 8 distinct characters |
| `DATABASE_URL` | BLOCKED | Required. `postgresql://` or `postgres://` |
| `REDIS_URL` | BLOCKED | Required in production. `redis://` or `rediss://` |
| `CORS_ORIGIN` | BLOCKED | Required. Comma-separated absolute `http` or `https` origins. `*` is rejected. Userinfo in the URL is rejected |
| `TRUST_PROXY` | BLOCKED | Required in production. Exactly `0` or `1`. Use `1` only when the proxy overwrites `X-Forwarded-For` |
| S3 access key and secret | BLOCKED | Optional until uploads exist. A partial set fails boot |
| `SENTRY_DSN` | BLOCKED | Optional. If set, it must be `https`. The SDK is not bundled, so leave it empty |
| `JWT_REFRESH_SECRET` | BLOCKED | Unused. Refresh tokens are not issued. If set, at least 32 characters |
| GitHub Environment `production` reviewers | BLOCKED | Add required reviewers before anyone sets `PRODUCTION_DEPLOY_ENABLED` |

Boot implementation: `backend/src/common/config/env.validation.ts`.

## Backups and restore drill

| Item | Status | Notes |
| --- | --- | --- |
| Dev Compose dump and restore | VERIFIED | `scripts/backup-postgres.sh`, `scripts/restore-postgres.sh`. Phase 4 drilled a side database. These scripts talk to the dev `postgres` service |
| Staging dump and side-database restore | VERIFIED | `scripts/staging-backup.sh`. Phase 6 restored into `neighborly_p6_restore` and dropped it. The live staging database was not overwritten |
| Production backup schedule | BLOCKED | Provider backups and point-in-time recovery. These shell scripts do not cover a hosted database |
| Production restore drill | BLOCKED | After a host exists: restore into a new database, compare row counts, drop the drill database. Do not restore over the live database during the drill. Record the date here before any announcement |
| Redis backup | Not required for source data | Losing Redis resets rate-limit counters only |
| Dump files | PREPARED | `artifacts/backups/` is gitignored. Do not commit dumps |

Drill plan (do not run against a production host; none exists):

1. Confirm the dump target is the production database the product owner named, not dev port 5432 and not staging port 5433.
2. Take a dump with the provider's tool, or with `pg_dump -Fc` from an operator machine that is allowed to connect.
3. Restore into a new database with `pg_restore --clean --if-exists`.
4. Check `User`, `Listing`, and `Category` counts against the source.
5. Drop the drill database.
6. Write the date, operator, and counts into this file in a later change. Phase 7 does not record a production drill because no production database exists.

## Monitoring and alerting

| Item | Status | Notes |
| --- | --- | --- |
| Structured logs | VERIFIED in code | JSON lines. `http.request` includes request id, method, path, status, and duration. Query strings are omitted |
| Sensitive lines | VERIFIED in code | `auth.login.failure` includes the submitted email. Treat the log drain as sensitive |
| Error hook | PREPARED, not wired | `captureException` logs. It does not call Sentry. Do not set `SENTRY_DSN` until the SDK is added at that function |
| Alerts | BLOCKED | Define paging for `/ready` 503, elevated 5xx, and `rate_limit.redis_fallback`. No vendor was purchased |
| Slow queries | PREPARED | `SLOW_QUERY_LOG=1` logs SQL text with placeholders, not bound values. Leave it off unless investigating |
| Payments, email, maps | Not in v1 | Do not alert on Stripe, Resend, or Mapbox. Those clients are not called |

## CI/CD promote path

| Item | Status | Notes |
| --- | --- | --- |
| Pull request CI | VERIFIED as the gate for merge | `.github/workflows/ci.yml` runs frontend and backend typecheck, tests, and build |
| Staging smoke | PREPARED | `.github/workflows/deploy-staging.yml` is `workflow_dispatch` only. It was not dispatched in Phase 7. Image push needs `STAGING_PUSH_IMAGES=true`. Leave that unset |
| Production promote | PREPARED, refused | `.github/workflows/deploy-production.yml` is `workflow_dispatch` only. It exits before any build, GHCR login, or remote command unless `PRODUCTION_DEPLOY_ENABLED` is the string `true`. Even then it refuses, because no target is configured. A second job can push only when `PRODUCTION_PUSH_IMAGES` is `true`, and that job also refuses and does not log in. Neither variable is set. The workflow was not dispatched |
| Approval | BLOCKED | Product owner approval, then Atlas merges. Required reviewers on the `production` GitHub Environment come before either variable is set |
| Order when a launch is later approved | PREPARED | `main` CI green, then a manual staging smoke, then a product-owner written approval, then a future workflow change that names a real host. Phase 7 does not perform that order |

## Legal

The landing footer and the onboarding agreement line render "Privacy Policy", "Terms of Service", and "Cookie Policy" as `<a href="#">`. Those anchors were not changed. They do not open a policy.

| Item | Status | Notes |
| --- | --- | --- |
| Terms of Service | BLOCKED | `docs/legal/TERMS_OF_SERVICE_PLACEHOLDER.md` is a placeholder, not counsel text |
| Privacy Policy | BLOCKED | `docs/legal/PRIVACY_POLICY_PLACEHOLDER.md` |
| Cookie Policy | BLOCKED | `docs/legal/COOKIE_POLICY_PLACEHOLDER.md` |
| Publish the policies and point the existing anchors at them | BLOCKED | Requires a product-owner decision and a UI change. Phase 7 does not edit `src/` |

## Incident response

| Item | Status | Notes |
| --- | --- | --- |
| Runbook | PREPARED | `docs/INCIDENT_ROLLBACK.md` |
| Named responders and a paging path | BLOCKED | Roles are listed. No phone number or paging vendor was added |
| Public status communication | BLOCKED | The product owner approves any user-facing note. Phase 7 does not announce |

## Rollback

| Item | Status | Notes |
| --- | --- | --- |
| Staging app rollback | VERIFIED | `scripts/staging-rollback.sh` retags `neighborly-api:staging-previous` and `neighborly-web:staging-previous`. Phase 6 ran it and then restored the fixed images |
| Staging data rollback | PREPARED | Pass a dump from `scripts/staging-backup.sh`. Stop of `api`, `web`, and `caddy` happens inside the script before `pg_restore` |
| Dev data rollback | PREPARED | `scripts/restore-postgres.sh`. Stop the API first. This script targets the dev `postgres` service |
| Production app rollback | BLOCKED | Keep the previous image on the host the product owner chooses. There is no production rollback script, because there is no production host |
| Schema rollback | PREPARED as a warning | `0004_trust_safety` and `0005_query_indexes` are forward-only. Restoring a dump taken before those migrations is the data rollback. Do not invent a down migration during an incident |

## Seed versus production data

| Item | Status | Notes |
| --- | --- | --- |
| Seed script | VERIFIED | `backend/prisma/seed.ts` upserts. It does not delete rows. Shared password `neighborly-local-seed`. Emails `seed.<firstname>@example.com`. That password is a fixture |
| Staging migrate container | VERIFIED | `deploy/staging/db-setup.sh` runs migrate, then seed, and refuses any `DATABASE_URL` whose host is not `staging-postgres` |
| Phase 6 extra rows | VERIFIED on staging | QA created fixture users that are not seed users. Re-running the seed does not delete them. Do not copy that database |
| Production | BLOCKED | `prisma migrate deploy` only. Do not run the seed. Do not point `db-setup.sh`, `staging-backup.sh`, or `backup-postgres.sh` at production |

## Rate limits at the public edge

App caps (override with a positive integer env var). Implementation: `backend/src/common/rate-limit.ts`.

| Action | Env | Default | Window | Key |
| --- | --- | --- | --- | --- |
| Register | `RATE_LIMIT_AUTH_REGISTER` | 5 | 15 minutes | Client address |
| Login | `RATE_LIMIT_AUTH_LOGIN` | 10 | 15 minutes | Client address |
| Conversation and message | `RATE_LIMIT_MESSAGING` | 30 | 1 minute | Caller id |
| Listing create and draft | `RATE_LIMIT_LISTINGS` | 20 | 1 hour | Caller id |
| Offer create and counter | `RATE_LIMIT_OFFERS` | 30 | 1 hour | Caller id |
| Report create | `RATE_LIMIT_REPORTS` | 10 | 1 hour | Caller id |

| Item | Status | Notes |
| --- | --- | --- |
| App limits on Redis | VERIFIED | Phase 6 saw 429 after the login cap and after report and conversation caps |
| Client address | BLOCKED for public | `TRUST_PROXY=1` uses the first `X-Forwarded-For` hop. The edge must overwrite that header. A shared proxy address with `TRUST_PROXY=0` puts every caller in one auth bucket |
| Compose staging edge | VERIFIED limitation | Caddy replaces `X-Forwarded-For`. The auth bucket is the Docker bridge address, so every browser on that host shares it (Phase 6, deferred P2). Do not copy that publish mode to a public edge |
| Loopback API port | VERIFIED limitation | `127.0.0.1:3001` honors a client-supplied `X-Forwarded-For` because staging sets `TRUST_PROXY=1`. Do not publish that port |
| Extra edge limit (WAF or proxy) | BLOCKED | Not configured. The product owner decides whether the public edge adds a limit in front of these caps |

## Still out of v1

These stay unwired. Launch copy must not claim them. Phase 6 deferred them or never built them.

- AI review, scam detection, embeddings, semantic search
- Payments, refunds, Stripe
- Mapbox (the map uses neighborhood centroids)
- Email delivery
- Image upload
- Refresh tokens, MFA, server session table, admin UI
- Appointment records (schedule is the transaction status machine)
- Real share links (the control says sharing is not in this version)
- One review per author per transaction (deferred P2)
- `#8A9AB5` small-text contrast (deferred P2; Figma colors stay)
