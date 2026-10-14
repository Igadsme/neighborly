#!/usr/bin/env bash
# Real-PostgreSQL integration tests for Milestone 2.
#
# Starts a DISPOSABLE PostgreSQL 16 container on localhost:55432,
# applies all Prisma migrations, runs the *.integration.spec.ts
# suite against it, and removes the container. It never touches
# the development Compose stack, staging, or any production host.
set -euo pipefail

CONTAINER="neighborly-m2-test"
PORT="55432"
DB_URL="postgresql://postgres:postgres@localhost:${PORT}/neighborly_m2"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=neighborly_m2 \
  -p "${PORT}:5432" \
  postgres:16 >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 || {
  echo "Disposable PostgreSQL did not become ready" >&2
  exit 1
}

cd "$(dirname "$0")/../backend"

# Verify the migration chain applies from a clean database.
DATABASE_URL="$DB_URL" pnpm exec prisma migrate deploy

NEIGHBORLY_TEST_DATABASE_URL="$DB_URL" pnpm exec jest --config jest.integration.config.cjs --runInBand
