# Milestone 2 — Database, Security & Data Integrity

Branch: `milestone2-database-security-integrity`. Builds on Milestone 1 (`15fb246`) and the
implementation commit `f56fbac`.

This document records what Milestone 2 required, what now satisfies it, and how each claim was
verified. Every verification below was executed locally against a disposable PostgreSQL 16
container. No staging or production system was touched.

## Acceptance criteria and evidence

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Offer acceptance is atomic | Done | `RequestsService.acceptOffer` claims the offer with a conditional `updateMany` inside one `$transaction` that also writes the conversation, transaction, and first milestone. Covered by `requests.accept.integration.spec.ts` (9 cases). |
| 2 | Transaction concurrency safety | Done | `TransactionsService.transition` uses a conditional update keyed on the observed status and is idempotent for the current status. Covered by `transactions.integration.spec.ts`. |
| 3 | Request privacy | Done | Public projections exclude `requesterId`, `latitude`, `longitude`. `GET /requests/:id` returns the full row only to the verified requester. Covered by `requests.privacy.integration.spec.ts`. |
| 4 | Safe database migrations | Done | Migration `0006_transaction_offer_unique` aborts loudly on pre-existing duplicate `Transaction.offerId` values and deletes nothing. The full chain applies from an empty database. |
| 5 | Production category bootstrap | Done | `backend/prisma/bootstrap.ts` upserts the 15 marketplace categories by name, is idempotent, and imports no demo data. `pnpm prisma:bootstrap`. Run by `deploy/staging/db-setup.sh` after `migrate deploy`. |
| 6 | Authentication / WebSocket hardening | Done | `readAccessToken` pins `HS256`, verifies with `JWT_SECRET`, and rejects missing `sub` or `email`. `MessagingGateway` authenticates the handshake, and `conversation.join` re-checks token expiry, account status, and participant membership on every join. |
| 7 | Isolated PostgreSQL integration testing | Done | `scripts/run-integration-tests.sh` starts a throwaway container on port 55432 and removes it on exit. `integrationDatabaseUrl()` refuses any non-loopback host. Integration specs are excluded from `pnpm test` and run by a dedicated CI job. |

## 1. Atomic offer acceptance

`RequestsService.acceptOffer`:

1. Loads the offer and confirms the caller is the requester (`loadRequesterOffer`).
2. Re-checks the block list in both directions.
3. Opens one `prisma.$transaction` and claims the offer with
   `updateMany({ where: { id, status: { in: [PENDING, COUNTERED] } } })`. The update locks the
   row, so exactly one concurrent caller can win the claim.
4. In the same transaction creates the two-participant conversation, the `Transaction` at
   `ACCEPTED` with `REQUESTER` / `OFFERER` participants, and the first `TransactionMilestone`.
5. Any `P2002` from the unique `Transaction.offerId` index is surfaced as
   `400 Offer is no longer acceptable`, so a lost race never leaks a driver error.

`counterOffer` and `rejectOffer` use the same conditional-claim pattern, so an accepted offer
can no longer be countered or rejected.

## 2. Transaction concurrency safety

`TransactionsService.transition`:

- Re-requesting the current status returns the current row and writes no duplicate milestone.
- `assertTransactionTransition` still gates legal edges.
- The write is `updateMany({ where: { id, status: observedStatus } })`. A stale request whose
  concurrent counterpart already committed updates zero rows and fails with
  `400 Transaction state changed: expected …, found …` instead of overwriting newer state.

## 3. Request privacy

- `publicRequestSelect` omits `requesterId`, `latitude`, and `longitude`.
- `GET /requests` and the requesterless `GET /requests/:id` return only that projection, plus
  offers reduced to listings without coordinates.
- `GET /requests/:id` sits behind `OptionalAuthGuard`: a missing or invalid token degrades to an
  anonymous read rather than a 401, and a signed-in non-owner is stripped of `requesterId`,
  `latitude`, and `longitude` after the query.
- Authenticated non-owners therefore cannot read another user's precise coordinates.

## 4. Safe database migrations

`prisma/migrations/0006_transaction_offer_unique/migration.sql` runs a `DO` block that counts
offers with more than one transaction and raises with the count if any exist. It modifies no
rows. The migration then creates `Transaction_offerId_key`.

Verified: the whole chain (`0001_init` → `0006`) applies to an empty database, and
`prisma migrate diff --from-migrations … --to-schema-datamodel …` reports `No difference detected`,
so migrations and schema are in sync.

## 5. Production category bootstrap

`backend/prisma/bootstrap.ts` exports `categoryNames`, `categorySlug`, and
`bootstrapCategories`. It upserts by category name with an empty update, so existing ids and
user-created rows are preserved and repeated runs are no-ops. It is separate from
`prisma/seed.ts`, which loads demo users, listings, and messages and must never run in
production.

```bash
cd backend
pnpm prisma:bootstrap   # or: npx tsx prisma/bootstrap.ts
```

## 6. Authentication and WebSocket hardening

- `accessTokenSignOptions` signs with `HS256` and `JWT_SECRET`.
- `readAccessToken` verifies with an explicit algorithm allow-list, then requires a non-empty
  string `sub` and `email`. A token that verifies but carries the wrong shape is rejected.
- `MessagingGateway.afterInit` installs an auth middleware, so unauthenticated sockets are
  refused at handshake. `handleConnection` disconnects anything that still lacks a user.
- `conversation.join` re-validates on every join: expired token, inactive account, or
  non-participant each raise a `WsException`. Room membership does not survive token expiry.

## 7. Isolated PostgreSQL integration testing

```bash
./scripts/run-integration-tests.sh
```

The script runs `docker run --rm`-style lifecycle on a container named `neighborly-m2-test`
bound to `localhost:55432`, applies every migration, runs the integration suite, and removes
the container via an `EXIT` trap. It never reuses the development Compose volume.

`backend/src/common/testing/integration-db.ts` throws unless
`NEIGHBORLY_TEST_DATABASE_URL` is set and its host is loopback, so a misconfigured run cannot
reach a shared or production database.

`backend/jest.config.cjs` ignores `*.integration.spec.ts`, so `pnpm test` stays hermetic. The
new `integration` job in `.github/workflows/ci.yml` provisions a `postgres:16` service
container, runs `prisma migrate deploy`, and executes the suite.

Integration suites: `requests.accept`, `requests.privacy`, `transactions`,
`categories-bootstrap`.

## Verification runs

| Command | Result |
| --- | --- |
| `bash scripts/run-integration-tests.sh` | 4 suites, 22 tests passed; 6 migrations applied to a fresh database |
| `pnpm test` (backend) | 32 suites, 180 tests passed (includes `integration-db.spec.ts`, which proves the loopback-only guard rejects staging and remote hosts) |
| `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build` (backend) | pass |
| `prisma migrate diff --from-migrations → --to-schema-datamodel` | `No difference detected` |
| frontend `pnpm lint`, `tsc --noEmit`, `pnpm test`, `pnpm build` | pass |

## Not in scope for Milestone 2

- `RequestMatch`, `PriceHistory`, and `ListingImage` still have no writer.
- Notifications, payments, uploads, reports, and moderation remain unimplemented endpoints.
- The production deploy workflow is still a refusal stub and was not modified.