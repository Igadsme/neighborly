# Cross-milestone verification — Milestones 5 and 6

Run after both milestone commits. Exercises one scenario end to end against a
disposable PostgreSQL database, using the real services rather than fixtures.

## The end-to-end workflow

`backend/src/integration/end-to-end.integration.spec.ts` drives:

1. **Request** — the requester posts what they need (`PUBLISHED`, with a
   location and a budget).
2. **Matching** — a provider publishes a listing; the engine ranks it first and
   returns human-readable reasons.
3. **Offer** — the provider offers; `offer.received` lands in the outbox and,
   once drained, becomes a notification for the requester.
4. **Acceptance** — the requester accepts. One conversation and one exchange
   are created atomically, the request becomes `FULFILLED`, and
   `offer.accepted` reaches the provider's notification feed with a link to the
   transaction.
5. **Messaging** — a real message crosses the conversation and moves the
   recipient's unread counter in the same transaction; reading resets it.
6. **Audit** — the request's status history and the three outbox events for the
   chain are verified, and every event is `DELIVERED`.

A second scenario covers the deferred saved-search work end to end: an alert
fires, re-running is a no-op, turning the preference off suppresses delivery
while still recording the alert, and turning it back on applies to the next
listing.

A third asserts that **no notification payload carries a coordinate or an
email address**, in the persisted row or in the realtime push. This is the
privacy guarantee that matters most, because a notification is broadcast by
identity rather than by a page a member chose to open.

## Test results

| Suite | Result |
| --- | --- |
| Backend Jest (unit) | 34 suites, **225 passed** |
| PostgreSQL integration | 12 suites, **168 passed** |
| Frontend Vitest | 15 files, **131 passed** |
| Storage integration | 2 suites, **29 passed** |

Integration total 168 = Milestone 5 request/matching/lifecycle 36 +
Milestone 6 messaging and notifications 20 + real Socket.IO client/server 10 +
Milestone 5 offer/privacy/concurrency suites carried forward + the 3
cross-milestone scenarios above. These suites are disjoint; no test is counted
in two rows.

## A latent isolation bug this exposed

`requests.privacy.integration.spec.ts` and
`requests.accept.integration.spec.ts` share one fixture request. The acceptance
suite fulfils it, so once suite ordering changed the privacy suite could no
longer find that request in the public feed — correctly, since the feed shows
only live requests.

This was a test-isolation defect, not a product defect: the privacy suite now
publishes a request of its own instead of depending on a row another suite may
have consumed. It is worth noting because the product behaviour it tripped over
is the intended one.

## What is not verified here

- **Email and push delivery.** None is configured; only in-app notifications
  are implemented, and only those are tested.
- **Multi-instance Socket.IO.** The default in-memory adapter is used. A
  multi-instance deployment needs the Redis adapter, which is an infrastructure
  decision and was out of scope.
- **Load and latency.** No performance or concurrency benchmarks were run
  beyond the two-provider acceptance race already covered in Milestone 5.
- **Staging or production storage.** Only the disposable local containers were
  used, exactly as in Milestone 4.