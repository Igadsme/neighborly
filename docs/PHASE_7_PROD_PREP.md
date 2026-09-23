# Phase 7 — Production preparation

Completion record for branch `cursor/phase7-prod-prep-i9j0`.

**NOT LAUNCHED / NOT DEPLOYED.**

Phase 7 preparation is complete and **waiting for Product Owner approval** before any deploy or announcement. Product Owner is Imani Gad. Atlas (CTO) holds merge until she reviews. This record does not say the product is production-ready, released, or safe to announce.

Base: `aaa989d` (`Phase 6: staging QA (P0/P1 cleared)`).

Nothing in this phase registered a domain, changed DNS, bought or provisioned paid infrastructure, started a public staging hostname, dispatched a deploy workflow, or pushed an image.

## What was prepared

Documents and templates only. Application code, Figma screens, and the Compose staging profile are unchanged.

| Artifact | Role |
| --- | --- |
| `docs/PHASE_7_PROD_PREP.md` | This record |
| `docs/LAUNCH_CHECKLIST.md` | Launch checklist. Every launch row is blocked on the product owner |
| `docs/PRODUCTION.md` | Intended public path. Not executed |
| `docs/DEPLOYMENT.md` | Staging stays the verified path. Section 9 points here |
| `docs/INCIDENT_ROLLBACK.md` | Incident and rollback summary. Points at the Compose scripts that exist |
| `docs/RELEASE_NOTES_DRAFT.md` | Draft notes. Launch is pending product-owner approval |
| `docs/legal/TERMS_OF_SERVICE_PLACEHOLDER.md` | Placeholder. Not a published policy |
| `docs/legal/PRIVACY_POLICY_PLACEHOLDER.md` | Placeholder. Not a published policy |
| `docs/legal/COOKIE_POLICY_PLACEHOLDER.md` | Placeholder. Not a published policy |
| `env.production.example` | Placeholders only. Copying it unchanged fails production boot on purpose |
| `.github/workflows/deploy-production.yml` | `workflow_dispatch` stub. It refuses to build, push, or deploy |

`README.md` states that launch is pending product-owner approval.

## What staging already proved

Phase 5 and Phase 6 stay the verified environment. That environment is Docker Compose on an operator machine:

- Frontend, API, PostGIS, Redis, and MinIO
- Caddy HTTPS with an internal CA at `https://staging.neighborly.localhost:8444/`
- Phase 6 staging QA: P0 open **0**, P1 open **0**

That QA result is not a launch approval. The certificate is local. The seed password is a fixture. Public HTTPS and paid hosts stay blocked.

## What this phase did not do

- No production deploy command
- No domain registration
- No DNS change
- No paid database, cache, object store, app host, or monitoring account
- No public staging hostname
- No dispatch of `.github/workflows/deploy-production.yml` or `.github/workflows/deploy-staging.yml`
- No image push to GHCR
- No real secret committed
- No change to the Figma UI
- No AI feature
- No claim that Neighborly is production-ready or released

## Product Owner decisions still required

Imani Gad must decide each item before anyone deploys or announces. A green CI run on this pull request does not decide them.

1. Whether to approve a public launch at all. This package does not authorize one.
2. Domain name and registrar. No domain was registered.
3. DNS host and the records for the public app hostname. No DNS was changed.
4. Public TLS (Let's Encrypt on the edge, or the host's certificate). Caddy's internal CA stays the staging certificate only.
5. Whether a public staging hostname is ever allowed. This phase does not start one. Staging stays `staging.neighborly.localhost`.
6. Production Postgres with PostGIS: provider, region, major version (Compose uses PostGIS 16), storage, and who pays. Not provisioned.
7. Production Redis: provider, TLS (`rediss://`), persistence, and eviction. Not provisioned.
8. Object storage provider. No upload route is mounted. Decide whether v1 ships without uploads.
9. Application host, region, replica count, and how `GET /api/v1/health` and `GET /api/v1/ready` are probed. Not provisioned.
10. Secret store for `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGIN`, and `TRUST_PROXY`. GitHub Environment `production` needs required reviewers before any variable is set. Production secrets do not go in the `staging` environment or in git.
11. `TRUST_PROXY`: `1` only when the chosen edge overwrites `X-Forwarded-For` with the client address. Otherwise `0`.
12. The public browser origin (`CORS_ORIGIN`) and the frontend `VITE_API_URL`. The API URL is baked into the web image at build time.
13. Backup schedule, retention, and a restore drill on the chosen Postgres before any announcement. `scripts/backup-postgres.sh` and `scripts/staging-backup.sh` cover Compose only.
14. Monitoring and alerting (5xx rate, `/ready` failures, `rate_limit.redis_fallback`). `captureException` does not send to Sentry. Do not set `SENTRY_DSN` until the SDK is added.
15. Repository variables `PRODUCTION_DEPLOY_ENABLED` and `PRODUCTION_PUSH_IMAGES`. Both stay unset. Do not dispatch the production workflow until a real target exists. The current stub still refuses.
16. Counsel-reviewed Terms of Service, Privacy Policy, and Cookie Policy. The files under `docs/legal/` are placeholders. Landing and onboarding links are `href="#"` and were not changed.
17. Incident contacts and who is allowed to communicate an outage. `docs/INCIDENT_ROLLBACK.md` names roles. It does not page anyone.
18. Rollback owner and how the previous app image is retained on the chosen host. `scripts/staging-rollback.sh` rolls back Compose staging only.
19. Production data rule: start empty. Do not run `backend/prisma/seed.ts` and do not copy dev, staging, or Phase 6 QA rows.
20. Rate limits at the public edge, in addition to the app caps in `backend/src/common/rate-limit.ts`. The edge must pass the real client address. On Compose staging, Caddy buckets auth limits by the Docker bridge address (Phase 6, deferred P2).
21. v1 scope: no AI, no payments, no Mapbox, no email, no uploads. Share stays disabled. Launch copy must not claim those.
22. Who may announce. The product owner is the only approver. This phase does not announce.

## Not claimed

Preparation is not a release. Staging QA with P0 and P1 at zero is not a release. CI on this pull request is not a release. Do not deploy, register a domain, change DNS, buy infrastructure, or announce from this branch.
