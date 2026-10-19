#!/bin/sh
# Build and start the Compose staging profile.
# Creates .env.staging from env.staging.example when it is missing.
# Writes a staging-only JWT_SECRET into that gitignored file when it is empty.
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running" >&2
  exit 1
fi

# This volume writes AppleDouble files. BuildKit fails when it cannot read their xattrs.
export COPYFILE_DISABLE=1
find "$ROOT" \( -path '*/node_modules/*' -o -path '*/.git/*' \) -prune -o -name '._*' -exec rm -f {} +

if [ ! -f .env.staging ]; then
  cp env.staging.example .env.staging
fi

current=$(grep '^JWT_SECRET=' .env.staging | head -1 | cut -d= -f2- || true)
folded=$(printf '%s' "$current" | tr '[:upper:]' '[:lower:]')
case "$folded" in
  ""|change-me*|replace-with*|changeme*|jwt_secret|secret|password|neighborly)
    secret=$(openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-48)
    if [ "${#secret}" -lt 32 ]; then
      echo "could not generate a staging JWT_SECRET" >&2
      exit 1
    fi
    tmp=$(mktemp)
    awk -v secret="$secret" '
      BEGIN { done = 0 }
      /^JWT_SECRET=/ && done == 0 { print "JWT_SECRET=" secret; done = 1; next }
      { print }
      END { if (done == 0) print "JWT_SECRET=" secret }
    ' .env.staging > "$tmp"
    mv "$tmp" .env.staging
    chmod 600 .env.staging
    ;;
esac

if docker image inspect neighborly-api:staging >/dev/null 2>&1; then
  docker tag neighborly-api:staging neighborly-api:staging-previous
fi
if docker image inspect neighborly-web:staging >/dev/null 2>&1; then
  docker tag neighborly-web:staging neighborly-web:staging-previous
fi

docker compose --env-file .env.staging --profile staging up -d --build

# One-shot containers exit 0. `up --wait` treats that as a failure, so poll instead.
echo "Waiting for staging HTTPS"
i=0
while [ "$i" -lt 40 ]; do
  ready=$(curl -kfsS --resolve staging.neighborly.localhost:8444:127.0.0.1 https://staging.neighborly.localhost:8444/api/v1/ready 2>/dev/null || true)
  page=$(curl -kfsS --resolve staging.neighborly.localhost:8444:127.0.0.1 https://staging.neighborly.localhost:8444/healthz 2>/dev/null || true)
  migrate_id=$(docker compose --env-file .env.staging --profile staging ps -aq staging-migrate 2>/dev/null || true)
  bucket_id=$(docker compose --env-file .env.staging --profile staging ps -aq minio-init 2>/dev/null || true)
  migrate_state=""
  bucket_state=""
  if [ -n "$migrate_id" ]; then
    migrate_state=$(docker inspect "$migrate_id" --format '{{.State.Status}} {{.State.ExitCode}}')
  fi
  if [ -n "$bucket_id" ]; then
    bucket_state=$(docker inspect "$bucket_id" --format '{{.State.Status}} {{.State.ExitCode}}')
  fi
  if printf '%s' "$ready" | grep -q '"redis":"up"' \
    && printf '%s' "$page" | grep -q '^ok' \
    && [ "$migrate_state" = "exited 0" ] \
    && [ "$bucket_state" = "exited 0" ]
  then
    echo "Staging is up"
    echo "App:    https://staging.neighborly.localhost:8444/"
    echo "Health: https://staging.neighborly.localhost:8444/api/v1/health"
    echo "Ready:  https://staging.neighborly.localhost:8444/api/v1/ready"
    echo "API:    http://127.0.0.1:3001/api/v1/health"
    exit 0
  fi
  i=$((i + 1))
  sleep 3
done

echo "staging did not become ready" >&2
docker compose --env-file .env.staging --profile staging logs --no-color --tail 80 staging-migrate api caddy minio-init >&2 || true
exit 1
