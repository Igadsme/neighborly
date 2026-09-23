#!/bin/sh
# Apply committed Prisma migrations and the idempotent local seed.
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
node ./node_modules/prisma/build/index.js migrate deploy
node ./node_modules/tsx/dist/cli.mjs prisma/seed.ts
