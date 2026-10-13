#!/usr/bin/env bash
#
# Builds a "legacy" database that represents an installation created BEFORE
# Milestone 8: the migration chain applied through 0011, with real review
# records already present.
#
# This is the state that makes the 0012 migration fail, and it is the state
# this milestone's repair has to be proven against. It is used only against a
# disposable database.
#
#   DB=m11_legacy ./scripts/make-legacy-db.sh
set -euo pipefail

DB="${DB:-m11_legacy}"
CONTAINER="${CONTAINER:-neighborly-postgres-1}"
MIGRATIONS="$(cd "$(dirname "$0")/../backend/prisma/migrations" && pwd)"

sql() { docker exec -i "$CONTAINER" psql -U neighborly -d "$DB" -q -c "$1"; }

docker exec "$CONTAINER" psql -U neighborly -d postgres -c "DROP DATABASE IF EXISTS \"$DB\";" >/dev/null
docker exec "$CONTAINER" psql -U neighborly -d postgres -c "CREATE DATABASE \"$DB\";" >/dev/null

# Apply the chain up to and including 0011 only. Prisma always applies every
# pending migration, so the state is built directly from the SQL files.
for m in 0001_init 0002_onboarding 0003_verticals 0004_trust_safety \
         0005_query_indexes 0006_transaction_offer_unique 0007_auth_accounts \
         0008_marketplace_search 0009_requests_matching 0010_notifications \
         0011_neighborly_borrow; do
  docker exec -i "$CONTAINER" psql -U neighborly -d "$DB" -q < "$MIGRATIONS/$m/migration.sql"
done

# Legacy accounts, listing, transaction and two reviews written before 0012.
# The two reviews have distinct createdAt values so the backfill can be shown to
# preserve each row's own timestamp rather than stamping both with "now".
sql "
INSERT INTO \"User\" (id,email,\"passwordHash\",status,\"createdAt\",\"updatedAt\") VALUES
 ('40000000-0000-4000-8000-000000000001','legacy.a@example.com','x','ACTIVE',now(),now()),
 ('40000000-0000-4000-8000-000000000002','legacy.b@example.com','x','ACTIVE',now(),now());
INSERT INTO \"Category\" (id,name,slug,\"createdAt\") VALUES
 ('60000000-0000-4000-8000-000000000001','Tools','tools',now());
INSERT INTO \"Listing\" (id,\"categoryId\",\"sellerId\",title,description,status,\"createdAt\",\"updatedAt\") VALUES
 ('50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001','Legacy item','A thing','PUBLISHED',now(),now());
INSERT INTO \"Transaction\" (id,status,\"createdAt\",\"updatedAt\") VALUES
 ('70000000-0000-4000-8000-000000000001','COMPLETED',now(),now());
INSERT INTO \"Review\" (id,\"transactionId\",\"authorId\",\"subjectId\",rating,body,\"createdAt\") VALUES
 ('80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002',
  5,'Great neighbour','2026-01-15 10:30:00'),
 ('80000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001',
  4,'Helpful and quick','2026-02-20 14:45:00');
"

echo "Legacy database '$DB' is at 0011 with:"
docker exec "$CONTAINER" psql -U neighborly -d "$DB" -t -c \
  "SELECT COUNT(*) FROM \"Review\";" | sed 's/^/  reviews: /'