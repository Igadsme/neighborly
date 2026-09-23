# Incident and rollback runbook

**NOT LAUNCHED / NOT DEPLOYED.** This is an internal preparation note. It does not page anyone, and it is not a public status page. Product Owner Imani Gad approves any message that leaves the team. Phase 7 did not declare an incident and did not roll anything back.

The only environments this repository can operate are local dev Compose and the staging Compose profile. Production commands are not in this runbook because no production host exists. Do not point the scripts below at a hosted database.

## Roles

| Role | During an incident |
| --- | --- |
| Product Owner (Imani Gad) | Approves user-facing communication. Approves any production step. This runbook does not contact her automatically |
| Atlas (CTO) | Holds merge. Coordinates the technical response on the environment that is actually up |
| Operator | Runs the Compose scripts below on the machine that hosts dev or staging. Does not register a domain or change DNS as part of a response |

No on-call vendor, phone tree, or status hostname was set up.

## Severity

Use these labels in the internal note. They are not a paging policy.

| Level | Example | First move |
| --- | --- | --- |
| Sev-1 | Staging or a future production host is down for everyone, or data is being destroyed | Stop the API. Stop writes. Take a dump if the database is still up. Tell the product owner before any public sentence |
| Sev-2 | Sign-in, messaging, or readiness is failing for many people. `/ready` is 503 | Confirm Postgres and Redis. Leave the app on the last good image if a deploy just went out |
| Sev-3 | One account, a bad row, or a rate-limit false positive | Do not roll the whole stack back. Suspend and restore already exist in the API (`docs/PHASE_6_STAGING_QA.md`) |

A local Compose outage on an operator laptop is Sev-3 unless that stack is the one a reviewer is using.

## Source of truth

| Store | Role | If it is lost |
| --- | --- | --- |
| Postgres | Users, listings, messages, transactions, reports | Restore a dump. There is no point-in-time recovery on Compose |
| Redis | Rate-limit counters | Counters reset. Do not treat Redis as a backup of the database |
| MinIO on staging | Empty media bucket. No upload route writes it | Recreate the bucket. Do not restore it as user data |
| Browser `localStorage` token | Access token only | The user signs in again. No server session table exists |

`auth.login.failure` logs include the email address. Do not paste raw logs into a public channel.

## Signals already in the API

- `GET /api/v1/health` — process is up. It does not prove Postgres or Redis.
- `GET /api/v1/ready` — Postgres `SELECT 1`. When `REDIS_URL` is set, a Redis ping. Failure is 503.
- `rate_limit.redis_fallback` — that process is counting in memory until restart. `/ready` stays 503 while the ping fails.
- HTTP 429 on `auth.login` or `auth.register` — auth-abuse signal, or one shared client address (see rate limits below).
- `x-request-id` on the response matches `http.request` in the JSON log. Query strings are not logged.

`captureException` writes a JSON line. It does not open a Sentry issue. Leave `SENTRY_DSN` empty until the SDK is added.

## Staging incident (the host that exists)

Staging URL: `https://staging.neighborly.localhost:8444/`. TLS is Caddy's internal CA. The API on loopback is `http://127.0.0.1:3001`.

1. Read `/api/v1/ready` on loopback and through Caddy.
2. If Postgres is healthy and the bad change is the app image, roll the app back. Do not restore a dump.
3. If the data is wrong, take a fresh dump first, then restore an older staging dump.
4. Do not run `docker compose down -v` on a machine that still needs the dev Postgres volume. That command deletes it. Use `scripts/staging-down.sh` to stop staging and leave dev running.

### Backup

Dev database (Compose service `postgres`, port 5432):

```sh
scripts/backup-postgres.sh
```

Staging database (Compose service `staging-postgres`, port 5433). Requires `.env.staging`:

```sh
scripts/staging-backup.sh
```

Both write a custom-format dump under `artifacts/backups/`. That directory is gitignored. Do not commit the file. Phase 4 drilled the dev script into a side database. Phase 6 drilled `scripts/staging-backup.sh` into `neighborly_p6_restore` and dropped that database. Neither drill restored over the live `neighborly` database.

### App rollback (staging)

`scripts/staging-up.sh` tags the current `neighborly-api:staging` and `neighborly-web:staging` images as `:staging-previous` before it builds. Rollback retags those previous images and starts `api`, `web`, and `caddy` with `--no-build`. Postgres, Redis, and MinIO keep running.

```sh
scripts/staging-rollback.sh
```

Phase 6 ran this with no dump, saw the previous image come back, then started the fixed images again with `--no-build`.

### Data rollback (staging)

Stop is inside the script. It stops `api`, `web`, and `caddy`, restores the dump into staging `neighborly`, then starts those three services from the previous images when those tags exist.

```sh
scripts/staging-rollback.sh artifacts/backups/<staging-dump>
```

`0004_trust_safety` and `0005_query_indexes` are forward-only. Restoring a dump taken before `staging-migrate` is the schema rollback. Do not write a down migration during the incident.

### Data rollback (dev)

Stop the API first. This script targets the dev `postgres` service, not staging.

```sh
scripts/restore-postgres.sh artifacts/backups/<dump>
```

It runs `pg_restore --clean --if-exists` into the existing `neighborly` database. The database must already exist.

## Production incident (do not execute)

No production host, database, or DNS name exists. When one does, after the product owner has approved it:

1. Shift traffic to the previous image tags retained on that host. `scripts/staging-rollback.sh` will not do this. It only retags local Compose images.
2. If data must be undone, restore the provider dump into the production database only after the API is stopped and a fresh dump of the broken state is stored. Do not use `scripts/restore-postgres.sh` or `scripts/staging-backup.sh`. Those compose files select `postgres` and `staging-postgres`.
3. Do not run `deploy/staging/db-setup.sh`. It seeds fixture users and refuses every host except `staging-postgres`.
4. Do not re-run `backend/prisma/seed.ts`. The fixture password is `neighborly-local-seed`.
5. Redis does not need a restore.
6. Tell the product owner. Do not announce from this document.

Provider backups and a restore drill are still blocked. The drill plan is in `docs/LAUNCH_CHECKLIST.md`. Phase 7 did not run it.

## Rate limits while responding

Auth limits key on the client address. With `TRUST_PROXY=1`, that address is the first `X-Forwarded-For` hop, and only when the proxy overwrites the header.

On Compose staging, Caddy replaces the header and every browser on the machine shares the Docker bridge bucket (`authLogin:172.20.0.1` in Phase 6). A burst of 429s there can be one operator, not an internet attack. The loopback port `127.0.0.1:3001` trusts a client-supplied forwarding header. Do not publish it.

Raising `RATE_LIMIT_AUTH_LOGIN` during an incident is a product-owner decision. The default is 10 attempts per 15 minutes.

## After the incident

Write what broke, which script ran, and which dump was kept. Do not claim a production rollback occurred unless a production host existed and the product owner approved the action. Phase 7 has nothing to record on that line.
