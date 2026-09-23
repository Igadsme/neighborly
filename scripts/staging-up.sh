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

docker compose --env-file .env.staging --profile staging up -d --build --wait

echo "Staging is up"
echo "App:    https://staging.neighborly.localhost:8444/"
echo "Health: https://staging.neighborly.localhost:8444/api/v1/health"
echo "Ready:  https://staging.neighborly.localhost:8444/api/v1/ready"
echo "API:    http://127.0.0.1:3001/api/v1/health"
