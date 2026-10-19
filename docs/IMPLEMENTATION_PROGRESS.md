# Implementation progress

Date: 2026-10-19
Baseline audited: `dc761e51864e03a57c056b4bb2068c6362ced40b` (`main`)
This document's branch: `cursor/takeover-audit-m1n2`
Phase: audit only. No application code has been changed in this phase.

## Current state

The takeover audit and the backlog exist. Every backlog item is **not started**. Nothing in `src/` or `backend/` was edited to fix a finding.

| Area | State |
| --- | --- |
| Application code | Unchanged from `dc761e5` |
| Schema and migrations | Unchanged |
| Tests | Unchanged. Local unit suites were executed; they were not modified |
| Deploy | Not run. Production workflow was not dispatched |
| `main` | Not updated by this work |

## Backlog

Status values: `not started`, `in progress`, `blocked`, `done`. `done` requires the acceptance criteria in `docs/ENGINEERING_BACKLOG.md` and a command that ran. A suite that could not run does not move a row to `done`.

| ID | Title | Status | Note |
| --- | --- | --- | --- |
| BL-001 | Pause hides a direct read | not started | |
| BL-002 | Suspended public rows | not started | |
| BL-003 | Two-sided marketplace settlement | not started | |
| BL-004 | Service verified badge | not started | |
| BL-005 | URLs and 404 | not started | |
| BL-006 | UUID 400s | not started | |
| BL-007 | Rate limits and Retry-After | not started | |
| BL-008 | Fail closed without VITE_API_URL | not started | |
| BL-009 | Template web origin | not started | |
| BL-010 | Demo seed trust values | not started | |
| BL-011 | Email delivery | blocked | Owner must name a provider and supply credentials |
| BL-012 | Legal text | blocked | Counsel and owner |
| BL-013 | Production host | blocked | Owner hosting decision. Do not deploy |
| BL-014 | HomeFeed preview neighbors | not started | |
| BL-015 | Staff report screen | not started | |
| BL-016 | Appointments | blocked | Owner chooses create versus remove |
| BL-017 | Photos on first publish | not started | |
| BL-018 | Loopback dev ports | not started | |
| BL-019 | Docs drift | not started | |
| BL-020 | Staging object store image | not started | |
| BL-021 | Multi-process realtime | not started | |
| BL-022 | Error tracking | blocked | Vendor decision. The no-op hook is confirmed |
| BL-023 | Package name and Figma shell | not started | |
| BL-024 | Tracked smoke PNGs | blocked | Owner must agree to remove them |
| BL-025 | Inactive controls | not started | |
| BL-026 | PostGIS or honest radius | not started | |
| BL-027 | Backup rehearsal | not started | Acceptance needs Docker. Not a pass today |
| BL-028 | Vertical integration specs | not started | |
| BL-029 | Journey and security probes | not started | Did not run. Not a pass |
| BL-030 | Axe harness | not started | Did not run. Not a pass |
| BL-031 | braces dev advisory | not started | No patched release. Production audit is already clean |
| BL-032 | Listing card ratings | not started | |
| BL-033 | Access token storage | not started | P2 |
| BL-034 | Map decision | blocked | Owner |
| BL-035 | Compare and price alerts | not started | |
| BL-036 | Unlabeled icons | not started | Suspected only. Do not treat as reproduced |
| BL-037 | Search indexing | blocked | Keep noindex |
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

## How to update this file

When an item starts, set `in progress` and name the branch. When it finishes, set `done` and point at the commit and the command that satisfied acceptance. If acceptance needs Docker and Docker is absent, leave the row `in progress` and say the proof did not run.
