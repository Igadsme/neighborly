# Final 12-Milestone Audit — Neighborly

Audit date: 2026-10-13
Branch: `final-audit-12-milestones`
Baseline audited: `343584aceb0c0fdfae931886d5584be445ba40fe` (Milestone 12)

This audit treats every previous milestone report as an unverified claim. Each
finding below was reproduced against running code, and each fix has a
regression test that was verified to fail against the old behaviour.

Nothing was pushed, merged, rebased, deployed, or launched. No Docker volume
was deleted. Prior branches and commits are intact.

---

## 1. What the audit found that the reports did not

Five defects were real product or operations defects, not test noise. Three of
them were invisible to the existing suites because of how those suites are
constructed.

| # | Severity | Defect | Why the existing suites missed it |
|---|----------|--------|-----------------------------------|
| 1 | **P1** | `EMAIL_SENDER` was bound to a *class*, not an instance. Every email path threw `TypeError: this.email.send is not a function`. Registration, email verification and password reset all returned **500**. | Every auth suite overrides the token with `useValue: new OutboxEmailSender(prisma)` — a real instance — so it could never observe the wiring. |
| 2 | **P1** | `main.ts` never called `app.enableShutdownHooks()`. SIGTERM killed the process through Node's default handler, cutting in-flight requests and dropping Prisma/Redis connections without closing them. | The startup suite closes the app explicitly with `app.close()`, which is a different path from a signal. |
| 3 | P2 | Icon-only buttons on Messages and the bottom navigation had **no accessible name**. The composer was labelled only by its placeholder. | The M10 harness reported 0 axe violations on its screen set. Re-running it fresh found these. |
| 4 | P2 | The desktop header overflowed horizontally by up to **268px** at 768px and 12px at 1024px, on every screen. | The M10 harness only measured **390px and 1440px**. The widths in between were never checked. |
| 5 | P2 | The landing page showed a hardcoded **"3,200+ active listings"** figure that no code could change, and shipped two WCAG AA contrast failures (2.74:1 and 3.9:1 against a 4.5:1 requirement). | Nothing asserted that UI copy was derived from real data; Lighthouse had never been run. |

Defect 1 is the most serious finding in this audit. A brand-new member could
not create an account in **any** deployment, on either the `outbox` or the
`console` email adapter. It survived 12 milestones and roughly 1,600 passing
tests because the failure was in the composition root, and every test that
touched it stubbed the token.

---

## 2. Milestone-by-milestone verification matrix

Status key: **VERIFIED** (reproduced at runtime), **PARTIAL**, **NOT
IMPLEMENTED**, **NOT TESTED**, **BLOCKED**, **DEFERRED BY DESIGN**.

### Milestone 1 — Repository Stabilization & CI — VERIFIED
| Requirement | Status | Evidence |
|---|---|---|
| Structure, scripts, TS config | VERIFIED | `pnpm install --frozen-lockfile` clean; root and backend typecheck clean; `pnpm lint` clean |
| Lint / format | VERIFIED | `pnpm lint` exits 0 in both workspaces |
| Frontend build | VERIFIED | `vite build` succeeds; 47 chunks, entry gzip ≈160 kB |
| CI executes the intended tests | VERIFIED **and extended** | CI runs frontend lint/typecheck/test/build, backend validate/lint/typecheck/test/build, PostgreSQL integration, S3 storage integration. **Gap found and fixed**: no dependency-security gate and no migration-drift check. Both added and both verified to pass locally. |
| Reproducible clean build | VERIFIED | Built from a clean dependency install after the lockfile change |
| Documentation accuracy | PARTIAL | Milestone 11/12 reports are accurate as written. Two claims required correction in this audit — see §1 defects 2 and 4 (graceful shutdown; responsive coverage) |

**Fixed:** added `security-audit` (blocking `pnpm audit --prod` on both
workspaces, full audit reported non-blockingly) and `migration-drift`
(`prisma migrate diff --exit-code` against a scratch database).

### Milestone 2 — Database, Security & Data Integrity — VERIFIED
| Requirement | Status | Evidence |
|---|---|---|
| Migration chain applies fresh | VERIFIED | All 13 migrations applied to an empty database; "All migrations have been successfully applied" |
| Migration drift | VERIFIED | `prisma migrate diff --from-migrations --to-schema-datamodel --exit-code` → "No difference detected", exit 0 |
| Migration checksums | VERIFIED | Stored checksum for `0012_passport_trust` equals the SHA-256 of the file on disk |
| Legacy upgrade path (0012) | VERIFIED | Rebuilt a pre-0012 database containing 2 reviews with pre-migration timestamps, resolved 0011, then deployed 0012. Both reviews survived with `createdAt = updatedAt` intact, author and status preserved, and the temporary `DEFAULT` confirmed dropped |
| Constraints, FKs, indexes | VERIFIED | Exercised through the integration suite, including the borrow reservation exclusion constraint and `Transaction.offerId` uniqueness |
| Transactions / atomicity | VERIFIED | Offer acceptance and transaction transitions tested against real PostgreSQL |
| Migration 0012 repair is safe for already-migrated databases | VERIFIED | `migrate deploy` skips recorded migrations without re-hashing, so databases that already ran the pre-repair 0012 are unaffected |

### Milestone 3 — Authentication & Accounts — PARTIAL
| Requirement | Status | Evidence |
|---|---|---|
| Registration, login, logout | VERIFIED **after fix** | Registration returned 500 before this audit's fix; now returns 201 with a usable token over live HTTP on both email adapters |
| Password hashing | VERIFIED | argon2id; wrong password rejected 401 |
| Password reset, refresh rotation, session expiry | VERIFIED | Refresh via httpOnly cookie; single-use; replay returns 401 |
| CSRF protection | VERIFIED | `X-Neighborly-CSRF` double-submit required; missing header → 403; cross-origin → 403 |
| Cookie security | VERIFIED | `neighborly.refresh` is HttpOnly, SameSite=Lax, path-scoped to `/api/v1/auth` |
| Rate limiting | VERIFIED | 12 rapid login attempts: 401×6 then 429×6 |
| Account suspension / deletion | VERIFIED | Covered by existing suites; suspension effects asserted |
| Email delivery | **NOT IMPLEMENTED** | `outbox` persists to `EmailOutbox`; `console` writes to stdout. No provider (SES/Postmark/Resend) is wired. See §5. |
| Profile editing, cross-account isolation | VERIFIED | Non-owner edit → 403; mass assignment rejected by `whitelist` + `forbidNonWhitelisted` |

**Fixed:** the `EMAIL_SENDER` class-vs-instance defect (P1).

### Milestone 4 — Marketplace & Listings — VERIFIED
Browse, create, edit, ownership enforcement, favourites, categories, search and
filters all exercised over real HTTP against real rows. Non-owner edit → 403,
non-owner delete → 403. Image upload uses the S3 adapter and is verified by the
storage suite against a live MinIO container (**33/33**), not a mock.

**Limitation:** saved searches persist, but there is no scheduled re-evaluation
job that produces alerts on new matches; notifications are event-driven only.

### Milestone 5 — I Need & Matching Engine — VERIFIED
Request creation, discovery by other members, offer submission, acceptance,
transaction creation and conversation opening all exercised. **The single-winner
guarantee holds:** accepting the same offer twice returns 400, and two competing
offers racing produce exactly one transaction.

### Milestone 6 — Messaging & Notifications — VERIFIED WITH A DOCUMENTED LIMITATION
Send, receive, unread counts, read state and notification deep links verified.
Non-participants cannot read a conversation (403).

**BLOCKED (by design, documented):** there is no `@socket.io/redis-adapter`.
Realtime fan-out is correct on a **single replica only**. With two or more API
replicas, a message published on replica A is not delivered to sockets held by
replica B. Horizontal scaling requires the Redis adapter before launch at scale.

**Finding:** the app routes on component state, not URL paths. `window.location`
never changes, so there are no shareable or bookmarkable in-app URLs, and the
browser back button does not navigate. Notification `link` values are internal
page names resolved by `routeFor()`, not URLs.

### Milestone 7 — Neighborly Borrow — VERIFIED
Borrowable listing creation, date-bounded requests, approval, and the
overlapping-reservation guard all exercised. Two borrowers requesting identical
dates cannot both end up with an accepted reservation.

**DEFERRED BY DESIGN:** there is no payment or insurance functionality. `depositCents` is recorded for transparency only and is never processed. This is intentional and documented, not a gap.

### Milestone 8 — Passport & Trust — VERIFIED
Public passport readable by other members; own audit log readable. **Privacy
verified:** a public passport payload contains neither `passwordHash` nor
`email`. The own-profile response likewise omits the hash.

### Milestone 9 — Neighborhood Missions — VERIFIED
**Creation over real JSON works** — this was the M11 defect and the fix holds;
verified again over live HTTP. Organiser-only editing (non-organiser → 403),
capacity enforcement, and waitlisting on a full mission all behave correctly.

### Milestone 10 — UI/UX, Accessibility & Performance — VERIFIED, with defects found and fixed
See §1 defects 3, 4 and 5, and §4 for measurements.

**Explicitly NOT verified:** real screen-reader testing was **not performed**.
No VoiceOver/NVDA session was run, because this environment cannot drive one
reliably and a fabricated result would be worse than none. A manual checklist
exists at `docs/MILESTONE_11_A11Y_MANUAL_CHECKLIST.md`. **WCAG 2.2 AA
conformance is not claimed.** What is claimed: axe-core reports zero violations
on the measured screens, and Lighthouse's automated accessibility audit scores
**100** on the landing page.

### Milestone 11 — End-to-End QA & Release Hardening — VERIFIED
The M11 fixes were re-tested against real HTTP rather than trusted:
mission creation over JSON still works; HTTP date serialisation is correct;
double-accept is refused; the real `AppModule` boot guard boots.

**Correction:** Milestone 11 reported "graceful shutdown" as verified. It was
not — see defect 2.

### Milestone 12 — Production Launch & Operations — VERIFIED AS PREPARATION ONLY
| Item | Status |
|---|---|
| Production env validation, `COOKIE_SECURE` enforcement | VERIFIED — implemented and unit-tested |
| Worker polling configuration | VERIFIED — `BORROW_OVERDUE_POLL_MS` is validated |
| Health / readiness endpoints | VERIFIED — `/health` 200, `/ready` reports postgres and redis `up` |
| CI/CD workflows | VERIFIED — deployment is manual-gated; the production workflow refuses even when fully enabled |
| Database backup and restore | VERIFIED — rehearsed against a disposable database (see §6) |
| **Graceful shutdown** | **WAS BROKEN — fixed in this audit** |
| External monitoring | **NOT IMPLEMENTED — requires external infrastructure.** No monitoring service is connected. Only local log output and health endpoints exist. |
| Secret management | **NOT IMPLEMENTED.** Secrets are supplied as environment variables; no vault integration. |

Nothing in this milestone was deployed. The repository has no production
target configured, by design.

---

## 3. Defects

| Severity | Found | Fixed | Open |
|---|---|---|---|
| **P0** | 0 | 0 | 0 |
| **P1** | 2 | 2 | 0 |
| **P2** | 5 | 5 | 0 |
| **P3** | 2 reported, 0 fixed (see below) | 0 | 2 |

**P3 items deliberately not fixed** (reported, not silently changed):
1. `HomeFeed.tsx` renders three example neighbours with a "verified" badge and
   ratings. The section is labelled "Preview · Examples. Not live ratings.", so
   it is disclosed rather than deceptive, but a real launch should either feed
   it from real accounts or remove it. Replacing product surface is an owner's
   decision.
2. 211 PNG screenshots (33 MB) are tracked in git under
   `artifacts/docker-release-verification/`, outside the ignore rules that
   already cover the later verification passes. Removing committed evidence from
   a prior milestone is an owner decision; the inconsistency is reported.

---

## 4. Measurements

### Test results (all run against clean or reset infrastructure)

| Suite | Command | Result |
|---|---|---|
| Frontend unit | `pnpm exec vitest run` | **250 passed**, 22 files |
| Backend unit | `cd backend && pnpm exec jest --config jest.config.cjs` | **294 passed**, 36 suites |
| PostgreSQL integration | `bash scripts/run-integration-tests.sh` | **339 passed**, 18 suites |
| Storage integration | `bash scripts/run-storage-tests.sh` | **33 passed**, 3 suites |
| Browser + axe (authenticated) | `node scripts/milestone10-auth-check.mjs` | **330 passed, 0 failed**, axe violations 0 |
| Journey A–J (API level) | `node scripts/final-audit-journeys.mjs` | **42 passed, 0 failed** |
| Security probe | `node scripts/final-audit-security.mjs` | **28 passed, 0 failed** |
| Typecheck | `tsc --noEmit` | clean, both workspaces |
| Lint | `pnpm lint` | clean, both workspaces |
| Dependency audit | `pnpm audit` (root, backend) | **0 production vulnerabilities** |
| Migration drift | `prisma migrate diff --exit-code` | No difference detected |

### Responsive sweep — 24 combinations (6 widths × 4 screens)
Widths: 320, 375, 390, 768, 1024, 1440. Screens: home, explore, messages,
missions.

**Before fixes: 9 of 24 overflowed.** **After fixes: 0 of 24 overflow, and
every combination has exactly one `h1`.**

### Lighthouse (public landing page — the only directly addressable page)

| Category | Before | After |
|---|---|---|
| Performance | 76 | **87** |
| Accessibility | 95 | **100** |
| Best practices | 96 | 96 |
| SEO | 66 | 66 |

Measured timings after fixes: FCP 3.3s, LCP 4.5s, TBT 130 ms, CLS **0**.

**SEO 66 is expected and correct.** The single failing audit is `is-crawlable`,
because `.figma/make/site.json` sets `robots.index: false`, which injects
`<meta name="robots" content="noindex, nofollow">`. That is the correct
pre-launch posture and reversing it is a launch decision, not an audit fix.

**Lighthouse limitation, stated plainly:** the app does not use URL routing, so
authenticated screens cannot be addressed by URL and therefore cannot be given
a Lighthouse URL. Authenticated pages are covered by the 330-check browser
harness and by axe-core instead, not by Lighthouse. No Lighthouse number is
claimed for any authenticated screen.

---

## 5. Known limitations and blockers

**Release blockers for a multi-instance deployment**
1. **No `@socket.io/redis-adapter`.** Realtime is correct on exactly one API
   replica. This blocks horizontal scaling, not a single-instance launch.
2. **No down migrations.** Schema rollback is backup-restore only.
3. **No external monitoring.** No APM, error tracking, or uptime service is
   connected. Requires infrastructure the audit may not provision.

**Not implemented (requires external configuration or a decision)**
4. **No email provider.** `EMAIL_SENDER` persists to `EmailOutbox` or stdout.
   Verification and reset emails will not reach anyone until a provider is wired
   to drain the outbox. Production startup already refuses `console`.
5. **No in-app URL routing.** No deep links, no back button, no refresh
   persistence of the current screen.
6. **Payments are deliberately absent** from Borrow.
7. **`braces` advisory has no patched release.** It is reachable only through
   `@types/jest → expect → micromatch`, is type-only, and is not in any
   production dependency graph. It cannot be remediated by upgrading; the CI gate
   deliberately uses `--prod`.

---

## 6. Production-like rehearsal

Performed locally against disposable infrastructure only. **No deployment
occurred.**

- **Production builds** — both workspaces build clean from a fresh install.
- **Environment validation** — production rejects `COOKIE_SECURE=0` and
  `EMAIL_SENDER=console` at startup.
- **Database migration** — full chain applied to an empty database; legacy
  upgrade path verified separately (§2).
- **Redis connectivity** — verified; session store and notification dispatch
  both function against it.
- **Object storage** — verified against a live MinIO container.
- **Socket.IO** — verified in a real browser.
- **Background workers** — verified; notification dispatch delivers, and
  duplicate suppression holds under replay.
- **Health and readiness** — `/health` and `/ready` both green with postgres
  and redis reported `up`.
- **Graceful shutdown** — verified by sending a real `SIGTERM` to the running
  server before and after the fix (§1 defect 2).
- **Backup and restore** — backup taken with `scripts/backup-postgres.sh` and
  restored into a fresh disposable database with `scripts/restore-postgres.sh`;
  row counts and content matched before the restore.

---

## 7. Reproduction commands

```bash
# Backend unit
cd backend && pnpm exec jest --config jest.config.cjs --runInBand

# Frontend unit
pnpm exec vitest run

# PostgreSQL integration (starts and removes its own container)
bash scripts/run-integration-tests.sh

# Storage integration (needs a live S3-compatible service)
bash scripts/run-storage-tests.sh

# Dependency audit
pnpm audit --prod --audit-level=moderate
cd backend && pnpm audit --prod --audit-level=moderate

# Migration drift
cd backend && pnpm exec prisma migrate diff \
  --from-migrations prisma/migrations \
  --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$SHADOW_DATABASE_URL" --exit-code

# Journeys and security probes (need the API and web running)
API=http://localhost:3001/api/v1 node scripts/final-audit-journeys.mjs
API=http://localhost:3001/api/v1 node scripts/final-audit-security.mjs

# Browser + axe (needs the API and web running)
APP_URL=http://localhost:4173 API_URL=http://localhost:3001/api/v1 \
  CHECK_OUT=artifacts/final-audit-auth node scripts/milestone10-auth-check.mjs
```

---

## 8. Audit integrity notes

Two assertions in the audit's own scripts were wrong on first draft, and were
corrected rather than worked around: registration initially used a password
that violated the application's own password policy, and the security probe
first asserted that the refresh token appeared in the response body when it is
deliberately delivered in an httpOnly cookie. In both cases the implementation
was right and the probe was wrong.

One further honesty note: repeated-run verification of the reworked
integration `globalSetup` was interrupted by a host-level Docker Desktop
failure (an `overlay2` read-only filesystem error that also affected the
running Postgres container, unrelated to this repository). The preceding
`docker exec` implementation had been verified across six consecutive clean
runs; the reworked version was verified on a full 339-test run and on the
startup suite, but not across repeated runs after the change.