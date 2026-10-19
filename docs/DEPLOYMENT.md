# Deployment and Infrastructure Plan

## 1. Platform target

The first release should run as a modular monolith in a containerized environment with clearly separated services for the app tier, database, cache, and object storage.

The repository pins the intended local toolchain in `.mise.toml` (`node = "22"`, `pnpm = "10.34.3"`). The current host used for verification exposes Node 20.16, which is below Vite 8's supported 20.19+ minimum; use `mise install && mise use` or Node 22 before local development.

## 2. Required environment variables

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
S3_PUBLIC_URL=http://localhost:9000/neighborly-media

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

`docker-compose.yml` provides local Postgres, Redis, and RustFS S3-compatible storage (including automatic bucket/CORS setup by the API). Copy `backend/.env.example` to `backend/.env`, replace the local-only storage password with a strong value, and use the same username/password for `S3_ACCESS_KEY` and `S3_SECRET_KEY`. Start dependencies with `docker compose up -d`; run the NestJS API and Vite frontend from their package directories.

The local Compose services are:

- `postgres` – PostgreSQL with PostGIS extension
- `redis` – shared rate-limit state and readiness dependency
- `minio` – RustFS-backed S3-compatible object storage (the service name remains stable)

The production images are defined by `Dockerfile` and `backend/Dockerfile`. `compose.production.yml` wires those stateless images to externally managed PostgreSQL, Redis, and S3 services and refuses to start when required configuration is missing. Run `pnpm prisma:deploy` as a one-off release step before the API rollout; do not let every application replica race to apply migrations.

For a deployed environment, set S3-compatible endpoint, bucket, access key, secret, region, and public image URL to the provider/CDN values. Never reuse local MinIO credentials. The local bucket permits public reads for published listing images; configure the equivalent narrowly scoped read policy and browser CORS origins for the production app.

## 4. CI/CD expectations

- Run lint and unit tests on every PR
- Run Prisma migration validation before deploy
- Run database smoke checks and seed validation in staging environments
- Apply infrastructure changes via IaC or environment-managed deployment scripts
- Require a smoke test against the staging environment before production deploy

## 5. Production readiness checklist

- Postgres backups scheduled and tested
- Redis persistence and failover configured
- Object storage lifecycle rules set for uploaded images and documents
- Sentry DSN configured and error alerts enabled
- Stripe webhook ingress validated and secret-rotated
- Email provider integrated with transactional templates
- Mapbox token scoped to production domains only
- CORS, CSP, and security headers enabled
- Rate limiting active and tuned from observed traffic patterns

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
- Health checks: `/health`, `/ready`, and critical dependency liveness checks

This approach keeps the first release stable while leaving room for scaling and hardening as Neighborly expands its local marketplace and community platform.
