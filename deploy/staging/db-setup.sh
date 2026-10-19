#!/bin/sh
# Apply committed Prisma migrations, bootstrap production category reference
# data, then the idempotent local seed.
# Refuses any database host other than the staging Compose service.
set -eu

case "${DATABASE_URL:-}" in
  postgresql://*@staging-postgres:5432/*|postgres://*@staging-postgres:5432/*)
    ;;
  *)
    echo "staging db-setup refused: DATABASE_URL must target staging-postgres:5432" >&2
    exit 1
    ;;
esac

cd /app
# Call the binaries directly. NODE_ENV=production would hide devDependencies from `pnpm exec`.
migrate_attempt=1
while :; do
  if migrate_output=$(node ./node_modules/prisma/build/index.js migrate deploy 2>&1); then
    printf '%s\n' "$migrate_output"
    break
  fi

  printf '%s\n' "$migrate_output" >&2
  case "$migrate_output" in
    *P1001*|*"Can't reach database server"*|*ECONNREFUSED*)
      if [ "$migrate_attempt" -ge 30 ]; then
        echo "staging db-setup: database did not become reachable" >&2
        exit 1
      fi
      migrate_attempt=$((migrate_attempt + 1))
      sleep 2
      ;;
    *)
      exit 1
      ;;
  esac
done
# Reference data every environment needs: listings and requests cannot be
# created without categories. Idempotent upsert, no demo records.
node ./node_modules/tsx/dist/cli.mjs prisma/bootstrap.ts
node ./node_modules/tsx/dist/cli.mjs prisma/seed.ts
