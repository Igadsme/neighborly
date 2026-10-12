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
node ./node_modules/prisma/build/index.js migrate deploy
# Reference data every environment needs: listings and requests cannot be
# created without categories. Idempotent upsert, no demo records.
node ./node_modules/tsx/dist/cli.mjs prisma/bootstrap.ts
node ./node_modules/tsx/dist/cli.mjs prisma/seed.ts
