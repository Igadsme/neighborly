# Milestone 5 — I Need Request & Matching Engine

Branch: `milestone5-need-request-matching`, branched from Milestone 4 (`34ac8cf`).
Requirements, evidence, and verification runs.

No production system was touched. All database work ran against a disposable
PostgreSQL container created and destroyed by `scripts/run-integration-tests.sh`.

## Acceptance criteria and evidence

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 5A | Request lifecycle | Done | Draft, publish, pause, resume, fulfill, cancel, edit, owner view, status history. `requests-lifecycle.integration.spec.ts`. |
| 5B | Request discovery | Done | Server-side filter/sort/paginate with a global `total`; drafts never public. |
| 5C | Matching engine | Done | Deterministic weighted model, configurable weights, explainable reasons. `match-engine.spec.ts` (27 tests). |
| 5D | Offer management | Done | Submit, edit, withdraw, list, compare, accept, reject, party-scoped reads. |
| 5E | Atomic acceptance | Done | Milestone 2 concurrency preserved and extended; acceptance now also fulfils the request. |
| 5F | Request-to-transaction | Done | Conversation, transaction, milestone, fulfilled request, all in one transaction. |
| 5G | Matching frontend | Done | Feed, create/edit, my requests, detail, matches, offers, acceptance. |
| 5H | Event contract | Done | Typed payload map plus a transactional outbox. Consumption lands in Milestone 6. |

## 5A. Request lifecycle

`request-state.ts` is the single declaration of what is legal. Nothing else
encodes a transition.

```
DRAFT     -> PUBLISHED, CANCELLED
PUBLISHED -> PAUSED, FULFILLED, CANCELLED, EXPIRED
PAUSED    -> PUBLISHED, CANCELLED
FULFILLED -> (terminal)
CLOSED    -> (terminal)
CANCELLED -> (terminal)
EXPIRED   -> (terminal)
```

`transition()` reads the row, asks the state machine, then performs a
**conditional** `updateMany` keyed on the observed status. Two concurrent
transitions therefore cannot both win: the loser updates zero rows and gets a
`400` telling the client to reload. Every accepted transition writes a
`RequestStatusEvent` row and an outbox event in the same transaction, so
history and notification cannot diverge from state.

A draft stores placeholder copy so the non-null columns are satisfied, and the
publish path re-validates length, so placeholder text can never reach a public
row.

## 5B. Discovery

`GET /requests` returns `{ items, total, limit, offset }`. Keyword (trigram
indexed), category, mode, urgency, budget range, city, neighborhood, radius,
and deadline filters all run in PostgreSQL before the page is sliced. Every
ordering appends `id` as a tiebreaker.

**Public privacy rules:** a draft is never returned; an explicit
`?status=DRAFT` is ignored rather than honoured. Coordinates are stripped and
replaced by `approximateLocation` rounded to a tenth of a degree. The owner
view adds `coordinatesShared: true`, which is the only signal that a location
exists — no client ever receives the stored value.

## 5C. Matching engine

`backend/src/matching/match-engine.ts` is a pure, deterministic, weighted
model. Five signals, all bounded and configurable via `MATCH_WEIGHT_*`:

| Signal | Weight | Behaviour |
| --- | --- | --- |
| Category | 40 | A **gate**, not a weight. A different category never matches. |
| Keyword | 25 | Token overlap between request title/keywords/description and listing text. |
| Budget | 20 | Cheaper scores higher within a flexible budget; out-of-budget is a gate when not flexible. |
| Distance | 15 | Exact great-circle distance; beyond the stated radius is a gate. |
| Freshness | 5 | 7 / 30 / 90 day bands. |

Candidate selection is prefiltered in SQL (category, price range, coordinate
bounding box, status, seller exclusions) and capped at 300 rows, so the
expensive part never sees the whole table. Ranking ties break on listing id, so
the order is reproducible.

Every result carries human-readable reasons (`"Within budget at $120"`,
`"5 keywords in common"`, `"0.7 mi away"`) so the UI can justify a ranking
instead of showing a bare number. Rankings are persisted to `RequestMatch`
with reasons and rank, so a reload shows the same ordering.

Excluded: non-`PUBLISHED` listings, the requester's own listings, and any
member who has blocked the requester in either direction.

## 5D/5E/5F. Offers, atomic acceptance, workflow

The Milestone 2 conditional-claim pattern is preserved exactly. Acceptance now
additionally, **inside the same transaction**:

1. marks the offer `ACCEPTED` (conditional on it still being negotiable),
2. creates the conversation and transaction (`Transaction.offerId` is unique),
3. creates the first milestone,
4. fulfils the request with a conditional `updateMany` so a second acceptance
   that already fulfilled it is a no-op rather than an error,
5. writes the status-history row,
6. writes `offer.accepted` to the outbox, deduped on the offer id.

`P2002` still maps to `400 Offer is no longer acceptable`, so a lost race
never leaks a driver error.

Offer privacy: `listOffersForRequest` returns every offer to the requester and
only the caller's own to an offerer, so one provider cannot price-shop against
another. `getOffer` is readable only by the two parties.

## 5H. Event contract

`backend/src/events/domain-events.ts` defines the typed payload map consumed by
Milestone 6. Ten event types cover request created/updated/status-changed/
fulfilled, match found, offer received/updated/accepted/rejected, and transaction
status changed.

`OutboxWriter.record()` is called with the **transaction client**, so an event
and the state change it describes commit together — there is no window in
which one exists and the other does not. A unique `dedupeKey` makes redelivery
idempotent; a duplicate insert is swallowed rather than thrown.

Payloads carry ids and the minimum display fields the recipient already has
access to. No email address, coordinate, password hash, or anything a blocked
or unrelated member could read appears in any payload.

## Database changes

Migration `0009_requests_matching`, additive only.

- `RequestStatus` gains `PAUSED` and `FULFILLED` via `ALTER TYPE ... ADD VALUE`,
  which cannot invalidate stored data.
- `NeedRequest` gains `minBudgetCents`, `budgetFlexible`, `requirements`,
  `neighborhood`, `city`, `statusChangedAt`, `fulfilledAt`.
- `RequestMatch` gains `reasons` (JSONB, explains the ranking), `rank`,
  `computedAt`.
- New tables `RequestStatusEvent` and `DomainEventOutbox`.

Indexes: request discovery (`status,deadline`), (`status,budgetCents`),
`(latitude,longitude)`), trigram GIN on title and description, and match
ranking indexes. Rollback notes and backfill assumptions are in the migration
header.

Verified: chain `0001`–`0009` applies to an empty database, and
`migrate diff` reports **No difference detected**.

## Frontend

New `src/pages/requests/`: `RequestFeed`, `RequestForm`, `MyRequests`,
`RequestDetail`. Wired into the app shell and navigation.

Explore-style server-side filtering replaced any client-side narrowing, and
the result count comes from the API's `total`. Duplicate submission is
prevented by disabling both submit actions while a request is in flight.

## Verification runs

| Command | Result |
| --- | --- |
| Backend Jest | 33 suites, **207 tests passed** |
| PostgreSQL integration | 9 suites, **135 tests passed** |
| Frontend Vitest | 13 files, **107 tests passed** |
| Storage integration (unchanged) | 2 suites, 29 tests passed |
| Backend lint / tsc / build / prisma validate | pass |
| Frontend lint / tsc / build | pass |
| Full migration chain | 9 migrations applied |
| Schema drift | `No difference detected` |

## Bugs found and fixed by these tests

1. **Inverted budget signal** — `0.6 + 0.4 * (price/budget)` meant a *more
   expensive* listing scored *higher*. Corrected to fall as the price
   approaches the ceiling.
2. **Empty draft could not be created** — `title` and `description` are
   non-null columns and the wizard supplies neither on the first step.
3. **Draft publishes on placeholder text** — placeholder copy satisfied the
   publish length check; drafts now store empty strings and publish
   re-validates.
4. Archived/cancelled requests were hidden from their owner.
5. `RequestMatch.reasons` needed a default so the migration applies to a
   database that already has rows.

## Not done, and why

- **Request matching is request-scoped only.** There is no "requests matching
  my listing" reverse feed; it would be a new query surface rather than a
  missing feature, and the outbox already carries `match.found` for Milestone 6.
- **No ML or paid APIs.** The model is transparent and rule-based by design.
- **Event consumption is not implemented.** Milestone 5 defines and writes the
  contract and the durable outbox; Milestone 6 consumes it.
- **Request notifications** are written to the outbox but nothing displays
  them yet. That is Milestone 6.