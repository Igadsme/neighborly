# QA test report

## Shutdown rule

No new tests were run during shutdown. Results below are recorded evidence from prior work or read-only integrity checks.

## Recorded results

| Test area | Result | Evidence |
| --- | --- | --- |
| GitHub Actions QA pipeline | PASS: 13/13 jobs | Run #128 was reported green before shutdown; no new run was triggered. |
| Backend local tests | PASS in prior work | Earlier project record reported 29 backend tests passed. |
| Staged marketplace API journey | PASS: 20/20 steps | `artifacts/local-staging-20261019/marketplace-e2e.json`; tokens redacted. |
| Staged security probe | PASS for recorded assertions | `artifacts/local-staging-20261019/security-corrected.json`; 403 authorization, 200 first refresh, 401 replay. |
| Browser smoke/accessibility | Historical PASS: 31/31 checks | `artifacts/milestone10-browser/browser-check.json`; not current staging evidence and includes connection-refused requests. |
| Historical browser/axe suite | Historical 330 passed, 0 failed | Milestone documentation; no current rerun during shutdown. |
| Storage integration | Prior CI/local evidence recorded | `docs/MILESTONE_9_NEIGHBORHOOD_MISSIONS.md`; not rerun during shutdown. |
| Backup checksums | PASS | QA package `BACKUP/SHA256SUMS` validates PostgreSQL dump and object-storage archive. |
| Backup restore | Prepared, not executed during shutdown | `RECOVERY_AND_CLEANUP.md` describes disposable restore steps. |
| Real-user testing | Not started as a live study | Prior audit classified supervised local testing as CONDITIONAL GO. |
| Grok simulated-user testing | No verified result located | Must not be represented as completed. |

## QA package

The latest run is `/Volumes/T7 Shield/Projects/neighborly-qa-results/qa-20261019-1644/`. It contains a manifest, five synthetic QA account records, PostgreSQL backup, RustFS archive, checksums, restore SQL, and a scoped cleanup procedure. The credential file was not opened, displayed, staged, or copied.

The scoped cleanup procedure is documented but was not executed. It requires explicit approval before any real cleanup.
