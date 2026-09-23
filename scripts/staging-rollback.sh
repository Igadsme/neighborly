#!/bin/sh
# Roll the staging app tier back to the images tagged before the last staging-up.sh,
# and optionally restore a staging dump. Does not touch the dev postgres service.
#
# Usage:
#   scripts/staging-rollback.sh
#   scripts/staging-rollback.sh artifacts/backups/<staging-dump>
#
# Schema changes in 0004 and 0005 are forward-only. Restoring a dump taken
# before those migrations is the data rollback. Do not run prisma migrate
# against a production database from this script.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT"

if [ ! -f .env.staging ]; then
  echo "missing .env.staging — nothing to roll back" >&2
  exit 1
fi

compose() {
  docker compose --env-file .env.staging --profile staging "$@"
}

compose stop api web caddy

if [ "${1:-}" != "" ]; then
  if [ ! -f "$1" ]; then
    echo "dump not found: $1" >&2
    exit 1
  fi
  compose exec -T staging-postgres \
    pg_restore -U neighborly -d neighborly --clean --if-exists --no-owner < "$1"
  echo "restored $1"
fi

rolled=0
if docker image inspect neighborly-api:staging-previous >/dev/null 2>&1; then
  docker tag neighborly-api:staging-previous neighborly-api:staging
  rolled=1
fi
if docker image inspect neighborly-web:staging-previous >/dev/null 2>&1; then
  docker tag neighborly-web:staging-previous neighborly-web:staging
  rolled=1
fi

if [ "$rolled" -eq 0 ] && [ "${1:-}" = "" ]; then
  echo "no neighborly-api:staging-previous or neighborly-web:staging-previous image, and no dump was given" >&2
  exit 1
fi

compose up -d --no-build --wait api web caddy
echo "staging app tier restarted"
