# QA and release report

Date: 2026-10-19
SHA under test: `dc761e51864e03a57c056b4bb2068c6362ced40b` (`main`)
Report branch: `cursor/takeover-audit-m1n2`
Verdict: **not a release sign-off.** Unit gates passed. Several release suites did not run. Those are not passes.

## What ran locally

Node v22.14.0. pnpm 10.34.3. Disk: 247G free. Docker: not installed.

| Command | Exit | Count |
| --- | --- | --- |
| Root `pnpm install --frozen-lockfile` | 0 | 315 packages |
| Root `pnpm lint` | 0 | |
| Root `pnpm exec tsc --noEmit` | 0 | |
| Root `pnpm test` | 0 | 250 passed, 22 files |
| Root `pnpm build` | 0 | |
| Backend `pnpm install --frozen-lockfile` | 0 | 734 packages |
| Backend `pnpm exec prisma generate` | 0 | Client 6.19.3 |
| Backend `pnpm exec prisma validate` with no `DATABASE_URL` | 1 | P1012. Not a schema failure. Retry below |
| Backend `prisma validate` with `DATABASE_URL` set to a local URL and no server contacted | 0 | Schema valid |
| Backend `pnpm lint` | 0 | |
| Backend `pnpm exec tsc --noEmit` | 0 | |
| Backend `pnpm test` | 0 | 294 passed, 36 suites |
| Backend `pnpm build` | 0 | |
| Root `pnpm audit --prod --audit-level=moderate` | 0 | No production advisories |
| Root `pnpm audit` (all dependencies) | 0 | |
| Backend `pnpm audit --prod --audit-level=moderate` | 0 | |
| Backend `pnpm audit` (all dependencies) | 1 | `braces` high, dev-only, no patched release |

## What CI ran on this SHA

[Actions run 38623514967](https://github.com/Igadsme/neighborly/actions/runs/38623514967), push of the PR #27 merge, conclusion success:

| Job | Conclusion |
| --- | --- |
| Frontend | success |
| Backend | success |
| Integration (PostgreSQL) | success |
| Storage integration (S3 / rustfs) | success |
| Migration drift | success |
| Dependency security audit | success |

Those six jobs are passes for `dc761e5`. They are not a substitute for the scripts CI does not contain.

## What did not run

These did not pass.

| Suite | Reason |
| --- | --- |
| `scripts/run-integration-tests.sh` | No Docker. CI's Integration job is a separate pass for the same SHA |
| `scripts/run-storage-tests.sh` | No Docker. CI's Storage job is a separate pass for the same SHA |
| Local `prisma migrate diff` | No Postgres. CI's Migration drift job is a separate pass for the same SHA |
| `scripts/final-audit-journeys.mjs` | No API. Not in CI. The old 42/42 result is `343584a`, not this SHA |
| `scripts/final-audit-security.mjs` | No API. Not in CI. The old 28/28 result is `343584a`, not this SHA |
| `scripts/milestone10-auth-check.mjs` | No browser stack. Not in CI. Prior axe is not a pass here |
| `scripts/milestone10-browser-check.mjs` | Same |
| `scripts/docker-release-e2e.mjs` | No Compose |
| Backup and restore rehearsal | No Postgres |

## Product defects QA has not re-executed against a live API

Source inspection confirmed them. This report does not claim an HTTP reproduction on this VM, because the API was not started.

- Paused listing still returned by public get.
- Suspended seller's published listings still public.
- One participant can complete a marketplace transaction or settle its dispute.
- Service screens force a verified avatar.
- Several UUID routes lack `ParseUUIDPipe`.
- Several write routes lack a rate limit, and 429s omit `Retry-After`.

## Release recommendation from QA

Do not tag a release from this report. P0 items in `docs/ENGINEERING_BACKLOG.md` are open. Journey, security-probe, and browser evidence for this SHA does not exist.
