# Production readiness

Date: 2026-10-19
SHA: `dc761e51864e03a57c056b4bb2068c6362ced40b`
Environment: not deployed. `deploy-production.yml` was not dispatched. No DNS change. No paid service.

This file records the honest state. It is a skeleton for later updates. Empty sections stay empty until evidence exists.

## Runtime

| Check | State |
| --- | --- |
| Production host | None. Workflow is a stub that refuses |
| Public DNS and TLS | None |
| Production database | None |
| Production Redis | None. Production env validation requires `REDIS_URL` before boot |
| Object storage | Code and CI rustfs proof exist. No production bucket is configured in this repo |
| Email provider | None. Messages stop in `EmailOutbox` |
| Error tracking | `SENTRY_DSN` is accepted and ignored. No SDK |
| Uptime monitor | None |
| Secret store | Environment variables only. No vault |

## Application

| Check | State |
| --- | --- |
| Single-process API | Implemented in source. CI integration on this SHA passed. Not booted in production |
| More than one API process | Not ready. No Socket.IO Redis adapter |
| Auth, refresh, logout | Implemented. CI auth integration passed on this SHA |
| Email verification that a person can complete | Not ready. No provider |
| Marketplace pause and suspension privacy | Not ready. Direct reads still expose paused listings and suspended sellers' rows |
| Marketplace settlement | Not ready. One participant can complete or close a dispute |
| Trust badges | Not ready. Service avatars are always verified. Demo seed writes trust fields |
| Shareable URLs | Not ready. In-app screens are component state. No 404 |
| Payments and AI | Absent on purpose |
| Legal consent | Placeholders only. Links do not open them |
| Search indexing | `noindex` is set. Correct until the owner says otherwise |

## Data safety

| Check | State |
| --- | --- |
| Migrations on an empty database | CI Integration job applied them on this SHA. Not re-run locally |
| Migration drift | CI job passed on this SHA. Not re-run locally |
| Down migrations | None |
| Backup and restore rehearsal | Scripts exist. Not executed in this audit. Not a pass |
| Dev Compose network exposure | Postgres and Redis publish on all interfaces. Staging profile binds loopback. Not probed live |

## Evidence this conclusion uses

- Source at `dc761e5`, recorded in `docs/ENGINEERING_TAKEOVER_AUDIT.md`.
- Local unit, lint, typecheck, and production builds on 2026-10-19. Those passed.
- CI run 38623514967 on `dc761e5`. Six jobs passed, including PostgreSQL integration, storage, and migration drift.
- Local Docker, journey, security-probe, browser axe, and backup rehearsal did not run. They are not counted as passes.
- Older pass counts from `343584a` are not evidence for this SHA's journeys or axe run.

## Not filled in

- Production deploy log: none.
- Restore drill log: none.
- Provider account names: none.
- On-call rotation: none.
- Load test: none.

## Recommendation

**NOT READY**

A production approval would need, at minimum, a named host that is still not deployed from the refusing workflow, an email path that leaves `EmailOutbox`, the four product privacy and trust defects closed (pause, suspension, one-sided settlement, service verified badge), addressable URLs, rate limits with `Retry-After`, UUID 400s, a fail-closed frontend API URL, and legal text the owner is willing to show. None of that is done. CI being green does not close those gaps. Suites that did not run are not evidence that production would pass them.
