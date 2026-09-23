#!/bin/sh
# Restore a custom-format dump from scripts/backup-postgres.sh into Compose Postgres.
# Usage: scripts/restore-postgres.sh path/to/neighborly.dump
# Stop the API first. This replaces objects in the neighborly database.
# The database itself must already exist (Compose creates it on first boot).
set -eu
if [ $# -ne 1 ]; then
  echo "usage: scripts/restore-postgres.sh path/to/dump" >&2
  exit 1
fi
ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
DUMP=$1
if [ ! -f "$DUMP" ]; then
  echo "dump not found: $DUMP" >&2
  exit 1
fi
docker compose -f "$ROOT/docker-compose.yml" exec -T postgres \
  pg_restore -U neighborly -d neighborly --clean --if-exists --no-owner < "$DUMP"
echo "restored $DUMP"
