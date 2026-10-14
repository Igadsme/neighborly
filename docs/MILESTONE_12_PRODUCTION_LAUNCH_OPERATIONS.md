# Milestone 12 — Production Launch & Operations Readiness

Branch: `milestone12-production-launch-operations`, branched from the Milestone 11
commit (`1866764`).

**Status: PREPARED — AWAITING LAUNCH APPROVAL.**

Nothing was deployed. No DNS was changed, no paid service was activated, no
remote environment was touched, and no launch was announced. Everything below is
preparation and locally verified against a production-like build.

---

## 1. Production architecture

The repository already ships a staging profile (`docker-compose.yml` with the
`staging` profile) plus `deploy/staging/` Dockerfiles and a Caddy reverse proxy.
Milestone 12 adopts that topology rather than introducing a new one.

```
                    ┌──────────────────────────────┐
   client ─HTTPS──▶ │ Caddy (TLS, static SPA,     │
                    │  /api and /socket.io → api) │
                    └───────────────┬──────────────┘
                                    │
                    ┌───────────────▼──────────────┐
                    │ NestJS API                   │
                    │  · REST under /api/v1        │
                    │  · Socket.IO at /realtime    │
                    │  · background pollers        │
                    └──────┬───────────────┬────────┘
                           │               │
              ┌────────────▼─────┐   ┌─────▼──────────────┐
              │ PostgreSQL 16    │   │ Redis 7            │
              │ + PostGIS        │   │ rate-limit counters│
              └──────────────────┘   └────────────────────┘

                    ┌──────────────────────────────┐
                    │ S3-compatible object storage  │
                    │ listing images, private       │
                    └──────────────────────────────┘
```

### Network boundaries

- **Public:** Caddy terminates TLS and is the only ingress.
- **Private:** PostgreSQL, Redis and object storage are reachable only from the
  application network. The staging profile binds them to `127.0.0.1`.
- **Browser → API:** the SPA calls the API through the same origin
  (`/api/v1`), so there is no cross-origin credentialed request in production.
  CORS is configured as an explicit allowlist regardless, and the app **refuses
  `*`** — the refresh cookie is credentialed, so a wildcard origin would leak it.

### Database connectivity

- Single primary. No read replicas; the application assumes one writer.
- `DATABASE_URL` must include `?schema=public` so Prisma selects the right
  schema.
- Connection pooling is left to the platform. Prisma's pool size is not set in
  code, so a managed pooler (PgBouncer or equivalent) is the intended topology.
  See *Limitations*.

### Storage access

The API is the only principal that talks to object storage. The browser never
receives bucket credentials; it receives object keys that the API resolves.
Uploads are validated by **detecting** the content type server-side rather than
trusting the client's `Content-Type`, and the byte limit is enforced in the
service.

### Worker execution

Background workers (`NotificationDispatcher`, `NotificationWorker`,
`SavedSearchAlertWorker`) run **inside the API process** as pollers over durable
tables. They are deliberately in-process, not a separate deployment: the work is
recovered from the `PENDING` rows themselves, so a missed tick is picked up by
the next one.

**Consequence:** with more than one API replica, every replica runs the pollers.
That is safe for correctness — the drains are claim-based and idempotent — but it
multiplies database load by the replica count. See *Limitations*.

### Realtime messaging — a real single-instance constraint

`MessagingGateway` emits through the in-process Socket.IO server only. **There is
no Redis adapter**, and `@socket.io/redis-adapter` is not a dependency.

Therefore:

> **Socket.IO is only correct on a single API instance.** With two or more
> replicas, a message delivered by replica A will not reach a client connected to
> replica B.

This is documented rather than silently assumed. Options, in order of
preference:

1. **Run one API replica.** Correct and simplest. Adequate for expected launch
   traffic.
2. **Add `@socket.io/redis-adapter`.** The `Redis` connection already required in
   production is the natural channel. This is the supported fix and is a small,
   well-understood change, but it has not been made or tested here.
3. Accept missed realtime delivery: the client refetches on reconnect, so state
   stays correct, but live updates are missed while connected.

The documented launch posture is **option 1**, with option 2 as the prerequisite
for horizontal scaling.

## 2. Production configuration

`backend/.env.example` was completed this milestone. **26 environment variables
that the application accepts were undocumented**; a missing entry is a variable
an operator cannot discover and a typo that silently changes behaviour.

Every variable in the template now exists in `env.validation.ts`, verified by
differencing the two lists.

Highlights:

| Variable | Why it matters |
| --- | --- |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Required, ≥32 chars, and **must differ**. The validator refuses a known placeholder. |
| `REDIS_URL` | Required in production. An unvalidated interval would otherwise silently disable a worker — see below. |
| `COOKIE_SECURE` | **Required to be `1` in production.** Previously `0` was accepted, silently downgrading every session cookie to plain HTTP. |
| `TRUST_PROXY` | Must be set deliberately. Turning it on when not behind a proxy lets clients spoof `X-Forwarded-For` and bypass IP rate limits. |
| `CORS_ORIGIN` | Explicit allowlist. `*` is refused. |
| `EMAIL_SENDER` | `console` is **refused** in production so verification links cannot be written to logs. |
| `ALLOWED_IMAGE_TYPES` | Matched against detected type, not the client header. |

### Two configuration defects fixed

**1. `BORROW_OVERDUE_POLL_MS` was unvalidated.** It is read by
`NotificationDispatcher` but was absent from the schema. A typo would make it
`NaN`; `Number.isFinite(NaN)` is `false`, so `setInterval` would never be
scheduled and **the overdue sweep would silently never run** — borrowing members
would stop being told they are late.

It is now validated as a positive integer, with tests asserting both that a
valid value is accepted and that `soon`, `0`, `-1` and `''` fail at boot.

**2. `COOKIE_SECURE=0` was accepted in production.** This is the more serious
of the two. The session and refresh cookies *are* the member's credentials, and
a non-`Secure` cookie is sent over plain HTTP. The schema documented the
variable as "overrides Secure on auth cookies" with no production constraint, so
a deployment could silently opt out of transport protection for every session.

Production now requires `COOKIE_SECURE=1`. `0` remains valid outside production
for local HTTP development, and tests cover both directions so the local workflow
is not broken by the fix.

This one is worth dwelling on: the value was documented as if it were a harmless
local override, and nothing forced anyone to check that assumption before
shipping.

No secrets are committed. `backend/.env` and `.env.staging` remain untracked
and ignored.

## 3. CI/CD release pipeline

The repository already has `.github/workflows/ci.yml` (frontend, backend,
PostgreSQL integration, storage integration) and `deploy-staging.yml` /
`deploy-production.yml`.

Verified properties of the production workflow:

- Triggers on **`workflow_dispatch` only** — no automatic deploy on push.
- Uses a GitHub **`environment: production`**, which is where required reviewers
  and protected-branch rules are attached.
- Gated behind `vars.PRODUCTION_DEPLOY_ENABLED` **and** `vars.PRODUCTION_PUSH_IMAGES`.
- `concurrency` group prevents overlapping deploys.

So production deployment already requires explicit human approval at two
independent points. That satisfies the requirement, and no change was made.

**Gap, stated plainly:** `axe-core` and the browser suites run locally via the
CDP harness but are **not** wired into CI. Wiring in a browser dependency is a
meaningful change to the pipeline and was not undertaken unasked.

## 4. Database operations

### Migration runbook

```bash
cd backend
pnpm exec prisma validate                       # schema parses
pnpm exec prisma migrate status                 # what is pending
pnpm exec prisma migrate deploy                 # apply
pnpm exec prisma migrate status                 # expect "up to date"
```

**For any environment created before Milestone 8**, apply the repair first
(Milestone 11 §11B):

```bash
pnpm exec prisma migrate resolve --rolled-back 0012_passport_trust
pnpm exec prisma migrate deploy
```

Migration `0012` required repair before it could run against a database
containing reviews. Any environment that attempted it and failed is stuck until
that `resolve` step runs.

### Backup strategy

`scripts/backup-postgres.sh` takes a custom-format `pg_dump` through the running
container. `pg_dump` does not take an exclusive lock, so the API keeps serving.

Recommended production cadence: **daily full dump**, retained off-host. This is
the existing script; it has not been scheduled by this milestone.

### Restore procedure — verified

```bash
# Stop the API first. This replaces objects in the target database.
scripts/restore-postgres.sh artifacts/backups/neighborly-<timestamp>.dump
```

**Verified this milestone** against disposable data:

| Check | Result |
| --- | --- |
| Backup produced | 235 KB custom-format dump |
| Restore into an empty database succeeded | Yes |
| Users preserved | 9 of 9 |
| Listings preserved | 18 of 18 |
| Missions preserved | 10 of 10 |
| `_prisma_migrations` history preserved | 13 applied |

The restore preserves the migration history, so a restored database is
immediately consistent with `migrate status`.

### RPO / RTO

Stated as design targets, not measured facts — there is no production system to
measure:

| Objective | Target | Basis |
| --- | --- | --- |
| RPO | ≤ 24 h | Daily dump cadence |
| RTO | ≤ 1 h | Restore measured at seconds on equivalent data; 1 h is operational headroom for decision and verification |
| Migration RTO | Minutes | Forward-only; see rollback limitations |

### Rollback limitations — important

**There are no down migrations in this repository.** Prisma applies migrations
forward only. Rolling back a schema change means restoring a backup, which also
rolls back the data written since the dump.

Consequently, once a migration is applied to a production database, the safe
recovery path is: take a fresh backup, apply a **forward** fix, and release it.
Never roll back by restoring an old dump onto a live database.

## 5. Object storage operations

- **Bucket layout:** one bucket, `neighborly-media`, holding listing images under
  per-listing prefixes.
- **Access policy:** the API is the only principal with credentials. The browser
  never receives bucket credentials.
- **Upload limits:** `MAX_UPLOAD_SIZE_MB` (default 10), enforced in bytes in the
  service, returning `413` rather than buffering an oversized body.
- **Content-type validation:** `ALLOWED_IMAGE_TYPES` matched against the
  *detected* type. A client-supplied `Content-Type` is never trusted.
- **Signed URLs:** verified that reads are served through the API rather than by
  handing out long-lived bucket URLs.
- **Partial S3 configuration is refused** at boot — if any of endpoint, bucket,
  access key or secret key is set, all must be.
- **Retention/deletion:** deleting a listing is a database concern; object
  cleanup is **not** implemented. Orphaned objects accumulate. Acceptable at
  launch volume, but it is a known gap, not a designed behaviour.

## 6. Monitoring and observability

### Already implemented

- **Structured logs** — every request logs one JSON line with `requestId`,
  method, path, status and duration, via a logging exception filter.
- **Request correlation** — `requestContextMiddleware` assigns a request id that
  appears in the response and in each log line, so a user-reported failure can
  be traced.
- **Health endpoint** — `/api/v1/health`, verified returning `200 {"status":"ok"}`.
- **Worker observability** — the notification dispatcher logs what it processed
  (e.g. `published N reviews`, `marked N borrowings overdue`).
- **Audit events** — state transitions are written as durable rows
  (`MissionStatusEvent`, `RequestStatusEvent`, `BorrowStatusEvent`) and are
  queryable independently of logs.
- **Sentry integration point** — `SENTRY_DSN` is accepted; no SDK is installed, so
  it is a hook rather than active reporting.

### What is NOT active

Stated explicitly rather than implied:

- No external monitoring is configured. No uptime check, no metrics scrape, no
  alerting.
- No error-tracking SDK is installed.
- No database health or replication monitoring.
- No WebSocket connection-count metric.

### Logging privacy

Verified that the request logger does not emit request bodies, and that
`emailProblem`/`passwordProblem` return reasons rather than the input. Passwords
and tokens are never logged. `EMAIL_SENDER=console` is refused in production,
which prevents verification and reset links from reaching logs.

### Recommended alerts — recommendations, not configuration

| Condition | Signal |
| --- | --- |
| API down | `/api/v1/health` failing from ≥2 probes |
| Database unreachable | Prisma `P1001`/`P1002` in logs, or health failing |
| Workers stalled | outbox `PENDING` age exceeding 2× `NOTIFICATION_POLL_MS` |
| Elevated errors | 5xx rate above baseline |
| Storage failures | `PayloadTooLargeException` spike, or S3 5xx |
| Migration failure | `migrate deploy` non-zero in the deploy log |

## 7. Security and production safety

| Area | State |
| --- | --- |
| TLS | Terminated at Caddy. Not verified end-to-end — no public endpoint exists. |
| Security headers | helmet; HSTS enabled **only** in production, CSP disabled for the SPA by design. |
| Cookies | `HttpOnly`, `Secure` in production, scoped to `/api/v1/auth`. |
| CSRF | Double-submit token plus origin check on cookie-authenticated mutations. Verified: rejected without the token. |
| CORS | Explicit allowlist; `*` refused. |
| Rate limits | Per-member and per-IP; auth endpoints have the tightest limits and are individually configurable. |
| Authentication | argon2 hashing; refresh rotation verified; refresh replay rejected 401. |
| Authorization | Ownership verified by cross-account probe: non-owner gets 404, owner 200. |
| Mass assignment | Global whitelist pipe rejects unknown properties. |
| Injection | Parameterised access throughout; injection probes returned 400 with data intact. |
| Secrets | None committed. `.env` files ignored. |
| Dependency audit | Not run in this milestone. Recommended before launch. |
| Administrative access | Staff routes are guarded by `passport.assertStaff` in the service layer. |

**No critical or high-severity issue is outstanding.**

## 8. Deployment runbook

### Stage 0 — Preflight

- [ ] Backup taken and **restore rehearsed** (§4).
- [ ] Migration chain validated: `prisma validate`, `migrate status`.
- [ ] If pre-Milestone-8: the `0012` repair step has been run.
- [ ] All CI gates green.
- [ ] Required environment variables present (§2).
- [ ] `COOKIE_SECURE=1`, `EMAIL_SENDER` not `console`, `JWT_*` are real secrets
      and differ from each other.
- [ ] **One API replica only**, unless the Redis adapter has been added (§1).

### Stage 1 — Deploy

1. Build images.
2. Apply migrations (`migrate deploy`) — **before** new code starts, and never
   against a database that has not been backed up.
3. Start the API. Watch for `UnknownDependenciesException` at boot: that is the
   Milestone 10 failure mode and means a module wiring regression.
4. Start the web tier.

### Stage 2 — Verify

```bash
curl -fsS https://<host>/api/v1/health          # {"status":"ok"}
```
- [ ] Health returns `200`.
- [ ] Landing page loads over HTTPS.
- [ ] Register a throwaway account; email arrives.
- [ ] Create a listing, attach an image, view it.
- [ ] Send a message between two accounts; it arrives.
- [ ] `migrate status` reports up to date.
- [ ] Logs show no 5xx and no repeated worker errors.

### Stage 3 — Post-deploy

- [ ] Error rate at baseline.
- [ ] Worker ticks visible in logs.
- [ ] Backup schedule confirmed running.

### Failure handling

| Symptom | Action |
| --- | --- |
| Migration failed | `migrate resolve --rolled-back <name>`, apply a **forward** fix, redeploy. Do not restore an old dump onto a live database. |
| Boot exception | Fix the module wiring; the startup integration suite reproduces it. |
| Realtime not delivering | Confirm single-replica operation first (§1). |
| 5xx spike | Roll back the *application* image. Schema is already forward-compatible if migrations were additive. |

### Rollback

Application images can be rolled back freely **only if** all applied migrations
are backward compatible. This repository's migrations are additive, so image
rollback after migration is generally safe — but verify per release, and treat
data backfill as irreversible.

## 9. Staging verification

**No remote staging environment was deployed to or modified.** Verification was
local and production-like:

| Check | Result |
| --- | --- |
| Backend production build | Pass |
| Frontend production build | Pass |
| Startup with `NODE_ENV=production` constraints | Pass — console email sender and wildcard CORS both refused |
| PostgreSQL connectivity | Pass |
| Redis connectivity | Pass |
| Object storage connectivity | Pass — 33 storage integration tests against a real S3-compatible store |
| WebSocket behaviour | Pass — connection, auth, reconnect |
| Background workers | Pass — drains observed in logs |
| Health checks | Pass |
| Graceful shutdown | Pass — covered by the startup suite |

## 10. Launch checklist

### Verified

- [x] Backend builds, lints, typechecks
- [x] Frontend builds, lints, typechecks
- [x] 287 backend unit tests
- [x] 335 PostgreSQL integration tests
- [x] 33 storage integration tests
- [x] 243 frontend tests
- [x] 330 browser checks, 0 axe violations
- [x] 8 concurrency probes
- [x] Migration drift: "No difference detected"
- [x] Migration 0012 repair proven against legacy data
- [x] Backup and restore round-trip verified
- [x] Security boundaries probed
- [x] Graceful shutdown verified

### Prepared but not activated

- [ ] TLS certificate on the production hostname
- [ ] Production DNS records
- [ ] Production secrets in the platform's secret manager
- [ ] Sentry error reporting (`SENTRY_DSN`)
- [ ] Backup schedule (daily dumps, off-host retention)
- [ ] External uptime monitoring and alerting

### Requires approval

- [ ] Deploying to production
- [ ] DNS changes
- [ ] Any paid infrastructure
- [ ] Activating email delivery beyond the outbox
- [ ] Public launch announcement

### Blocked

- **Horizontal API scaling** until `@socket.io/redis-adapter` is added (§1).
- **Schema rollback** — no down migrations exist; forward fixes only.

### Not applicable

- Payment processing (`STRIPE_*` unset; no checkout surface is exposed)

## 11. Known limitations

1. **Single API replica only.** No Redis adapter for Socket.IO. Correct today,
   blocking for scale-out.
2. **No down migrations.** Rollback means forward fix or backup restore.
3. **Orphaned object storage.** Deleting a listing does not delete its images.
4. **No external monitoring.** Nothing is actively watched or alerted on.
5. **No dependency vulnerability audit** run this milestone.
6. **No load or soak testing.** Capacity is unverified.
7. **Browser suites are not in CI.** They run locally only.

## 12. What must happen before public launch

1. **Human approval** for the deployment itself. Nothing in this milestone
   constitutes or implies that approval.
2. Apply the `0012` repair runbook to any pre-Milestone-8 environment.
3. Confirm one API replica, or add the Redis adapter.
4. Provision TLS, DNS and secrets (all currently "prepared, not activated").
5. Run the manual screen-reader checklist (`docs/MILESTONE_11_A11Y_MANUAL_CHECKLIST.md`).
6. Schedule and rehearse backups.
7. Run a dependency vulnerability audit.
8. Wire the browser/a11y suites into CI if they are expected to gate releases.