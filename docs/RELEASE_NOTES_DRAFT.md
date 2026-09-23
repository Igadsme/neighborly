# Release notes (draft)

**Launch is pending Product Owner approval.** These notes are not published. Neighborly is **not launched** and **not deployed**. Do not post them, tag a release, or send them as an announcement.

Product Owner: Imani Gad. This draft sits with the Phase 7 preparation package (`docs/PHASE_7_PROD_PREP.md`).

## Status

Staging QA on the local Compose stack finished with no open P0 or P1 defects (`docs/PHASE_6_STAGING_QA.md`). That stack is `https://staging.neighborly.localhost:8444/` with Caddy's internal certificate. It is not a public site. A public hostname, DNS, certificate, and paid host are not approved.

## What a later launch could say

Only after the product owner approves the wording and the host:

Neighborly is a request-first local marketplace. People post what they need, compare offers, message, complete the exchange, and leave a review. Housing, jobs, services, and community posts are in the same app. The interface is the existing Figma screens.

Accounts use an email and a password. The API stores the password with Argon2 and issues a bearer token. Reports, blocks, and staff suspend and restore exist.

## What a launch must not say

- Do not say the product is production-ready until the product owner says so. This draft does not say that.
- Do not mention a public URL. None is registered.
- Do not claim AI review, scam detection, embeddings, or semantic search. Painted copy on the Create Listing and landing screens is not a v1 capability.
- Do not claim payments, payouts, Mapbox, email delivery, or photo upload. Those are unwired.
- Do not claim share links. The control says sharing is not in this version.
- Do not claim the seed accounts are real neighbors. `seed.<firstname>@example.com` and the password `neighborly-local-seed` are fixtures and must not be loaded into a public database.

## Operator notes (not for users)

- Node 22 and pnpm 10.34.3 (`.mise.toml`).
- Pull request CI is `.github/workflows/ci.yml`.
- Staging deploy is manual (`.github/workflows/deploy-staging.yml`). Production deploy is a manual stub that refuses (`.github/workflows/deploy-production.yml`). Neither was dispatched for this draft.
- Legal pages are placeholders under `docs/legal/`. The in-app links still point at `#`.
