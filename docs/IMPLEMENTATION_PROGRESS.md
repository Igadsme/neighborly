# Implementation progress

Date: 2026-10-19
Baseline audited: `dc761e51864e03a57c056b4bb2068c6362ced40b`
`main` when this note was written: `12540f88303f8e5ab2404ee10fc43ec657d02cf0`
Orbit lane branch: `cursor/orbit-devops-p1-7a93`

## Current state

BL-001 through BL-010 are merged on `main`. This lane does not re-open them. The rows below say which PR merged each one. This lane did not re-run those PRs' individual acceptance commands apart from the full frontend and backend unit gates recorded in `docs/QA_RELEASE_REPORT.md`.

| Area | State |
| --- | --- |
| Application code | P0 product fixes from PRs #29, #30, and #31 are on `main`. This lane does not edit `src/` or `backend/src` |
| Schema and migrations | Unchanged by this lane |
| Deploy | Not run. Production workflow was not dispatched |
| `main` | Not pushed by this lane |

## Backlog

Status values: `not started`, `in progress`, `blocked`, `done`. `done` requires the acceptance criteria in `docs/ENGINEERING_BACKLOG.md` and a command that ran. A suite that could not run does not move a row to `done`.

| ID | Title | Status | Note |
| --- | --- | --- | --- |
| BL-001 | Pause hides a direct read | done | Merged in #29 (`cafae39`) |
| BL-002 | Suspended public rows | done | Merged in #30 (`03f25e1`) |
| BL-003 | Two-sided marketplace settlement | done | Merged in #30 (`03f25e1`) |
| BL-004 | Service verified badge | done | Merged in #31 (`12540f8`) |
| BL-005 | URLs and 404 | done | Merged in #31 (`12540f8`). History API paths need the SPA fallback below |
| BL-006 | UUID 400s | done | Merged in #29 (`cafae39`) |
| BL-007 | Rate limits and Retry-After | done | Merged in #30 (`03f25e1`) |
| BL-008 | Fail closed without VITE_API_URL | done | Merged in #31 (`12540f8`) |
| BL-009 | Template web origin | done | Merged in #29 (`cafae39`). `env.example` uses port 8443 |
| BL-010 | Demo seed trust values | done | Merged in #29 (`cafae39`) |
| BL-011 | Email delivery | blocked | Owner must name a provider and supply credentials |
| BL-012 | Legal text | blocked | Counsel and owner |
| BL-013 | Production host | blocked | Owner hosting decision. Do not deploy |
| BL-014 | HomeFeed preview neighbors | not started | |
| BL-015 | Staff report screen | not started | |
| BL-016 | Appointments | blocked | Owner chooses create versus remove |
| BL-017 | Photos on first publish | not started | |
| BL-018 | Loopback dev ports | done | `docker-compose.yml` publishes Postgres `127.0.0.1:5432` and Redis `127.0.0.1:6379`. A live bind was not probed on this VM (no Docker daemon) |
| BL-019 | Docs drift | done | README, the map, project status, the terms placeholder, and the six takeover docs match `main` after BL-001–BL-010. The older inventory in `docs/DEPLOYMENT.md` assigns `replace-with-*` placeholders. CI rejects `NAME=change-me` and `NAME=neighborly-secret` in `docs/` and `env*.example`. Doc-only for application behavior |
| BL-020 | Staging object store image | done | Staging profile uses `rustfs/rustfs:1.0.1` with the same S3 API shape as CI. Published linux/amd64 layers include `/usr/bin/curl`, which the healthcheck calls. Data is on `rustfs-staging-data`. The old `neighborly-staging-minio` volume stays declared and unused |
| BL-021 | Multi-process realtime | not started | |
| BL-022 | Error tracking | blocked | Vendor decision. The no-op hook is confirmed |
| BL-023 | Package name and Figma shell | done | Root package name is `neighborly-web`, matching `neighborly-api` and the `neighborly-web` image. `noindex` stays. Figma HTML markers stay because the Vite title plugin reads them |
| BL-024 | Tracked smoke PNGs | blocked | Owner must agree to remove them |
| BL-025 | Inactive controls | not started | |
| BL-026 | PostGIS or honest radius | not started | |
| BL-027 | Backup rehearsal | not started | Acceptance needs Docker. Not a pass today |
| BL-028 | Vertical integration specs | not started | |
| BL-029 | Journey and security probes | not started | Did not run. Not a pass |
| BL-030 | Axe harness | not started | Did not run. Not a pass |
| BL-031 | braces dev advisory | partial | `braces@3.0.3` is still the latest npm release. GHSA-vfj7-8cjw-p6xm / CVE-2026-93687 covers `<=3.0.3` and names no patched version. CI keeps `--prod` as the blocking gate. The full audit stays non-blocking and still prints `braces`. Not suppressed |
| BL-032 | Listing card ratings | not started | |
| BL-033 | Access token storage | not started | P2 |
| BL-034 | Map decision | blocked | Owner |
| BL-035 | Compare and price alerts | not started | |
| BL-036 | Unlabeled icons | not started | Suspected only. Do not treat as reproduced |
| BL-037 | Search indexing | blocked | `noindex, nofollow` stays. `.figma/make/site.json` still has `robots.index: false`. Not removed |
| BL-038 | Payments | not started | P3. Do not build unless the owner asks |
| BL-039 | AI | not started | P3. Do not build unless the owner asks |
| BL-040 | Social sign-in | not started | P3. Do not build unless the owner asks |

## Already in the tree, and not reopened by this phase

These are recorded so later agents do not rebuild them. Evidence is the audit. This phase did not re-prove the Docker-backed rows locally.

- Registration, refresh, logout, CSRF, argon2id.
- Listing upload with byte signatures (CI storage job on `dc761e5` passed; local storage suite did not run).
- Borrow overlap rules, two-sided handoff, staff-only borrow dispute resolution.
- Review uniqueness and delayed publication (CI integration on `dc761e5` passed).
- Realtime client subscription to `message.created` (local unit test passed; a two-process proof did not run).

## SPA history fallback

Not a numbered backlog row. PR #31 put screens on History API paths. Staging Caddy, the web nginx config, `deploy/production/Caddyfile` (not read by the refusing production workflow), and `vite preview` fall back to `index.html` for unknown extensionless paths. `/api`, `/socket.io`, and `/assets` are not rewritten. A missing asset is 404.

Status: done in config. Staging was not booted here. `vite preview` was checked locally; the command and exit are in `docs/QA_RELEASE_REPORT.md`.

## How to update this file

When an item starts, set `in progress` and name the branch. When it finishes, set `done` and point at the commit and the command that satisfied acceptance. If acceptance needs Docker and Docker is absent, leave the row `in progress` and say the proof did not run.
