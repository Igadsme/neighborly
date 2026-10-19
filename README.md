# Neighborly

Request-first local marketplace. The frontend is a Vite + React app. The API is a NestJS modular monolith using Prisma and PostgreSQL.

## Prerequisites

- Node.js 22 and pnpm 10.34.3 (pinned in `.mise.toml`)
- Docker, for Postgres and Redis

pnpm 10 does not run dependency lifecycle scripts unless they are allowlisted. `backend/package.json` allowlists `prisma`, `@prisma/client`, `@prisma/engines`, and `argon2` under `pnpm.onlyBuiltDependencies`, so `pnpm install` in `backend/` can download the Prisma engines and compile the Argon2 native binding. If a machine still skips those scripts, approve them explicitly before `prisma generate` or the API will fail to start:

```bash
cd backend
pnpm config set ignore-scripts false
pnpm approve-builds
pnpm install
```

## Run locally

Start Postgres, Redis, and local S3-compatible object storage (no API container in this compose file):

```bash
docker compose up -d
docker compose ps
```

Wait until `postgres` reports healthy. Copy the committed template. The API reads `backend/.env`. Vite reads a repo-root `.env`.

```bash
cp env.example backend/.env
cp env.example .env
```

The API boots with `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` (secrets must be at least 32 characters), `CORS_ORIGIN`, and the `S3_*` variables.

Backend:

```bash
cd backend
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm start:dev
```

The API listens on port 3000. Health is `GET http://localhost:3000/api/v1/health`. Swagger is `http://localhost:3000/docs`.

Frontend, from the repo root. `VITE_API_URL` defaults to `http://localhost:3000/api/v1` in the client when the variable is unset; set it in the root `.env` copied above, or inline:

```bash
pnpm install
VITE_API_URL=http://localhost:3000/api/v1 pnpm dev
```

Vite binds to `$PORT` or **8443** (`vite.config.ts`). `CORS_ORIGIN` in `env.example` matches that origin.

## Checks

```bash
# frontend
pnpm exec tsc --noEmit
pnpm build

# backend
cd backend
pnpm prisma:generate
pnpm exec tsc --noEmit
pnpm test
pnpm build
```

Run the live workflow after the dependency stack, migrations, seed, and built API are running:

```bash
cd backend
pnpm test:smoke
```

The smoke test creates isolated test users and verifies sessions, profiles, listings and image storage, saved searches, requests and offers, transactions, chat, reviews, notifications, community activity, reports, and blocking.

## Production containers

The root `Dockerfile` builds the static frontend on Node 22 and serves it from an unprivileged application port through Nginx. `backend/Dockerfile` builds the NestJS API on Node 22 and runs it as a non-root user. Both images include container health checks.

Apply migrations once per release before starting or rolling out API replicas:

```bash
docker compose -f compose.production.yml build backend
docker compose -f compose.production.yml run --rm backend pnpm prisma:deploy
docker compose -f compose.production.yml up -d
```

`compose.production.yml` intentionally requires production database, Redis, S3, JWT, public API URL, and CORS settings. It does not start disposable stateful services or contain fallback production secrets. Put TLS and request routing at the hosting platform or reverse proxy, schedule database backups, and use managed Redis/object storage for a real deployment.
