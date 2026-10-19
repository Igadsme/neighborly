# Agent ownership

Date: 2026-10-19
Status: skeleton. This map assigns files so later work does not collide. It does not assign people, grant merge rights, or start implementation.

Owners named here are roles from the takeover backlog:

| Role | Scope |
| --- | --- |
| June | UX copy, accessibility, legal presentation, empty and error states |
| Nova | Frontend application code |
| Forge | API, Prisma, domain rules |
| Orbit | CI, Compose, deploy, runtime config |
| Sentinel | Test suites, probes, release evidence |
| Cipher | Auth, safety, rate limits, abuse cases |
| Atlas | Contracts that cross the UI and the API, including email and media seams |

Imani Gad remains the product owner. An agent does not merge to `main`, deploy, buy a service, or change DNS.

## Conflict rule

The primary owner edits the path. A partner is named on the backlog item when the change crosses a role. The partner reviews; they do not take the file. Docs that record someone else's tree are updated by the primary owner of that change in the same commit.

Tests live next to the code they cover. Sentinel owns the harnesses and the decision to add a job. The feature owner writes the assertion.

## Frontend (Nova, with June on copy and a11y)

| Path | Primary | Notes |
| --- | --- | --- |
| `src/App.tsx`, `src/main.tsx`, `src/index.css` | Nova | Routing work (BL-005) is Nova. June reviews headings, focus, and 404 copy |
| `src/pages/**` | Nova | June owns copy and a11y defects inside these files when the backlog says June |
| `src/components/**` | Nova | Shared controls. June for accessible names |
| `src/api/client.ts`, `src/api/types.ts` | Atlas | Contract with the API. Nova wires screens to it |
| `src/lib/**` | Nova | `src/lib/realtime.ts` stays Nova. Atlas reviews if the event names change |
| `src/data/**` | June | Fixture and preview copy. Nova deletes a fixture only when a screen stops reading it |
| `index.html`, `vite.config.ts`, `vitest.config.ts`, root `package.json`, `pnpm-lock.yaml` | Nova | Orbit reviews CI impact of a lockfile change |
| `.figma/**` | June | `noindex` stays until BL-037 |

## Backend (Forge, with Cipher on security)

| Path | Primary | Notes |
| --- | --- | --- |
| `backend/src/main.ts`, `backend/src/app.module.ts` | Forge | Orbit reviews shutdown, port, and env validation changes |
| `backend/src/auth/**` | Cipher | Forge reviews session schema changes |
| `backend/src/safety/**` | Cipher | |
| `backend/src/common/rate-limit.ts`, `backend/src/common/http-security.ts`, `backend/src/common/uploads.ts` | Cipher | |
| `backend/src/common/**` other than those | Forge | |
| `backend/src/listings/**`, `backend/src/requests/**`, `backend/src/transactions/**` | Forge | BL-001, BL-003. Cipher reviews the authorization change |
| `backend/src/messaging/**`, `backend/src/notifications/**` | Forge | BL-021 adapter is Forge |
| `backend/src/borrow/**`, `backend/src/missions/**`, `backend/src/passport/**` | Forge | |
| `backend/src/housing/**`, `backend/src/jobs/**`, `backend/src/services/**`, `backend/src/community/**` | Forge | |
| `backend/src/storage/**` | Atlas | Media seam. Forge reviews the API |
| `backend/src/users/**`, `backend/src/categories/**`, `backend/src/health/**`, `backend/src/events/**` | Forge | |
| `backend/prisma/schema.prisma`, `backend/prisma/migrations/**` | Forge | Orbit reviews a migration that CI's drift job must accept |
| `backend/prisma/seed.ts`, `backend/prisma/bootstrap.ts` | Forge | Seed trust values are BL-010 |
| `backend/package.json`, `backend/pnpm-lock.yaml` | Forge | Cipher reviews a new security-sensitive dependency. Orbit reviews CI |

## DevOps (Orbit)

| Path | Primary | Notes |
| --- | --- | --- |
| `.github/workflows/**` | Orbit | Sentinel asks for a new test job. Orbit adds it |
| `docker-compose.yml`, `deploy/**`, `scripts/staging-*.sh`, `scripts/backup-postgres.sh`, `scripts/restore-postgres.sh` | Orbit | |
| `env.example`, `env.staging.example`, `env.production.example` | Orbit | Atlas owns `PUBLIC_WEB_ORIGIN` and email variables when BL-009 or BL-011 lands |
| `scripts/run-integration-tests.sh`, `scripts/run-storage-tests.sh` | Sentinel | Orbit owns the images those scripts pull |

## QA (Sentinel)

| Path | Primary | Notes |
| --- | --- | --- |
| `scripts/final-audit-journeys.mjs`, `scripts/final-audit-security.mjs` | Sentinel | |
| `scripts/milestone10-*.mjs`, `scripts/docker-release-*.mjs`, `scripts/m11-concurrency-check.mjs` | Sentinel | |
| `backend/src/**/*.integration.spec.ts`, `backend/src/**/*.spec.ts` | The feature owner | Sentinel owns the integration config and whether CI runs the file |
| `src/**/*.test.tsx`, `src/**/*.test.ts` | The feature owner | |
| `docs/QA_RELEASE_REPORT.md` | Sentinel | Updated only from commands that ran |

## Integration and product docs (Atlas, unless noted)

| Path | Primary |
| --- | --- |
| `docs/FRONTEND_BACKEND_MAP.md`, `docs/INTEGRATION_LOG.md`, `docs/API_SPEC.md`, `docs/EMAIL_DELIVERY.md`, `docs/STORAGE.md` | Atlas |
| `docs/ARCHITECTURE.md`, `docs/DATABASE_DESIGN.md`, `docs/DECISIONS.md` | Forge |
| `docs/SECURITY.md`, `docs/SECURITY_FINDINGS.md` | Cipher |
| `docs/UX_REQUEST_FLOW_STATES.md`, `docs/MILESTONE_10_UI_UX_ACCESSIBILITY_PERFORMANCE.md`, `docs/MILESTONE_11_A11Y_MANUAL_CHECKLIST.md` | June |
| `docs/legal/**` | June, after counsel. Do not replace placeholders with invented policy |
| `docs/DEPLOYMENT.md`, `docs/PRODUCTION.md`, `docs/INCIDENT_ROLLBACK.md`, `docs/LAUNCH_CHECKLIST.md` | Orbit |
| `docs/ENGINEERING_TAKEOVER_AUDIT.md`, `docs/ENGINEERING_BACKLOG.md` | Atlas keeps them aligned with the audit. Feature owners do not silently retitle a cause |
| `docs/IMPLEMENTATION_PROGRESS.md` | The agent who lands a backlog item updates their row in the same commit |
| `docs/PRODUCTION_READINESS.md` | Orbit. Recommendation changes only when the evidence section changes |
| `docs/QA_RELEASE_REPORT.md` | Sentinel |
| `README.md` | Atlas |

## What is unowned on purpose

`artifacts/docker-release-verification/browser-smoke/*.png` stays until BL-024. Orbit deletes or ignores them after the owner agrees. Do not commit new PNGs there.

AppleDouble `._*` files stay gitignored. Nobody adds them.

Payments, AI, and social login have no implementation owner until the owner opens BL-038, BL-039, or BL-040.
