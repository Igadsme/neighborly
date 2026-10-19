# Final Integration Report — Neighborly

Date: 2026-10-14
Integration branch: `integration/final-neighborly-release`
Integration PR: **https://github.com/Igadsme/neighborly/pull/27**
Integration HEAD: `5005103`

---

## 1. Root cause of the branch divergence

`main` and the milestone branches share exactly one commit: `d0dab1c`,
"Build Neighborly marketplace foundation". They never re-converged.

Two lines of work ran in parallel from that first commit:

- **`main`** — 26 commits by Imani Gad and Atlas: June Sprint 1 and Phases 1–7. API wiring for the vertical screens, listing-PII and realtime-auth security fixes, Compose staging, trust & safety, and Phase 7 production prep.
- **Milestone branches** — 52 commits building the 12 milestones and the final audit.

Neither side was merged into the other during that period, so both PRs report `mergeable_state: dirty`.

## 2. Investigation: the milestone branch is a strict superset

Before resolving anything, each axis was measured rather than assumed:

| Axis | `main` | Integration branch | Lost? |
|---|---|---|---|
| Migrations | `0001`–`0005` | `0001`–`0013` | **No** — `0001`–`0005` byte-identical; `0006`–`0013` purely additive |
| Prisma models/enums | 54 | 100 | **No** — nothing missing; migration `0012` evolves `Review` with additive `ALTER`s |
| Route decorators | 89 | 223 | **No** — no endpoint lost |
| Environment variables | 13 | 41 | **No** — only `VITE_API_URL`, a frontend build var, correctly not in the backend file |
| Dependencies | — | superset | **No** |
| npm scripts | — | superset | **No** |

Security fixes confirmed present: `publicUserSelect` is an allowlist without `email` (listing PII), and the Socket.IO gateway verifies the JWT and account status on connect.

### Migration compatibility analysis

**No previously applied migration was rewritten.** Verified by SHA-256 comparison and by `git diff --name-status`, which reports 8 **added** files and **zero modified**.

A database deployed from `main` is at `0005`. It upgrades through `0006`–`0013` additively. Concretely, migration `0012` extends `main`'s `Review` table:

```sql
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING','PUBLISHED','HIDDEN');
ALTER TABLE "Review"
  ADD COLUMN "authorRole" TEXT,
  ADD COLUMN "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
  ...
```

No column is dropped or retyped, so no data is at risk.

## 3. Conflict resolution

76 files conflicted. Each was resolved to the milestone implementation **on the evidence above**, not by blanket "theirs" — it is the newer code, it carries the audit's verified fixes, and it is a proven superset on every axis measured. CI is also a superset, keeping `main`'s `frontend` and `backend` jobs and adding `integration`, `storage-integration`, `security-audit` and `migration-drift`.

### The one real duplication: two `/reviews` controllers

`main` shipped `backend/src/reviews/`, registering a **second** `@Controller('reviews')` with the same `POST` route as `passport/reviews.controller.ts`. `ReviewsModule` was not imported by `app.module`, so it was dead code — but a trap: importing it would have made `POST /reviews` ambiguous.

It is genuinely superseded. `passport/reviews.service.ts` enforces every guard the duplicate had — participant check, `COMPLETED`-only, no self-review, not-blocked — and adds moderation, publication windows, review uniqueness and six more endpoints. Its integration suite covers both assertions the duplicate's spec made, plus ten more.

The duplicate was removed, leaving the route prefix registered exactly once.

### Post-merge lint defects

Two unused imports surfaced once the merged tree was linted as a whole: `screen` in `messages-accessibility.test.tsx` and `readFileSync` in `integration-global-setup.ts`. Both were leftovers from earlier refactors that typecheck does not catch. Removed.

## 4. Defects found and fixed during this integration

### P1 — CI-only failure in the integration suite

`startup.integration.spec.ts` imports `AppModule`, and `AppModule` calls `ConfigModule.forRoot` with a validation schema **while the module is evaluated**, i.e. as soon as the import runs. Assigning `process.env` in a `beforeAll` is too late.

The suite had passed locally for months **only because a developer had `backend/.env`**, which `ConfigModule` loads. `.env` is gitignored, so on CI the file was absent and the suite died at import with `Config validation error: "JWT_SECRET" is required`.

This is the worst shape for a test: green on every developer machine, broken on the only machine that matters. Fixed with a Jest `setupFiles` entry that applies the required fixtures before any test module is imported. The same file takes over the background-sweep intervals that `globalSetup` was setting in the parent process — more reliable, since `setupFiles` runs inside each worker.

### Build infrastructure — storage job broken upstream

`minio/minio` was withdrawn from Docker Hub. The repository now returns 404 and the job failed with `pull access denied for minio/minio, repository does not exist`. MinIO's own `quay.io` registry is not anonymously pullable — `tags/list` returns 401 even with an anonymous token — so neither obvious replacement works.

The job now uses `rustfs/rustfs:1.0.1`, pinned, which is already what `scripts/run-storage-tests.sh` uses successfully, so CI and local verification exercise the same server. An intermediate attempt with `bitnamilegacy/minio` pulled successfully but never bound to its port, because that image follows Bitnami's conventions rather than MinIO's.

The readiness loop now dumps container logs before failing, so the next failure diagnoses itself in one run instead of costing a CI cycle.

### Defects inherited from the audit and carried through

- **P1** `EMAIL_SENDER` bound to a class rather than an instance — registration, email verification and password reset returned **500 in every deployment**. All auth tests stubbed the token with a real instance, hiding it behind ~1,600 passing tests.
- **P1** `enableShutdownHooks()` never called, so `SIGTERM` killed the process uncleanly.
- Hardcoded "3,200+ active listings" on the landing page.
- Two WCAG AA contrast failures (2.74:1 and 3.9:1 against a 4.5:1 requirement).
- Unnamed icon-only buttons on Messages and the bottom navigation.
- Horizontal overflow up to 268px at 768px and 12px at 1024px on every screen.

## 5. Verification

### Local (this machine)

| Check | Result |
|---|---|
| Typecheck — frontend and backend | clean |
| Lint — frontend and backend | clean |
| Frontend unit | **250 passed**, 22 files |
| Backend unit | **294 passed**, 36 suites |
| Frontend production build | succeeds |
| Backend production build | succeeds |
| Production dependency audit | **0 vulnerabilities** |
| Workflow YAML | all three parse |

### GitHub Actions — run 38493626692, all six jobs green

| Job | Result |
|---|---|
| Frontend | ✅ success |
| Backend | ✅ success |
| Integration (PostgreSQL) | ✅ **339 passed**, 18 suites |
| Storage integration (S3) | ✅ **33 passed**, 3 suites |
| Dependency security audit | ✅ success |
| Migration drift | ✅ success, "No difference detected" |

`Migration drift` passing in CI is the machine-checked confirmation that the merged migration chain and the Prisma schema agree.

### Not run on this machine

The PostgreSQL and storage integration suites, HTTP journey probes, browser suites and the migration drift check could not run locally: the host disk is **100% full (393 MiB free)**, which makes Docker's `overlay2` mount read-only, so no container can be created or started. `docker start` on an existing container fails the same way.

**No volume or image was pruned to work around this.** Docker reports 12.15 GB of reclaimable volumes; pruning would risk real data, which is outside what was authorised. All of these suites ran in CI on fresh runners instead.

Root cause of the host condition: the data volume is at capacity, and `~/Library/Containers/com.docker.docker/.../Docker.raw` is 60 GB. Freeing host disk space is a maintainer action.

## 6. PR dispositions

| PR | Disposition | Rationale |
|---|---|---|
| **#25** `milestone2-database-security-integrity` | **Superseded — recommend closing** | It is an ancestor of the milestone branch with **0 unique commits**. Verified with `git merge-base --is-ancestor` and `git rev-list --count`, which returns 0. Merging it would contribute nothing. |
| **#26** `final-audit-12-milestones` | **Superseded by #27 — recommend closing** | Contains all of the work but conflicts with `main`. Everything in it is in #27, plus the merge resolution and two CI fixes. |
| **#27** `integration/final-neighborly-release` | **Ready for review** | All 12 milestones preserved, conflicts resolved, all six CI jobs green. |

Neither #25 nor #26 has been closed. Their content is fully accounted for in #27, but closing a PR is a shared-state change and that call is the maintainer's.

## 7. All 12 milestones preserved

Confirmed by walking the history of the integration branch. Milestones 1–12 each have their commit, and the final audit's 11 commits follow. 53 commits of milestone history plus 3 integration commits, all ancestors of the integration branch. No branch was deleted; 32 local branches remain.

## 8. Safety confirmation

- `main` was **not** modified — still `214bad9` on the remote.
- Nothing merged into `main`. PR #27 is open for review.
- No force-push, rebase, reset or amend.
- No branch deleted.
- No deployment, no staging or production change, no volume deleted, no production data touched.
- No secret committed; pre-push scan clean.
- No test was disabled and no assertion weakened to reach green.

## 9. Is PR #27 ready to merge?

**Yes, on the evidence available.** All six CI jobs pass on the integration HEAD, including the 339 integration tests, the 33 storage tests and the migration drift check.

Two things should be settled before merging, both outside the code:

1. **The host disk is full.** It did not affect CI, but it will block any local verification until space is freed.
2. **The release blockers documented in the audit still stand** — notably no email provider is connected, which means verification and password-reset mail reaches nobody. That is a product-readiness decision, not a merge blocker, and it is unchanged by this integration.

One genuine limitation is worth restating: the app routes on component state rather than URL paths, so there are no shareable in-app links and the back button does not navigate. That predates this integration and is unchanged.