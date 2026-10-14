# Pre-Launch Readiness Report — Neighborly

Date: 2026-10-13
Branch: `final-audit-12-milestones`
Assessment based on: `docs/FINAL_12_MILESTONE_AUDIT.md`

---

## Overall readiness assessment

## READY WITH CONDITIONS

Neighborly can safely be used by real users **on a single API replica, with an
email provider connected, and with the owner accepting the limitations listed
below.** It is not ready for a multi-instance deployment and not ready for
public marketing.

The condition on the single replica is not a workaround: it is the only
configuration in which realtime messaging is correct, because no
`@socket.io/redis-adapter` is installed. One replica is a legitimate launch
configuration. Two replicas is not.

The condition on email is that verification and password-reset mails currently
go to a database table nobody reads. Registration works, but a real member
cannot verify their address or reset a password. Connecting a provider is a
configuration task, not a code change.

---

## 1. Complete end-to-end test matrix

Every journey was executed against the running stack with real accounts, real
HTTP calls, and real database rows. No journey is counted as passing on the
strength of its components existing.

| Journey | Steps executed | Result | Evidence |
|---|---|---|---|
| **A — New member** | Register → read own profile → read own passport → log out → log in again → wrong-password rejection | **PASS after fix** | Registration returned **500** before this audit's fix; it now returns 201 with a usable token |
| **B — Marketplace** | List categories → browse listings → create listing → non-owner edit rejected → owner edit → favourite | **PASS** | Non-owner edit → 403 |
| **C — I Need** | Create request → discover from another account → submit offer → accept → transaction created → conversation opened → double-accept rejected | **PASS** | Transaction and conversation both created; second accept → 400 |
| **D — Messaging** | List conversations → send message → peer reads it → non-participant blocked | **PASS** | Non-participant → 403 |
| **E — Borrow** | Create borrowable item → request dates | **PASS** | Exercised; lifecycle covered by the integration suite against real PostgreSQL |
| **F — Borrow conflict** | Two borrowers request identical dates → attempt concurrent approval | **PASS** | Overlapping reservations cannot both be accepted |
| **G — Passport** | Own passport → another member's passport → audit log → privacy check | **PASS** | Public payload contains no `passwordHash` and no `email` |
| **H — Missions** | Create over real JSON → publish → first member joins → second is waitlisted → non-organiser edit rejected | **PASS** | Mission creation over JSON is the M11 defect; fix confirmed |
| **I — Notifications** | List notifications → verify deep links present | **PASS** | Notifications delivered with links |
| **J — Security** | Cross-account access on requests, conversations, notifications → forged token | **PASS** | All scoped to the caller; forged token → 401 |

**Totals: 42 journey checks, 42 passed, 0 failed.**

---

## 2. Security findings

28 negative security checks, all passing.

| Area | Result |
|---|---|
| Unauthenticated access to personal routes | Refused (401) |
| Forged / tampered / `alg=none` JWTs | All refused (401) |
| Account enumeration | Failed login returns an identical message whether or not the account exists |
| Object-level authorization | Non-owner cannot edit or delete a listing; cannot read a conversation (403) |
| Mass assignment | `role`, `status`, `id`, `email`, `passwordHash` all rejected by `whitelist` + `forbidNonWhitelisted` |
| Prototype pollution | `__proto__` / `constructor.prototype` payloads do not alter role |
| Refresh token replay | Second use → 401 "Session is no longer valid" |
| CSRF | Missing double-submit header → 403; cross-origin → 403 |
| Cookie security | Refresh cookie is HttpOnly, SameSite=Lax, path `/api/v1/auth`; token is **not** in the response body |
| Rate limiting | 12 rapid login attempts → 429 after 6 |
| Injection | SQL metacharacters handled safely; database intact; script tags not reflected verbatim; oversized queries rejected |
| Information disclosure | No password hashes, emails on public payloads, or connection strings in responses |
| Security headers | `X-Content-Type-Options: nosniff` and helmet headers present |
| Dependency vulnerabilities | **0 production vulnerabilities** in both workspaces |

### Dependency audit

Fixed during this audit: `js-yaml` (moderate, the only production-reachable
finding, via `@nestjs/swagger`), `handlebars` (2 critical, via `ts-jest`),
`sprintf-js` (moderate, via jest), and `source-map-js` (high, via
`@tailwindcss/vite`).

**Outstanding, unfixable:** `braces` (high) has **no patched release** and is
reachable only through `@types/jest → expect → micromatch`. It is type-only,
never present in a production dependency graph, and is why the CI gate uses
`--prod`. Suppressing it in the audit output would have hidden it rather than
fixed it.

---

## 3. Database and migration findings

- Full chain of 13 migrations applies to an empty database.
- **Migration drift: none.** `prisma migrate diff --exit-code` reports no difference.
- Checksums match; the repaired `0012` matches its recorded checksum.
- **Legacy upgrade reproduced independently.** A pre-0012 database containing
  reviews was rebuilt, and deploying 0012 over it preserved every row, both
  original timestamps (`createdAt = updatedAt`), author attribution and
  publication status, with the temporary column default removed afterwards.
- Already-migrated databases are unaffected: `migrate deploy` skips recorded
  migrations without re-hashing them.
- Overlapping borrow reservations and `Transaction.offerId` uniqueness are
  enforced by the database, not only by application code.

### Integration suite reliability — investigated and fixed

The suite was previously **not idempotent**: a second run against a reused
database failed, because all 18 suites share one database and build fixtures
from fixed UUIDs, so each run inherited the previous run's rows.

Two independent causes were confirmed by repeated runs:

1. **State contamination.** A guarded `globalSetup` now truncates application
   tables before each run. It refuses to run against anything but a disposable
   verification database, and preserves the Prisma migration ledger and the
   migration-seeded badge catalogue — which belong to the schema history, not
   to a test. An early version of this reset deleted the badge catalogue and
   broke nine mission tests; that was caught and corrected.
2. **Notification delivery races.** `drain()` is a single batch and is a no-op
   while another sweep holds the running flag, so a spec could not assume its
   own event had been delivered. A shared `drainUntilDelivered` helper now
   waits on the delivery itself. No assertion was weakened: if the
   notification never arrives, the caller's assertion still fails.

No assertion was relaxed and no real data was deleted to make tests pass.
**339 tests, 18 suites, passing.**

---

## 4. Performance measurements

Lighthouse, public landing page (the only directly addressable page — the app
does not use URL routing):

| Metric | Value |
|---|---|
| Performance | **87** (was 76) |
| Accessibility | **100** (was 95) |
| Best practices | 96 |
| SEO | 66 (expected — see below) |
| First Contentful Paint | 3.3 s |
| Largest Contentful Paint | 4.5 s |
| Total Blocking Time | 130 ms |
| **Cumulative Layout Shift** | **0** |

SEO 66 is caused solely by `is-crawlable`, because `.figma/make/site.json`
sets `robots.index: false`. That is the correct pre-launch posture; reversing it
is a launch decision and was not made here.

### Responsive verification

Six required widths × four screens = **24 combinations**.

**Before this audit: 9 of 24 had horizontal overflow. After: 0 of 24**, and
every combination has exactly one `h1`.

The previously untested widths were the problem: the Milestone 10 harness
measured only 390px and 1440px. Between those, the desktop header overflowed by
up to 268px on every screen.

### Honest limitations of this section

- **Authenticated pages have no Lighthouse score.** Because the app routes on
  component state rather than URL paths, no authenticated screen can be
  addressed by URL. They are covered by the 330-check browser harness and
  axe-core instead. No number is claimed for them.
- Lighthouse was run from a local machine against a local build; these are not
  field metrics from real users on real networks.

---

## 5. Accessibility findings

**Automated, actually performed:**
- axe-core against 12 authenticated screen/viewport combinations: **0 violations**.
- Browser harness: **330 checks passed, 0 failed**, covering accessible names,
  form labels, image alt text, tap-target size, heading structure, dialog
  naming, keyboard operation, focus restoration, and the skip link.
- Lighthouse accessibility on the landing page: **100**.

**Defects found and fixed in this audit:**
- Four icon-only buttons with no accessible name (conversation filters, attach
  photo, send message, back to conversations).
- Five bottom-navigation buttons with no accessible name.
- The message composer labelled only by its placeholder.
- No level-one heading on Messages while a conversation was open on a narrow
  screen.
- An 18px tap target, below the 24px minimum.
- A "Neighbors to follow" group announcing itself as "Free listings" to screen
  readers.
- Two contrast failures: 2.74:1 (body copy on the navy section) and 3.9:1 (coral
  badge), both under the 4.5:1 AA requirement.

**Explicitly NOT verified — and not claimed:**
- **No screen-reader testing was performed.** No VoiceOver or NVDA session was
  run. This environment cannot drive one reliably, and inventing a result would
  be worse than reporting none. A manual checklist is provided at
  `docs/MILESTONE_11_A11Y_MANUAL_CHECKLIST.md`.
- **WCAG 2.2 AA conformance is not claimed.** axe-core and Lighthouse check a
  subset of criteria and cannot assess keyboard traps, focus order quality,
  reflow at 400% zoom, or assistive-technology compatibility. What can be
  claimed is narrow and specific: zero automated violations on the measured
  screens, and a Lighthouse accessibility score of 100 on the landing page.

---

## 6. CI coverage

| Check | Job | Blocking |
|---|---|---|
| Frontend lint, typecheck, tests, build | `frontend` | Yes |
| Backend validate, lint, typecheck, tests, build | `backend` | Yes |
| PostgreSQL integration (real container) | `integration` | Yes |
| Object storage integration (MinIO) | `storage-integration` | Yes |
| **Production dependency audit** | `security-audit` | **Yes (added)** |
| **Migration drift** | `migration-drift` | **Yes (added)** |

**Not in CI, deliberately:**
- **The browser/axe harness is not a CI job.** It needs a running API, web
  server, seeded database and Chrome. It is reproducible locally via
  `scripts/milestone10-auth-check.mjs` and is re-run at each milestone, but CI
  does not execute it. Adding it as a job is a known gap.
- Lighthouse is not in CI; it requires a Chrome download per run.

**CI has not been executed on GitHub.** The workflows were validated by parsing
all three YAML files and by running every command they contain locally. That is
not proof that hosted GitHub Actions will pass.

---

## 7. Production-like rehearsal

Rehearsed locally only. **Nothing was deployed, and no remote environment was
touched.**

Verified: production builds, environment validation, migration application,
Redis connectivity, object storage, Socket.IO, background workers, health and
readiness endpoints, **graceful shutdown**, and backup/restore.

**Graceful shutdown was broken and is now fixed.** `main.ts` never called
`app.enableShutdownHooks()`. A real `SIGTERM` delivered to the running server
terminated it through Node's default handler with zero shutdown lifecycle
activity — in-flight requests cut off, Prisma and Redis connections dropped
rather than closed. Every deploy path sends `SIGTERM`. After the fix the real
application registers one listener per signal and exits within two seconds.

Backup and restore were rehearsed with `scripts/backup-postgres.sh` and
`scripts/restore-postgres.sh` against a disposable database, with row counts
and content verified after restore.

---

## 8. Known release blockers

Nothing here is a code defect. All three require a decision, a purchase, or a
deployment topology the audit was not authorized to choose.

1. **Horizontal scaling is unsafe.** No `@socket.io/redis-adapter`. Realtime
   message delivery is correct on one replica and incorrect on two or more.
   Launching on one replica is fine; scaling out is not, until the adapter is
   added.
2. **No down migrations.** Schema rollback requires restoring a backup.
3. **No external monitoring.** No APM, error tracking, or uptime service is
   connected. Only local logs and health endpoints exist. Provisioning a
   monitoring service is outside the audit's authorization.

---

## 9. Required external configuration

These cannot be completed inside this repository and must be supplied before or
at launch.

| Item | Why it is required | Who provides it |
|---|---|---|
| Email provider credentials + an outbox drainer | Verification and password-reset mails currently go only to `EmailOutbox` | Owner — **blocker for real signups** |
| Production host / database | No production target is configured | Owner — purchase decision |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Must be unique and secret per environment | Owner |
| Object-storage bucket + credentials | Production media storage | Owner |
| TLS termination and `COOKIE_SECURE=1` | Production already refuses anything else | Owner |
| `CORS_ORIGIN` / `PUBLIC_WEB_ORIGIN` | Must list the real domain | Owner |
| Database backup destination and retention policy | Backups exist but need somewhere to live | Owner |
| `@socket.io/redis-adapter` | Required before running more than one replica | Engineering |
| Monitoring and alerting | None connected | Owner |
| Flip `robots.index` to `true` | Only when the site should be indexed | Owner |

---

## 10. Launch approval checklist

Nothing below has been done. Each line is an explicit human decision.

- [ ] P0 and P1 defects are fixed and regression-tested — **done in this audit**
- [ ] All suites green on clean infrastructure — **done: 250 FE, 294 BE unit, 339 integration, 33 storage, 330 browser/axe**
- [ ] Dependency audit clean for production — **done: 0 vulnerabilities**
- [ ] Migration drift check passing — **done**
- [ ] Email provider connected and verified end-to-end — **not done, blocking**
- [ ] Production host provisioned — **not done**
- [ ] Production secrets generated and stored outside the repository — **not done**
- [ ] TLS and secure cookies verified in production — **not done**
- [ ] Backup taken and a restore actually rehearsed in production — rehearsed locally only
- [ ] Monitoring and alerting connected — **not done**
- [ ] Decision recorded: single replica, or add the Redis adapter first
- [ ] Manual screen-reader pass completed from the checklist — **not done**
- [ ] Product owner accepts the P3 items (example neighbours shown as verified; 211 tracked screenshots)
- [ ] Legal and privacy review of live data handling — **not done**
- [ ] Explicit authorization to deploy — **not given; nothing was deployed**

---

## 11. Final recommendation

**Can Neighborly safely be used by real users?**

**Yes, with conditions.** A single-replica deployment with an email provider
connected would serve real users correctly for marketplace listings, requests
and offers, messaging, borrowing, passports and missions. The defects found in
this audit are fixed and regression-tested, and the two that were genuinely
serious — broken registration and broken shutdown — are closed.

**What remains before launch, in order:**

1. **Connect an email provider.** Without it, verification and password reset
   do not reach anyone. This is the one item that makes the difference between
   a working product and a broken one for new members.
2. **Choose a topology and record it.** One replica is correct today. If more
   than one is planned, add `@socket.io/redis-adapter` first.
3. **Supply production secrets, host, storage and TLS.**
4. **Connect monitoring.**
5. **Complete the manual screen-reader pass** and record the result.
6. **Obtain explicit authorization to deploy.**

Items 3 and 4 are owner decisions and purchases, not engineering work. Items 5
and 6 are human sign-offs.

**A final note on the headline finding.** Registration was returning HTTP 500
in every deployment, on every email adapter, for the entire life of this
product — and roughly 1,600 tests passed throughout. It was found only by
running a real signup against a running server. The lesson for the next
milestone is specific and actionable: unit tests that override a dependency are
testing the override, not the wiring. The composition root needs its own
guard, which now exists in `backend/src/startup.integration.spec.ts`.