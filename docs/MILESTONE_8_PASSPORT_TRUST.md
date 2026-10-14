# Milestone 8 — Neighborly Passport & Trust

Branch: `milestone8-passport-trust`, branched from the Milestone 7 commit
(`7d12e14`).

A passport should help someone judge whether a neighbor is reliable without
exposing anything private, and without a number nobody can explain. Both of
those constraints shaped the design, and both cost something: there is no
single trust score here, and there is no badge that means "we checked who this
person really is".

No production system was touched.

## Acceptance criteria

| # | Requirement | Status |
| --- | --- | --- |
| 8A | Passport profile | Done |
| 8B | Verified activity and trust signals | Done |
| 8C | Ratings and reviews | Done |
| 8D | Verification workflows | Done |
| 8E | Reputation integrity | Done |
| 8F | Moderation and appeals | Done |
| 8G | Passport frontend | Done |
| 8H | Database | Done |
| 8I | Testing | Done |

## The two decisions that shaped everything

### No single trust score

A number is easier to build and impossible to defend. A member who asks "why
do I have 62?" can only be answered with a score, and a score is a place where
small inputs get laundered into a verdict. So the passport shows **named,
interpretable signals**, each with the sentence that justifies it:

| Signal | Requires |
| --- | --- |
| Email confirmed | A verified email address. Explicitly *not* an identity claim |
| Established neighbor | 90 days of tenure |
| Completed exchanges | 3 real COMPLETED transactions |
| Active lender | 2 completed borrowings where they were the lender |
| Reliable returner | 3 completed borrowings **and** 3 returned on or before the due date |
| Reviewed by neighbors | 3 published reviews, which can only exist after a real exchange |
| Varied network | 3 distinct counterparties, so one repeated partner cannot inflate it |

Two categories are kept apart and never merged: **observed behaviour** (an
exchange happened) and **verified identity** (an address was confirmed). The
email badge's own text says so.

### The review publication policy

A review is written the moment an exchange completes but is **not shown** until
either the other party has also reviewed, or the window closes (14 days by
default, per-member configurable).

The reason is asymmetric pressure. With immediate publication, someone can
withhold until the other side pays; someone mid-exchange has real reasons not
to want a public disagreement. Doubling up removes that lever without creating
a black market. The window is a **deadline, not a permission**: after it the
review publishes whether or not the other party ever reviews.

The policy is enforced in three places so it cannot be bypassed:
`Review.status` defaults to `PENDING`, publication happens in one function
(`publishIfDue`), and both the create path and a periodic sweep go through it.
Reviews written before this milestone are explicitly set to `PUBLISHED`,
because they were already visible and must not be retroactively withheld.

Proven: the sweep publishes exactly once however many times it runs, two
concurrent sweeps produce exactly one publication, and a review is visible to
nobody until its moment arrives.

## Trust inputs are derived, never asserted

`PassportService.trustInputs` reads only records the server owns:
`Transaction.status = COMPLETED`, `BorrowRequest.status = COMPLETED`, and
`Review.status = PUBLISHED`. Cancelled, disputed, and refunded rows are
excluded **by the status filter** rather than by subtraction, so a reversal
removes the evidence rather than merely reducing a count.

There is no `TrustActivitySnapshot` table, and that is deliberate. A snapshot
is a cache of a derivation, and a cache that can disagree with its source is
how reputation systems drift. Recomputing on read is a little more work per
passport view and is always consistent with a correction, with no recalculation
job to forget to run.

**Reversal withdraws, it does not dim.** An open dispute withdraws the
behavioural badges while leaving the factual ones intact — the account is still
old and the address is still confirmed — and says why. A suspended account
withdraws everything behavioural.

## Privacy

- **Explicit projection.** The passport query selects named fields. Email,
  coordinates, suspension state, and moderation history are not in the query at
  all, so no later column addition can leak them.
- **A rating needs a sample.** Below three published reviews the average is
  `null`, not a number, and the UI says "not enough published reviews yet". A
  single five-star review must not read as a strong reputation.
- **Public review authors** are rebuilt field by field rather than passed
  through, so a future profile column cannot start appearing in a public list.
- **Counts stay public** while opinions and location can be hidden, because a
  count is an aggregate fact and hiding it would make a busy member look
  unproven.
- **Leaderboards are opt-in**, never opt-out.

## Reputation integrity

- Eligibility is decided from the exchange record, never from the client: the
  caller must be a participant, the transaction must be COMPLETED, and the
  subject must be the other party.
- A **unique index on `(transactionId, authorId)`** is the real guard. Two
  concurrent submissions of the same review race all the way to the write and
  exactly one commits — verified.
- Self-reviews and reviews of blocked members are refused.
- A `CHECK (rating BETWEEN 1 AND 5)` backs the DTO validation.
- A `CHECK (endAt > startAt)`-style constraint is not needed here, but a
  member cannot grant themselves email verification: that belongs to the
  account module, and a request for it is refused with an explanation.
- Editing is bounded by a window, so a review cannot be rewritten later to
  answer a dispute.

## Moderation

Reuses `StaffRoleAssignment` — one assertion, `PassportService.assertStaff`,
and every staff route calls it. Review reports go into the **existing**
`Report` / `ModerationAction` tables via a new `REVIEW` enum value, so the
audit surface is shared rather than duplicated.

A hidden review keeps its row, its reason, and its history; the public summary
recomputes from published rows only, so hiding genuinely removes the rating
without destroying the record. Resolving an appeal in the member's favour
restores it. Every trust-affecting decision writes a `TrustAuditEvent` inside
the same transaction as the change, so a member can always be told why their
passport changed.

The reporter's identity is shown to staff and appears in no projection the
reviewed member can read.

## Database

Migration `0012_passport_trust`, additive only.

- Six new enums, plus `REVIEW` added to `ReportTargetType`.
- `Review` gains `authorRole`, `status`, `publishedAt`, `windowClosesAt`,
  `editableUntil`, `editedAt`, `hiddenAt`, `hiddenReason`, `updatedAt`, and a
  unique index on `(transactionId, authorId)`.
- Four new tables: `PassportPrivacySettings`, `VerificationRecord`,
  `TrustAuditEvent`, `ModerationAppeal`.

One migration detail worth recording: PostgreSQL cannot `VALIDATE` a plain
unique index, so existing duplicate reviews are hidden **before** the index is
created. Older duplicates are hidden rather than deleted, because moderation
history is never silently destroyed.

Verified: the chain `0001`–`0012` applies to an empty database and `migrate
diff` reports **No difference detected**.

## Bugs found by these tests

1. **A raw query compared uuid to text.** Prisma binds raw parameters as text,
   so `WHERE id = ${id}` fails against a uuid column. Needed an explicit
   `::uuid` cast.
2. **`rank` is a reserved SQL word.** A `ROW_NUMBER()` alias broke the
   migration with a bare syntax error.
3. **The counterparty's review stayed stranded.** Publishing only the review
   just written meant the first one waited for the next sweep, so the pair did
   not go live together — the opposite of what "double-blind until both review"
   is for.
4. **`authorRole` was computed and never stored**, so every public review said
   "completed an exchange" instead of naming the relationship.

## Not done, and why

- **No identity verification.** `COMMUNITY_REFERENCE` is a moderator's
  statement, and its own description says it is not a background check. No
  government ID, selfie, or biometric data is collected anywhere.
- **No purchase or settlement of verification.** Modest by design: an
  unverifiable score is worse than none.
- **Review appeals cover reviews and verifications, not account
  suspensions.** A suspension appeal belongs to the account module and would
  need its own policy.
- **No reviewer-to-reviewer weighting.** A member who has been reviewed many
  times has no extra say; weighting reputation by reputation is how a system
  ossifies.
- **Leaderboards rank by verified counts only**, and there is no time window,
  so a member's history is all-time. Recency weighting was left out rather
  than half-implemented.