#!/bin/sh
# Dump the Compose Postgres database to a custom-format file.
# Usage: scripts/backup-postgres.sh [output.dump]
# The API should keep running; pg_dump does not need an exclusive lock for a consistent snapshot.
# Dumps land in artifacts/backups/ and are gitignored. Do not commit them.
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
OUT=${1:-"$ROOT/artifacts/backups/neighborly-$(date -u +%Y%m%dT%H%M%SZ).dump"}
mkdir -p "$(dirname "$OUT")"
docker compose -f "$ROOT/docker-compose.yml" exec -T postgres \
  pg_dump -U neighborly -d neighborly -Fc > "$OUT"
echo "$OUT"
