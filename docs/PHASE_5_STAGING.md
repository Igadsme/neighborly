# Phase 5 — Staging deployment

Completion record for branch `cursor/phase5-staging-e5f6`. **Release readiness is not claimed.** Nothing here was deployed to production. No domain was registered. No DNS record was changed. No paid host was purchased. Phase 7 stays blocked until the product owner approves it.

Base: `8564a0a` (`feat: Phase 4 security and reliability hardening`).

## What staging is

Staging is a Docker Compose profile on an operator machine. It runs the frontend, the API, its own PostGIS database, its own Redis, and MinIO. Caddy terminates HTTPS with its internal CA. The dev Postgres service (`localhost:5432`) is a different database and was not migrated by this profile.

Public HTTPS is not part of this delivery. A hostname on the public internet needs a domain and DNS, and this phase did not buy or change either. The Compose stack is the staging environment.

## How to run it

From `/Volumes/T7 Shield/Projects/neighborly`, with Docker running and Node 22 available for anything outside the containers:

```sh
scripts/staging-up.sh
```

The script copies `env.staging.example` to `.env.staging` when that file is missing, writes a staging-only `JWT_SECRET` into it when the value is empty, and starts the profile. `.env.staging` is gitignored. The secret is not printed.

Stop staging without stopping the dev database:

```sh
scripts/staging-down.sh
```

`docker compose down` and `docker compose down -v` also stop and, with `-v`, delete the dev Postgres volume. Do not use them on a machine that still needs the dev database. The GitHub Actions job runs `down -v` only on an ephemeral runner.

## URLs

| Surface | URL |
| --- | --- |
| Frontend | `https://staging.neighborly.localhost:8444/` |
| Liveness | `https://staging.neighborly.localhost:8444/api/v1/health` |
| Readiness | `https://staging.neighborly.localhost:8444/api/v1/ready` |
| API on loopback, no TLS | `http://127.0.0.1:3001/api/v1/health` |
| MinIO API | `http://127.0.0.1:9000` |
| MinIO console | `http://127.0.0.1:9001` |
| Staging Postgres | `127.0.0.1:5433` (database `neighborly`) |
| Staging Redis | `127.0.0.1:6380` |

`staging.neighborly.localhost` resolves to loopback. The certificate is Caddy's local CA, not a public certificate. Trust it for a client that must verify TLS:

```sh
docker compose --env-file .env.staging --profile staging exec -T caddy \
  cat /data/caddy/pki/authorities/local/root.crt > /tmp/neighborly-staging-caddy-root.crt
curl --cacert /tmp/neighborly-staging-caddy-root.crt \
  --resolve staging.neighborly.localhost:8444:127.0.0.1 \
  https://staging.neighborly.localhost:8444/api/v1/ready
```

Do not commit that certificate. Browsers will warn until the CA is trusted. `curl -k` skips verification.

The API process uses `NODE_ENV=production`, so boot requires `REDIS_URL`, `TRUST_PROXY=1`, and a JWT that is not a placeholder. Swagger is off. `GET /docs` on port 3001 returns 404. Caddy sends `/docs` to the frontend, which returns the SPA shell; that is not Swagger.

## Migrations and seed

`deploy/staging/db-setup.sh` runs inside the `staging-migrate` container after `staging-postgres` is healthy. It refuses a `DATABASE_URL` whose host is not `staging-postgres`. Then it runs `prisma migrate deploy` and `backend/prisma/seed.ts`.

The seed upserts. It does not delete rows. Re-running it puts the fixture rows back and leaves other rows in place. Every seed user shares the local fixture password `neighborly-local-seed`. Emails are `seed.<firstname>@example.com`. That password is not a production credential. Do not point this script at a production database.

Checked on this machine on 23 Sep 2026:

| Check | Result |
| --- | --- |
| Migrations on `staging-postgres` | `0001_init`, `0002_onboarding`, `0003_verticals`, `0004_trust_safety`, `0005_query_indexes` |
| Seed | 15 `Category` rows, 9 `User` rows, 10 `Listing` rows |
| Dev Postgres on port 5432 | Still only `0001_init`, `0002_onboarding`, `0003_verticals`. It was not migrated. |

## Health on this machine

`scripts/staging-up.sh` exited 0. Containers `api`, `web`, `caddy`, `minio`, `staging-postgres`, and `staging-redis` were healthy. `staging-migrate` and `minio-init` exited 0.

| Request | Result |
| --- | --- |
| `GET http://127.0.0.1:3001/api/v1/health` | 200, `status: ok`, `service: neighborly-api` |
| `GET http://127.0.0.1:3001/api/v1/ready` | 200, `postgres: up`, `redis: up` |
| `GET https://staging.neighborly.localhost:8444/api/v1/health` | 200 through Caddy, verified with the local CA |
| `GET https://staging.neighborly.localhost:8444/api/v1/ready` | 200, `postgres: up`, `redis: up` |
| `GET https://staging.neighborly.localhost:8444/healthz` | 200 `ok` from the frontend nginx |
| Frontend bundle | `/assets/index-SSmwlnOl.js` contains `https://staging.neighborly.localhost:8444/api/v1` |
| `GET /api/v1/categories` on that origin | 200, includes `Furniture` and the other seed categories |
| `GET /api/v1/listings?limit=1` on that origin | 200, includes the seeded listing "Walnut mid-century dining table" |
| `GET http://127.0.0.1:3001/docs` | 404 |
| MinIO | bucket `neighborly-media` created |

The PostGIS image is `linux/amd64`. This Mac is `linux/arm64`. Docker ran it under emulation. The same image was already the dev database image.

Starting the staging profile also reconciles services that have no profile. On this run the dev Redis container was recreated so it matched the committed `--appendonly yes` command. The dev Postgres container was left running. Staging does not use those two containers.

## Rollback

Take a dump before a change you might want to undo:

```sh
scripts/staging-backup.sh
```

The file lands in `artifacts/backups/` and is gitignored. The script dumps `staging-postgres` only.

Roll back the app images tagged by the previous `scripts/staging-up.sh`, and optionally restore a dump:

```sh
scripts/staging-rollback.sh
scripts/staging-rollback.sh artifacts/backups/<dump>
```

`staging-up.sh` tags the current `neighborly-api:staging` and `neighborly-web:staging` images as `:staging-previous` before it builds. Rollback retags those previous images and starts `api`, `web`, and `caddy` again with `--no-build`.

`0004_trust_safety` and `0005_query_indexes` are forward-only. This phase does not run a down migration. Restoring a dump taken before `staging-migrate` is the data rollback. Stop the API first; `scripts/staging-rollback.sh` stops `api`, `web`, and `caddy` before `pg_restore`. Redis is not source data. Losing it resets rate-limit counters.

To leave the machine:

```sh
scripts/staging-down.sh
```

## CI

`.github/workflows/ci.yml` is unchanged. It still runs the frontend and backend jobs on pull requests.

`.github/workflows/deploy-staging.yml` is manual (`workflow_dispatch`). It builds the same Compose profile on the runner, checks `/health`, `/ready`, the frontend bundle, and a seeded category, then deletes the runner's volumes. It does not deploy to a public host.

The job uses the GitHub Environment named `staging`. The smoke job does not read a secret from that environment. It generates a throwaway JWT on the runner. Set the repository variable `STAGING_PUSH_IMAGES` to `true` to also push `neighborly-api` and `neighborly-web` to GHCR. Leave it unset. No production secret belongs in that environment.

Secret names, if a long-lived host is approved later:

| Name | Where | Now |
| --- | --- | --- |
| `JWT_SECRET` | `.env.staging` on the operator machine | Generated locally. Not committed. |
| `STAGING_JWT_SECRET` | GitHub Environment `staging` | Not read by the current workflow. Do not create it until a host needs it. |
| `STAGING_PUSH_IMAGES` | Repository variable | Unset. `true` pushes images to GHCR. |

## Blocked on the product owner

- A public hostname and DNS. No domain was registered. No DNS was changed.
- A public certificate. Let's Encrypt needs that hostname and a host that answers on port 80 or 443. Caddy's internal CA is the HTTPS this phase delivers.
- Any paid database, cache, object store, or app host. MinIO in Compose is the staging object store. The API does not upload yet. The S3 settings in `env.staging.example` are local fixtures so boot validation sees a complete set.
- Production deploy. Do not start it from this branch.

## Not claimed

This staging stack is not a release. Payments, maps, email, and uploads are still unwired. The seed password is a fixture. The TLS certificate is local. CI on the pull request does not, by itself, mean the product can launch.
