# Resume checkpoint

## Git workspaces

### Authoritative APFS checkout

- Path: `/Users/gadimani/Projects/neighborly-main`
- Branch: `main`
- HEAD: `cf2d047d02d16bd859cd0eb9b4b37b25a234b309`
- Remote: `https://github.com/Igadsme/neighborly.git`
- Tracking: `origin/main`, aligned at inspection time
- Pre-shutdown changes: `README.md`, `docs/PROJECT_STATUS.md`

### Preserved T7 checkout

- Path: `/Volumes/T7 Shield/Projects/neighborly`
- Branch: `fix/staging-preserve-files`
- HEAD: `331a255`
- Working tree: generated `playwright-report/index.html`, `artifacts/local-staging-20261019/`, and `test-results/`
- Git warnings: repeated non-monotonic AppleDouble index entries under `.git/objects/pack/._*`
- Policy: do not use this checkout for Git operations; preserve it for staging/evidence.

## Staging

Six containers remain running and healthy under Compose project `neighborly-staging-private`. No restart, rebuild, migration, restore, cleanup, volume operation, or data mutation was performed during shutdown.

## Backups and QA data

- QA run: `/Volumes/T7 Shield/Projects/neighborly-qa-results/qa-20261019-1644/`
- PostgreSQL and RustFS backup files exist.
- `BACKUP/SHA256SUMS` verified both backup files successfully.
- The credential file remains private and was not displayed or committed.
- `qa-cleanup.sql` is dry-run by default and was not executed.
- Existing staging accounts and QA records were preserved.

## Safe resume procedure

1. Read this checkpoint and verify the APFS branch/status.
2. Confirm Docker and the six staging containers before touching application code.
3. Preserve or make a new recovery backup before any data-changing rehearsal.
4. Work only from the APFS checkout; leave the T7 checkout and volumes untouched.
5. Run tests explicitly and record fresh evidence; do not reuse historical pass claims without dates.
6. Obtain separate approval before pushing, merging, deploying, cleaning QA rows, or restoring over live staging.
