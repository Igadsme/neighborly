#!/usr/bin/env bash
set -Eeuo pipefail

project="neighborly-qa-${GITHUB_RUN_ID:-local-$$}"
compose=(docker compose -p "$project" -f docker-compose.yml)
cleanup() { "${compose[@]}" down --remove-orphans >/dev/null 2>&1 || true; }
trap cleanup EXIT

"${compose[@]}" up -d postgres redis minio
for attempt in {1..30}; do
  if "${compose[@]}" exec -T postgres pg_isready -U neighborly -d neighborly >/dev/null 2>&1 && \
     "${compose[@]}" exec -T redis redis-cli ping >/dev/null 2>&1 && \
     curl -fsS http://127.0.0.1:9000/health >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    echo 'isolated services did not become healthy' >&2
    exit 1
  fi
  sleep 2
done

backup="${TMPDIR:-/tmp}/neighborly-${project}.dump"
"${compose[@]}" exec -T postgres pg_dump -U neighborly -d neighborly --format=custom > "$backup"
"${compose[@]}" exec -T postgres createdb -U neighborly neighborly_restore
cat "$backup" | "${compose[@]}" exec -T postgres pg_restore -U neighborly -d neighborly_restore --exit-on-error --no-owner
"${compose[@]}" exec -T postgres psql -U neighborly -d neighborly_restore -Atc 'SELECT 1' | grep -qx 1
rm -f "$backup"
echo 'Neighborly DevOps smoke test passed: isolated Docker services, health checks, and backup/restore verification.'
