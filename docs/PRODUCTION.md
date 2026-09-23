# Production path (not executed)

**NOT LAUNCHED / NOT DEPLOYED.**

This file describes the public production path Phase 7 prepared. Nobody ran it. No domain was registered. No DNS record was changed. No paid host was purchased. Staging on this repository remains the verified environment.

Product Owner Imani Gad must approve a launch before any step below is executed. The decision list is in `docs/PHASE_7_PROD_PREP.md`. The checkbox form is `docs/LAUNCH_CHECKLIST.md`.

## What is verified today

Local Compose staging, recorded in `docs/PHASE_5_STAGING.md` and `docs/PHASE_6_STAGING_QA.md`:

| Piece | Staging today |
| --- | --- |
| How it starts | `scripts/staging-up.sh` and the Compose profile `staging` |
| Frontend | `https://staging.neighborly.localhost:8444/` |
| TLS | Caddy internal CA. Not a public certificate |
| API | Container `api`, loopback `http://127.0.0.1:3001`, `NODE_ENV=production` |
| Database | `staging-postgres` (PostGIS), host port 5433, database `neighborly` |
| Redis | `staging-redis`, host port 6380, AOF on |
| Object storage | MinIO on the Compose network. The API does not upload |
| Migrate and seed | `deploy/staging/db-setup.sh` refuses any host other than `staging-postgres`, then migrates and seeds |
| CI smoke | `.github/workflows/deploy-staging.yml` is manual. Phase 7 did not dispatch it |

Dev Postgres on port 5432 is a different volume. `scripts/backup-postgres.sh` dumps that database. `scripts/staging-backup.sh` dumps staging. Do not confuse them with production.

## What would change for a public production host

These rows are the intended difference. They are not a provisioned design, and they are not permission to buy the services.

| Concern | Staging (verified) | Public production (not built) |
| --- | --- | --- |
| Hostname | `staging.neighborly.localhost` on loopback | A name the product owner registers. DNS is a separate approval |
| TLS | Caddy internal CA on port 8444 | A public certificate on 443. Let's Encrypt needs that name and a host that answers on port 80 or 443. Do not reuse the staging CA |
| API exposure | Loopback plus Caddy | Private network only. The edge terminates TLS and proxies `/api/`. Do not publish the API port |
| `TRUST_PROXY` | `1`, because Caddy overwrites `X-Forwarded-For` | `1` only if the public edge overwrites `X-Forwarded-For` with the client address. Otherwise `0` |
| Client address | Docker bridge address at the Compose edge (Phase 6) | The real client address. Auth rate limits must not collapse to one shared IP |
| Postgres | Compose PostGIS 16, fixture password | Managed Postgres with PostGIS, private networking, provider backups. Empty database. No seed |
| Redis | Compose Redis, no TLS | `rediss://` unless the product owner accepts a private `redis://`. Required at boot |
| Object storage | Local MinIO fixture keys | A complete S3 set from the secret store, or all four values empty. Uploads are unwired, so empty is valid |
| Secrets | `.env.staging` on the operator machine, gitignored | Host secret store. Template: `env.production.example`. Never commit the filled file |
| Seed | Upsert of fixture users | Do not run `backend/prisma/seed.ts` |
| Images | Local tags `neighborly-api:staging` and `neighborly-web:staging` | A registry tag the product owner names. Push only behind `PRODUCTION_PUSH_IMAGES`, and only after the stub in this repo is replaced with a reviewed job |
| Observability | JSON logs on the operator machine | A log drain and alerts the product owner chooses. Sentry is not bundled |
| Deploy workflow | `deploy-staging.yml`, manual smoke on a runner | `deploy-production.yml`, manual, and it refuses. See below |

`NODE_ENV=production` is already how the staging API boots. Production mode is a boot policy (Redis, `TRUST_PROXY`, JWT rules, Helmet, Swagger off). It is not evidence that a public host exists.

## Boot rules the host must satisfy

`backend/src/common/config/env.validation.ts` fails the process before listen when these are wrong. `env.production.example` lists the same rules. Copying that file unchanged fails boot. That is intentional.

Required in every environment:

| Variable | Rule |
| --- | --- |
| `DATABASE_URL` | `postgresql://` or `postgres://` |
| `JWT_SECRET` | At least 32 characters |
| `CORS_ORIGIN` | Comma-separated absolute `http` or `https` origins. No `*`. No userinfo |

Also required when `NODE_ENV=production`:

| Variable | Rule |
| --- | --- |
| `REDIS_URL` | `redis://` or `rediss://` |
| `TRUST_PROXY` | `0` or `1` |
| `JWT_SECRET` | Must not be a placeholder and must not be low-diversity (fewer than 8 distinct characters) |

Also rejected:

- A partial S3 set. `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, and `S3_SECRET_KEY` are all set or all empty. `S3_REGION` defaults to `us-east-1` and is not part of that check.
- `SENTRY_DSN` that is not `https`.
- `JWT_REFRESH_SECRET`, if set, shorter than 32 characters. Refresh tokens are not issued.
- `MAX_UPLOAD_SIZE_MB` outside 1–10. No upload route is mounted.

The API does not read `APP_ENV`. Do not invent a second boot path for production. The frontend reads `VITE_API_URL` at image build time, not from the API process.

## Migrate, seed, and data

On the future host, after a backup exists and the product owner has approved the window:

1. Point `DATABASE_URL` at the empty production database.
2. Run `prisma migrate deploy` from a job that cannot see the staging Compose network.
3. Do not run `backend/prisma/seed.ts`.
4. Do not run `deploy/staging/db-setup.sh`. It seeds, and it exits unless the host is `staging-postgres`.
5. Do not restore a dev or staging dump into production. Those databases contain the fixture password `neighborly-local-seed` and, on staging, extra Phase 6 QA rows.

Migrations `0004_trust_safety` and `0005_query_indexes` are forward-only. Take a dump before the first migrate on a database you might want to undo. Restoring that dump is the data rollback.

## Promote path

This is the order to follow after approval. Phase 7 stops before step 4.

1. Merge to `main` only with `.github/workflows/ci.yml` green (frontend and backend typecheck, tests, and build).
2. Optional: dispatch `.github/workflows/deploy-staging.yml` to smoke Compose on a runner. Leave `STAGING_PUSH_IMAGES` unset unless an image push was explicitly approved. Phase 7 did not dispatch this workflow.
3. Product owner writes approval for a named host, domain, and secret store.
4. Only then change `.github/workflows/deploy-production.yml` so it targets that host. Until that change, dispatching it does not deploy.

The production workflow:

- Triggers on `workflow_dispatch` only. It does not run on pull request or on push.
- Asks the operator to type `PROMOTE`.
- Exits before any build, registry login, or remote command when `PRODUCTION_DEPLOY_ENABLED` is not the string `true`.
- When that variable is `true`, it still exits. No production target is configured in this repository.
- The image-push job runs only when both `PRODUCTION_DEPLOY_ENABLED` and `PRODUCTION_PUSH_IMAGES` are `true`. It does not log in to GHCR. It exits with a refusal. Leave both variables unset.

GitHub Environment `production` is the place for required reviewers. Create those reviewers before either variable is set. Do not put production secrets in the `staging` environment. The staging workflow generates a throwaway JWT and does not read `STAGING_JWT_SECRET`.

## Rollback on a future host

There is no production rollback script. Staging rollback does not apply.

When a host exists, the operator:

1. Keeps the previous API and web image tags.
2. Shifts traffic back to those tags.
3. Restores a production dump only if the migrate or a data change must be undone. Stop the API first.
4. Does not run `scripts/staging-rollback.sh` or `scripts/restore-postgres.sh` against that host. Those scripts select Compose service names.

Details and the commands that do exist are in `docs/INCIDENT_ROLLBACK.md`.

## Observability to wire later

Already in the process:

- `GET /api/v1/health` does not check dependencies.
- `GET /api/v1/ready` checks Postgres and, because production requires Redis, the Redis ping.
- JSON logs and `x-request-id`.
- `captureException` on 5xx. It writes a log line. It does not send the event anywhere.

Not purchased and not configured: a log drain, an alert route, Sentry, an error budget, or a status page. `docs/LAUNCH_CHECKLIST.md` lists the signals to alert on after the product owner picks a vendor.

## Out of this path

v1 does not call a model. Payments, Mapbox, email, and uploads are unwired. The Figma screens stay, including copy that mentions AI review or scam detection. That copy is not a capability. Share stays disabled. Do not add those services as part of standing up a host.
