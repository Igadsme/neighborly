#!/bin/sh
# Dump the staging Compose database (service staging-postgres, host port 5433).
# This does not dump the dev Postgres service named postgres.
# Usage: scripts/staging-backup.sh [output.dump]
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
OUT=${1:-"$ROOT/artifacts/backups/neighborly-staging-$(date -u +%Y%m%dT%H%M%SZ).dump"}
mkdir -p "$(dirname "$OUT")"

if [ ! -f "$ROOT/.env.staging" ]; then
  echo "missing $ROOT/.env.staging — run scripts/staging-up.sh first" >&2
  exit 1
fi

docker compose --env-file "$ROOT/.env.staging" -f "$ROOT/docker-compose.yml" --profile staging exec -T staging-postgres \
  pg_dump -U neighborly -d neighborly -Fc > "$OUT"
echo "$OUT"
