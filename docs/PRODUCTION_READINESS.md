# Production readiness

Date: 2026-10-19
SHA: parent `12540f88303f8e5ab2404ee10fc43ec657d02cf0`, plus the Orbit lane on `cursor/orbit-devops-p1-7a93`. The commit SHA is the PR head after this file lands.
Environment: not deployed. `deploy-production.yml` was not dispatched. No DNS change. No paid service. Sentry and Resend were not added.

This file records the honest state. It is a skeleton for later updates. Empty sections stay empty until evidence exists.

## Runtime

| Check | State |
| --- | --- |
| Production host | None. Workflow is a stub that refuses |
| Public DNS and TLS | None |
| Production database | None |
| Production Redis | None. Production env validation requires `REDIS_URL` before boot |
| Object storage | Staging Compose now pins the same `rustfs/rustfs:1.0.1` image as CI. No production bucket is configured in this repo. The image was not pulled on this VM |
| Email provider | None. Messages stop in `EmailOutbox` |
| Error tracking | `SENTRY_DSN` is accepted and ignored. No SDK |
| Uptime monitor | None |
| Secret store | Environment variables only. No vault |

## Application

| Check | State |
| --- | --- |
| Single-process API | Implemented in source. CI integration on this SHA passed. Not booted in production. This branch's CI is not counted until the Actions run on the PR head finishes |
| More than one API process | Socket.IO Redis adapter is wired when `REDIS_URL` is set. Unset, the process stays single-node. A Jest spec starts two gateways and delivers a message across an in-memory pub/sub. A live Redis across two OS processes was not run in this environment |
| Auth, refresh, logout | Implemented. CI auth integration passed on this SHA. Not booted in production |
| Email verification that a person can complete | Not ready. No provider |
| Marketplace pause and suspension privacy | Merged (BL-001, BL-002, PRs #29 and #30). Not booted in production |
| Marketplace settlement | Merged (BL-003, PR #30). Not booted in production |
| Trust badges | Merged (BL-004, BL-010, PRs #31 and #29). Not booted in production |
| Shareable URLs | Merged (BL-005, PR #31). Web servers fall back to `index.html` for those paths. Staging was not booted here |
| Payments and AI | Absent on purpose |
| Legal consent | Placeholders only. Links do not open them |
| Search indexing | `noindex` is set. Correct until the owner says otherwise |

## Data safety

| Check | State |
| --- | --- |
| Migrations on an empty database | Not re-run locally on this VM. The last recorded CI pass in the takeover audit is `dc761e5`, not this branch |
| Migration drift | Not re-run locally. Same limit as the row above |
| Down migrations | None |
| Backup and restore rehearsal | Scripts exist. Not executed in this audit. Not a pass |
| Dev Compose network exposure | Postgres and Redis publish on `127.0.0.1` only. Not probed live. Docker is not installed on this VM |

## Evidence this conclusion uses

- Takeover audit of `dc761e5` in `docs/ENGINEERING_TAKEOVER_AUDIT.md`, plus PRs #29–#31 on `main`.
- Local unit, lint, typecheck, and production builds for this lane are in `docs/QA_RELEASE_REPORT.md`. A command that is not listed there did not run.
- CI run 38623514967 on `dc761e5` is not evidence for this branch. This branch's six jobs are counted only after Actions reports them.
- Local Docker, journey, security-probe, browser axe, and backup rehearsal did not run. They are not counted as passes.
- Older pass counts from `343584a` are not evidence for this branch's journeys or axe run.

## Not filled in

- Production deploy log: none.
- Restore drill log: none.
- Provider account names: none.
- On-call rotation: none.
- Load test: none.

## Recommendation

**NOT READY**

BL-001 through BL-010 are merged, and this lane binds dev database ports to loopback, pins staging object storage to rustfs, and adds the History API fallback. A production approval still needs a named host that is not deployed from the refusing workflow, an email path that leaves `EmailOutbox`, legal text the owner is willing to show, and a decision to keep `noindex`. CI being green does not close those gaps. Suites that did not run are not evidence that production would pass them.
