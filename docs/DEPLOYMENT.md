# Deployment and Infrastructure Plan

## 1. Platform target

The first release should run as a modular monolith in a containerized environment with clearly separated services for the app tier, database, cache, and object storage.

The repository pins the intended local toolchain in `.mise.toml` (`node = "22"`, `pnpm = "10.34.3"`). The current host used for verification exposes Node 20.16, which is below Vite 8's supported 20.19+ minimum; use `mise install && mise use` or Node 22 before local development.

## 2. Required environment variables

Boot validation is `backend/src/common/config/env.validation.ts`. The committed template is `env.example`. Copy it to `backend/.env` and, for `VITE_API_URL`, to `.env` at the repo root. Do not commit those copies.

Required in every environment:

| Variable | Rule |
| --- | --- |
| `DATABASE_URL` | `postgresql://` or `postgres://` |
| `JWT_SECRET` | At least 32 characters |
| `CORS_ORIGIN` | Comma-separated absolute `http` or `https` origins. `*` is rejected |

Also required when `NODE_ENV=production`:

| Variable | Rule |
| --- | --- |
| `REDIS_URL` | `redis://` or `rediss://`. Shared rate-limit counters. |
| `TRUST_PROXY` | `1` or `0`. Use `1` only when the proxy overwrites `X-Forwarded-For`. |
| `JWT_SECRET` | Must not be a placeholder (`change-me`, `replace-with`, …) and must not be low-diversity. |

Optional variables and their defaults are listed in `env.example`. A partial S3 set (some of endpoint, bucket, access key, secret key) fails boot. `SENTRY_DSN`, when set, must be `https`. Payments, maps, refresh tokens, and object storage are not called by this release.

Production does not serve Swagger. The process does not set cookies. Access tokens travel in `Authorization: Bearer` only.

The block below is the older target inventory for services that are not wired yet. It is not the boot contract. Do not copy placeholder secrets into a production environment.

The application should include an environment file based on the following contract:

```env
NODE_ENV=development
PORT=3000
APP_NAME=neighborly
APP_URL=http://localhost:3000

# Postgres
DATABASE_URL=postgresql://neighborly:neighborly@postgres:5432/neighborly
POSTGRES_DB=neighborly
POSTGRES_USER=neighborly
POSTGRES_PASSWORD=neighborly

# Redis
REDIS_URL=redis://redis:6379

# Auth
JWT_SECRET=change-me
JWT_REFRESH_SECRET=change-me
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d

# S3 / object storage
S3_ENDPOINT=http://minio:9000
S3_BUCKET=neighborly-media
S3_ACCESS_KEY=neighborly
S3_SECRET_KEY=neighborly-secret
S3_REGION=us-east-1

# Maps
MAPBOX_TOKEN=replace-with-mapbox-token

# Email
RESEND_API_KEY=replace-with-resend-key
EMAIL_FROM=no-reply@neighborly.local

# Payments
STRIPE_SECRET_KEY=replace-with-stripe-secret
STRIPE_WEBHOOK_SECRET=replace-with-webhook-secret
STRIPE_CONNECT_CLIENT_ID=replace-with-client-id

# Error monitoring
SENTRY_DSN=replace-with-sentry-dsn

# WebSockets / app
SOCKET_CORS_ORIGIN=http://localhost:5173

# File uploads
MAX_UPLOAD_SIZE_MB=10
ALLOWED_IMAGE_TYPES=image/png,image/jpeg,image/webp

# Feature flags
ENABLE_COMMUNITY=true
ENABLE_PAYMENTS=true
ENABLE_MAPS=true
```

## 3. Containerized runtime

Use Docker Compose with the following services:

- `app` – NestJS API server
- `postgres` – PostgreSQL with PostGIS extension
- `redis` – cache, queue, rate-limit store, session cache
- `minio` – S3-compatible object storage
- `pgadmin` or `supabase` optional admin tool for local development

A simple deployment topology:

```yaml
services:
  app:
    build: .
    ports:
      - '3000:3000'
    env_file:
      - .env
    depends_on:
      - postgres
      - redis
      - minio

  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: neighborly
      POSTGRES_USER: neighborly
      POSTGRES_PASSWORD: neighborly
    ports:
      - '5432:5432'

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'

  minio:
    image: minio/minio
    command: server /data --console-address ':9001'
    environment:
      MINIO_ROOT_USER: neighborly
      MINIO_ROOT_PASSWORD: neighborly-secret
    ports:
      - '9000:9000'
      - '9001:9001'
```

## 4. CI/CD expectations

- Run lint and unit tests on every PR
- Run Prisma migration validation before deploy
- Run database smoke checks and seed validation in staging environments
- Apply infrastructure changes via IaC or environment-managed deployment scripts
- Require a smoke test against the staging environment before production deploy

## 5. Production readiness checklist

This checklist is not satisfied by Phase 4. Do not treat a green CI run as a production launch.

- Postgres backups scheduled and tested. Local Compose procedure: `scripts/backup-postgres.sh` and `scripts/restore-postgres.sh` (see below).
- Redis persistence and failover configured. Compose Redis runs with AOF so local counters survive a restart. Redis is not the source of truth. A lost Redis only resets rate-limit counters.
- Object storage lifecycle rules set for uploaded images and documents. No upload route is mounted yet.
- Sentry DSN configured and error alerts enabled. `captureException` logs today and is the forwarding hook. The SDK is not bundled.
- Stripe webhook ingress validated and secret-rotated. Payments are not wired.
- Email provider integrated with transactional templates. Email is not wired.
- Mapbox token scoped to production domains only. Maps are not wired.
- CORS, CSP, and security headers enabled. Helmet and an explicit CORS list are on. CSP and HSTS apply when `NODE_ENV=production`.
- Rate limiting active and tuned from observed traffic patterns. Defaults are in `backend/src/common/rate-limit.ts`. Production must set `REDIS_URL`.

### Postgres backup and restore (Compose)

Stop the API before a restore. Backup can run while the API is up.

```sh
scripts/backup-postgres.sh
scripts/restore-postgres.sh artifacts/backups/<dump-file>
```

The dump is PostgreSQL custom format (`pg_dump -Fc`). Files under `artifacts/backups/` are gitignored. A restore uses `pg_restore --clean --if-exists` into the existing `neighborly` database. Take a fresh dump before a restore you might want to undo. There is no point-in-time recovery in Compose. A hosted Postgres needs the provider's backup schedule and a tested restore; these scripts do not cover that.

### Health

- `GET /api/v1/health` is liveness. It does not check dependencies.
- `GET /api/v1/ready` runs `SELECT 1`. When `REDIS_URL` is set it also pings Redis. Postgres down or that ping failing returns 503. An empty `REDIS_URL` reports `redis: skipped` and can still be ready. Production boot does not allow an empty `REDIS_URL`.

### Logs and abuse signals

Logs are single-line JSON. `http.request` includes `requestId`, method, path, status, and duration. Query strings are not logged. `auth.login.failure` includes the email address; treat the drain as sensitive. `rate_limit.redis_fallback` means that process is counting in memory until it restarts. A burst of HTTP 429s on `auth.login` or `auth.register` is the auth-abuse signal. Per-user 429s are messaging, listings, offers, and reports.

`SLOW_QUERY_LOG=1` warns on Prisma queries at or above `SLOW_QUERY_MS` (default 200). The line includes SQL text with placeholders, not bound values. Leave it off unless you are investigating.

## 6. Release strategy

Use a simple staging-to-production path:

1. Local development with Docker Compose
2. CI validation on pull requests
3. Staging deployment with production-like environment variables
4. Manual or automated approval gate for release
5. Production deployment with rollback plan and database migration safety checks

## 7. Observability

- Structured logs: request id, user id, route, latency, and status code
- Metrics: listing creation, offer acceptance, message throughput, payment failures
- Alerts: DB connectivity, Redis health, S3 upload failures, payment webhook issues, elevated 5xx rates
- Health checks: `GET /api/v1/health` (liveness) and `GET /api/v1/ready` (Postgres, and Redis when `REDIS_URL` is set)

This approach keeps the first release stable while leaving room for scaling and hardening as Neighborly expands its local marketplace and community platform.
