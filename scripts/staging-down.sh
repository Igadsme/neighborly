#!/bin/sh
# Stop the staging containers. Leaves the dev Postgres and Redis services running.
# Does not delete volumes. A dump in artifacts/backups/ is the way back for data.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)

if [ ! -f "$ROOT/.env.staging" ]; then
  echo "missing $ROOT/.env.staging" >&2
  exit 1
fi

docker compose --env-file "$ROOT/.env.staging" -f "$ROOT/docker-compose.yml" --profile staging stop \
  caddy api web staging-migrate minio-init minio staging-redis staging-postgres

echo "staging stopped"
