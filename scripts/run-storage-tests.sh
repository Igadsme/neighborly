#!/usr/bin/env bash
# Real-PostgreSQL + real-object-storage integration tests for Milestone 4.
#
# Starts a DISPOSABLE PostGIS 16 container on localhost:55435 and a
# DISPOSABLE S3-compatible object store (rustfs, the MinIO API) on
# localhost:59000, applies all Prisma migrations, runs the storage suite
# against both, and removes both containers on exit.
#
# It never touches the development Compose stack, the staging rustfs volume, or any
# production host. Object storage is proven through the S3 API, so the
# storage code is identical whether the backend runs against this container
# or against a production bucket.
set -euo pipefail

PG_CONTAINER="neighborly-m4-pg"
S3_CONTAINER="neighborly-m4-s3"
PG_PORT="55435"
S3_PORT="59000"
BUCKET="neighborly-m4-media"
DB_URL="postgresql://postgres:postgres@localhost:${PG_PORT}/neighborly_m4"
PG_IMAGE="${PG_IMAGE:-postgis/postgis:16-3.4}"
S3_ACCESS_KEY="neighborly-m4-local"
S3_SECRET_KEY="neighborly-m4-local-only"

# Override S3_IMAGE only to point at another real S3-compatible server.
# CI and the staging Compose profile pin rustfs/rustfs:1.0.1. `minio/minio`
# was withdrawn from Docker Hub and quay.io/minio is not anonymously
# pullable, so this script does not default to either. The adapter only uses
# PutObject, GetObject, DeleteObject and ListObjectsV2.
S3_IMAGE="${S3_IMAGE:-rustfs/rustfs:1.0.1}"

cleanup() {
  docker rm -f "$PG_CONTAINER" "$S3_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! docker image inspect "$S3_IMAGE" >/dev/null 2>&1; then
  echo "Pulling object storage image $S3_IMAGE" >&2
  docker pull "$S3_IMAGE" >/dev/null
fi

docker rm -f "$PG_CONTAINER" "$S3_CONTAINER" >/dev/null 2>&1 || true

if ! docker image inspect "$PG_IMAGE" >/dev/null 2>&1; then
  echo "Pulling database image $PG_IMAGE" >&2
  docker pull "$PG_IMAGE" >/dev/null
fi

docker run -d --name "$PG_CONTAINER" \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=neighborly_m4 \
  -p "${PG_PORT}:5432" \
  "$PG_IMAGE" >/dev/null

docker run -d --name "$S3_CONTAINER" \
  -e RUSTFS_ACCESS_KEY="$S3_ACCESS_KEY" \
  -e RUSTFS_SECRET_KEY="$S3_SECRET_KEY" \
  -p "127.0.0.1:${S3_PORT}:9000" \
  "$S3_IMAGE" >/dev/null

for _ in $(seq 1 30); do
  if docker exec "$PG_CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker exec "$PG_CONTAINER" pg_isready -U postgres >/dev/null 2>&1 || {
  echo "Disposable PostgreSQL did not become ready" >&2
  exit 1
}

ready=0
for _ in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:${S3_PORT}/minio/health/live" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
done
if [ "$ready" -ne 1 ]; then
  echo "Disposable object storage did not become ready" >&2
  exit 1
fi

cd "$(dirname "$0")/../backend"

# Generate the Prisma client on clean runners before applying migrations or
# compiling storage integration specs.
DATABASE_URL="$DB_URL" pnpm exec prisma generate >/dev/null

# Verify the migration chain applies from a clean database.
DATABASE_URL="$DB_URL" pnpm exec prisma migrate deploy >/dev/null

# The bucket is created through the same S3 client the application uses, so
# no separate provisioning tool is required.
S3_BUCKET_NAME="$BUCKET" S3_ENDPOINT_URL="http://127.0.0.1:${S3_PORT}" \
S3_ACCESS_KEY_ID="$S3_ACCESS_KEY" S3_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
  node -e '
const { S3Client, CreateBucketCommand } = require("@aws-sdk/client-s3")
const client = new S3Client({
  region: "us-east-1",
  endpoint: process.env.S3_ENDPOINT_URL,
  forcePathStyle: true,
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
})
client.send(new CreateBucketCommand({ Bucket: process.env.S3_BUCKET_NAME }))
  .then(() => process.stdout.write("bucket ready\n"))
  .catch(error => {
    if (error.name === "BucketAlreadyOwnedByYou") process.stdout.write("bucket ready\n")
    else { process.stderr.write(String(error) + "\n"); process.exit(1) }
  })
'

NEIGHBORLY_TEST_DATABASE_URL="$DB_URL" \
NEIGHBORLY_TEST_S3_ENDPOINT="http://127.0.0.1:${S3_PORT}" \
NEIGHBORLY_TEST_S3_BUCKET="$BUCKET" \
NEIGHBORLY_TEST_S3_ACCESS_KEY="$S3_ACCESS_KEY" \
NEIGHBORLY_TEST_S3_SECRET_KEY="$S3_SECRET_KEY" \
  pnpm exec jest --config jest.storage.config.cjs --runInBand --testPathPattern 'storage'
