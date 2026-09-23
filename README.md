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

Start Postgres and Redis (no API container in this compose file):

```bash
docker compose up -d
docker compose ps
```

Wait until `postgres` reports healthy. Copy the committed template. The API reads `backend/.env`. Vite reads a repo-root `.env`.

```bash
cp env.example backend/.env
cp env.example .env
```

The API boots with `DATABASE_URL`, `JWT_SECRET` (at least 32 characters), and `CORS_ORIGIN`. `REDIS_URL`, `JWT_REFRESH_SECRET`, and the `S3_*` variables are optional until those clients exist.

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
