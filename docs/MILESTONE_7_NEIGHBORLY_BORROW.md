# Milestone 7 — Neighborly Borrow & Lending

Branch: `milestone7-neighborly-borrow`, branched from the Milestone 6
end-to-end commit (`c17be3c`).

Borrowing is temporary possession, not a sale. The lender retains ownership
throughout, and the domain is explicit about that rather than overloading the
marketplace's generic fulfilment.

No production system was touched. All database work ran against a disposable
PostgreSQL container created and destroyed by the project scripts.

## Acceptance criteria

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| A | Borrowable item listings | Done | Reuses the Milestone 4 listing and storage models; no duplicate media. |
| B | Borrow requests | Done | Create, edit, cancel, approve, decline, with real frontend and backend. |
| C | Availability and double-booking | Done | Half-open intervals, DB exclusion constraint, concurrency proven. |
| D | Pickup and handoff | Done | Two-sided confirmation; one click never moves the item. |
| E | Return and completion | Done | Two-sided return, then completion, then the dates are released. |
| F | Extensions and overdue | Done | Availability rechecked on approval; idempotent overdue sweep. |
| G | Condition, damage, disputes | Done | Immutable condition reports, private evidence, append-only trail. |
| H | Trust, safety, privacy | Done | Ownership, blocks, suspension, no address exposure, rate limits. |
| I | Realtime and notifications | Done | 14 borrow events on the Milestone 6 durable outbox. |
| J | Frontend | Done | Nine screens, all on real APIs. |

## The domain

Two statuses, deliberately separate:

- **Item availability** is the `Listing.status` (`PUBLISHED` hides it) plus
  `BorrowAvailabilityWindow` rows the lender declares.
- **Borrow request status** is `BorrowRequest.status`, the lifecycle of one
  person's request.

`BorrowReservation` bridges them: one row per approved booking, with
`releasedAt IS NULL` meaning it still blocks the item. Cancelling or completing
*releases* the reservation rather than deleting it, so the booking history
survives.

### Lifecycle

```
REQUESTED      -> APPROVED, DECLINED, CANCELLED
APPROVED       -> PICKUP_SCHEDULED, CANCELLED
PICKUP_SCHEDULED -> CHECKED_OUT, CANCELLED, APPROVED
CHECKED_OUT    -> RETURN_REQUESTED, OVERDUE
RETURN_REQUESTED -> RETURNED, DISPUTED
OVERDUE        -> RETURN_REQUESTED, RETURNED, DISPUTED
RETURNED       -> COMPLETED, DISPUTED
DISPUTED       -> RETURNED, COMPLETED
DECLINED | COMPLETED | CANCELLED  -> terminal
```

Declared once in `borrow-state.ts`. Nothing reopens: a borrowing that ended
badly must not quietly restart.

## The double-booking guarantee

This is the part that had to be right, so it is enforced twice.

**Application.** `decide(..., 'approve')` runs in one transaction that first
takes `SELECT ... FOR UPDATE` on the `Listing` row. That serializes approvals
for a single item, so two concurrent approvals cannot both read "no conflict"
before either writes a reservation.

**Database.** A partial GiST exclusion constraint makes overlapping bookings
*impossible* rather than merely unlikely given correct application code:

```sql
EXCLUDE USING gist (
  "listingId" WITH =,
  tsrange("startAt", "endAt", '[)') WITH &&
) WHERE ("releasedAt" IS NULL)
```

Two further constraints carry domain invariants that should not depend on any
caller: `endAt > startAt` on the request, the reservation, and the availability
window, and `borrowerId <> lenderId` on the request.

The range is **half-open `[start, end)`** everywhere, matching the JS
`intervalsOverlap`, so a neighbour can collect an item the moment it is due
back. The range uses `tsrange` rather than `tstzrange` because the columns are
`TIMESTAMP WITHOUT TIME ZONE` and the `timestamptz` constructor is not
`IMMUTABLE`, so it cannot appear in an index.

`btree_gist` is required so a uuid can participate alongside a range.

**Proven**, not asserted: `Promise.allSettled` over two overlapping approvals
of the same item returns exactly one fulfilment and one `ConflictException`,
and the reservation count is one. A separate test bypasses the service
entirely and confirms the constraint rejects a raw overlapping insert.

## Two-sided handoffs

One party confirming changes nothing. `confirmHandoff` returns
`{ completed: false, awaiting: 'lender' }` and the item does not move until both
sides have confirmed. The side is derived from the caller's role in the
request, never from the request body, so a member cannot confirm on the other's
behalf. Completion is only reachable from `RETURNED`, which is only reachable
after both return confirmations — so "did not complete early" is enforced by
the state machine rather than by remembering to check.

Condition is recorded as part of the confirmation, and is immutable: a report
is a statement about a moment, not an editable field.

## Privacy

- **Item coordinates** are never returned to anyone. The borrow flow uses them
  for radius filtering only; a pickup point is negotiated between the two
  parties, not published.
- **The pickup location note** lives on the handoff. It is deliberately absent
  from every event payload, so it cannot reach a notification; both
  participants see it because it is their meeting point. A test asserts the
  note string appears nowhere in the outbox.
- **The availability calendar** shows booked dates without saying who booked
  them.
- **Evidence photos** are stored `ACL: private`, served only through an
  authenticated route that rebuilds the object key from validated parts, and
  cached `private, no-store`. A condition photo can show the inside of
  someone's home.
- **Non-participants get 404, not 403**, on a borrowing, so the existence of a
  borrowing is not leaked to the neighbourhood.
- **Only staff may resolve a dispute.** Participants may open one and add
  evidence; resolving is the one action with an outcome that binds the other
  party. There is no delete route for evidence at all.

## Events

Fourteen types on the existing Milestone 5/6 contract, all written through the
transactional outbox and consumed by the existing notification worker. Borrowing
reuses the `requestUpdates` preference rather than inventing a new category,
so a member who muted requests is not opted into loan notifications
unexpectedly.

Notification mapping is a pure function, unit-tested for the property that
matters most: nobody is notified about their own action, and a pickup scheduled
by the lender tells the borrower, not the lender.

## Overdue sweep

Bounded and retry-safe. The status flip, the status-history row, and the
`borrow.overdue` event are one transaction, and the event is deduplicated per
request. Running the sweep repeatedly, or restarting during one, produces
exactly one notification. A test runs it three times and asserts one overdue
event and one overdue history row.

An extension moves the due date on both the request and its reservation, and
keeps `originalEndAt` so the first agreement is never rewritten.

## Database

Migration `0011_neighborly_borrow`, additive only.

- Seven new enums.
- `Listing` gains `borrowable`, `maxBorrowDays`, `minNoticeHours`,
  `usageInstructions`, `depositCents`. Existing listings stay
  marketplace-only: nothing becomes borrowable without the lender opting in, so
  no backfill is needed.
- Nine new tables: `BorrowRequest`, `BorrowReservation`,
  `BorrowAvailabilityWindow`, `BorrowHandoff`, `BorrowConditionReport`,
  `BorrowExtension`, `BorrowDispute`, `BorrowDisputeEvidence`,
  `BorrowDisputeEvent`, `BorrowStatusEvent`.
- Four check constraints and one exclusion constraint.

Foreign keys use `RESTRICT` on the relations that protect borrowing history, so
a hard delete of a listing or a member cannot silently erase it. Listings are
soft-deleted in this system anyway.

Verified: the chain `0001`–`0011` applies to an empty database and
`migrate diff` reports **No difference detected**.

## Verification

| Command | Result |
| --- | --- |
| Backend Jest | 35 suites, **267 tests passed** |
| PostgreSQL integration | 13 suites, **221 tests passed** |
| Storage integration | 3 suites, **33 tests passed** |
| Frontend Vitest | 16 files, **163 tests passed** |
| Backend lint / tsc / build / prisma validate | pass |
| Frontend lint / tsc / build | pass |
| Full migration chain | 11 migrations applied |
| Schema drift | `No difference detected` |

Integration 221 = 53 Milestone 7 borrowing + 168 carried forward from
Milestones 5 and 6. The suites are disjoint; no test is counted twice.

## Bugs found and fixed by these tests

1. **Raw query compared uuid to text.** `WHERE id = ${id} FOR UPDATE` failed
   with `operator does not exist: uuid = text`; Prisma binds raw parameters as
   text, so an explicit `::uuid` cast is required. This would have failed every
   approval.
2. **A reversed window returned the wrong error class.** The duration check
   fires before the availability check, so a reversed window is a
   `BadRequestException`, not a scheduling conflict.
3. **`tsrange` vs `tstzrange`.** The exclusion constraint could not be created
   at all until the non-`IMMUTABLE` constructor was replaced.
4. **Drift on `updatedAt` defaults.** Prisma's `@updatedAt` has no database
   default, so declaring one in the migration produced permanent drift.
5. **`pickupAvailable` default flipped.** Reverted rather than migrated: borrow
   validity is validated explicitly, and changing an existing column's default
   would have altered Milestone 4 behaviour for no gain.

## Not done, and why

- **No payments, deposits, or penalties.** A deposit can be *stated* so both
  sides know the arrangement, but nothing is collected. Claiming otherwise
  would be false.
- **No insurance, identity verification, or legally binding adjudication.** A
  dispute is a recorded, auditable process; staff review it, they do not
  adjudicate liability.
- **No automated deadline reminders.** The overdue sweep exists and is
  tested; a "return approaching" reminder would need the same worker with a
  second query and was left out rather than half-built. The borrow events for
  handoff and return are already wired, so adding it is incremental.
- **Pickup reminders are not scheduled.** The `borrow.pickup_scheduled` event
  notifies both parties immediately; a reminder N hours before is not
  implemented.
- **Socket.IO rooms are not borrow-specific.** Borrow notifications ride the
  existing per-user room from Milestone 6, which is the correct authorization
  boundary; no new gateway surface was added.