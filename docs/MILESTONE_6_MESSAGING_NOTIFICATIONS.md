# Milestone 6 — Messaging, Realtime & Notifications

Branch: `milestone6-messaging-realtime-notifications`, branched from the
Milestone 5 commit (`632a2f3`).

No production system was touched. All database work ran against a disposable
PostgreSQL container created and destroyed by the project scripts.

## Acceptance criteria and evidence

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 6A | Persistent messaging | Done | Messages persisted, party-scoped reads, keyset pagination, per-viewer read receipts. |
| 6B | Realtime Socket.IO delivery | Done | Existing gateway extended; real client/server integration test. |
| 6C | Read receipts and unread counts | Done | Denormalized counters, per-conversation and global totals, realtime pushes. |
| 6D | Notification engine | Done | Transactional outbox consumer, persisted notifications, idempotent, retried. |
| 6E | Saved-search alerts | Done | Deferred Milestone 4 work completed, including the editing UI. |
| 6F | Notification preferences | Done | Per-member, persisted, enforced at delivery. |
| 6G | Notification and messaging frontend | Done | Center, dropdown, preferences, saved-search editing, pagination. |
| 6H | Security and reliability | Done | Room authorization, suspension, revocation, dedupe, reconnect. |

## The central design decision

Notifications are **not** delivered by an in-process event emitter. Milestone 5
wrote a transactional outbox; Milestone 6 *polls durable rows*:

```
business write  ─┐
outbox row      ─┴─ one transaction → commits together
                       │
                       ▼
        NotificationWorker.drain()  (at-least-once)
                       │
                       ▼
        Notification row (unique dedupeKey) + realtime push
```

The consequence is that a crash between the business commit and the
notification cannot lose the event: the event row committed with the business
row. Processing is at-least-once, and the unique `dedupeKey` on `Notification`
makes redelivery a no-op rather than a duplicate. The worker claims rows with a
conditional `updateMany` on `status = 'PENDING'`, so two concurrent workers
cannot take the same row.

Failures back off exponentially (capped at an hour) and are marked `FAILED`
after five attempts with the error retained, so a poison event is visible
rather than silently dropped.

## 6A. Persistent messaging

`GET /conversations/:id/messages` now paginates by **message id anchor**
(`?before=<id>&limit=`), not by offset. An offset would let a message sent
mid-scroll make a later page skip or repeat a row; an anchor cannot. An anchor
belonging to a different conversation is rejected rather than silently treated
as absent, which would otherwise return the whole history.

Each returned message carries `readAt` **for the caller's own view only** —
whether they have read past it. It is the viewer's own state; another member's
read state is never returned.

## 6B. Realtime

The existing `/realtime` namespace is reused; no second realtime system was
built.

A new `user.join` handler exists because notifications and global unread counts
are per-member, not per-room. It is authorized by the socket's **own**
authenticated identity — the client never supplies an id — and it re-checks
token expiry and account status at join time, so a long-lived socket loses room
access when a session is revoked or an account is suspended. Every socket
already joins its own id room at connect, so membership in `user:<id>` is
enforced by the adapter.

Verified against a real `socket.io-client` and a real Socket.IO server over a
WebSocket (`messaging.realtime.integration.spec.ts`), covering: delivery to the
other participant, an unauthorized conversation join that never receives the
room's traffic, a suspended account refused at the handshake, an expired token
refused, a forged `userId` in the auth payload ignored in favour of the
verified token, per-recipient notification delivery, and no replay to a
reconnected client.

**Reconnect behaviour.** The server keeps no queue. A client that misses a
message while disconnected recovers it by refetching persisted history, which
is what the frontend does on reconnect. That is deliberate: replaying buffered
events is how duplicate messages appear.

**Sender echo.** `publishMessage` broadcasts to the whole conversation room, so
the sender also receives its own message. Socket.IO's `except()` filters by
socket id and the gateway only knows the sender's user id, so the echo cannot be
excluded server-side. It is safe because every message carries a stable id and
the client keys rendered rows on it.

## 6C. Unread counts

`ConversationParticipant.unreadCount` is a denormalized counter, incremented in
**the same transaction as the message write** for the other participants only.
There is therefore no window in which a message exists but is uncounted. Reading
resets it to zero and can only affect the caller's own row, keyed by
`(conversationId, userId)`.

The badge cost is one indexed column read rather than a message scan, so it
stays constant as a conversation grows. `GET /conversations` returns a
per-conversation count and `GET /conversations/unread` returns the global
total; both are pushed over the socket on change.

## 6D/6F. Notifications and preferences

Types: new message, new offer, offer updated, offer accepted, offer declined,
new relevant match, saved-search match, request update, request fulfilled,
transaction update.

Preferences gained `offers`, `matches`, `savedSearches`, and `requestUpdates`,
all defaulting to on so an existing row behaves as its owner already expects.
Preferences are enforced **at delivery**: a suppressed notification is not
written at all, rather than written and hidden.

The event-to-notification mapping is one pure function, so it is unit-tested
without a database, including the rule that nobody is notified about their own
action and that a transaction change notifies every participant except the
actor.

## 6E. Saved-search alerts

This completes the Milestone 4 deferral. The criteria were already persisted
with a create, update, and delete API; what was missing was the evaluation and
the UI, and both now exist.

- **Bounded.** Only listings newer than a watermark are evaluated, on a slower
  cadence than the outbox drain, so no tick rescans history it has already
  covered.
- **Idempotent.** `SavedSearchAlert.dedupeKey` is unique per (search, listing).
  Re-running never alerts the same member twice.
- **Correct exclusions.** Only `PUBLISHED`, non-deleted listings alert; a
  member is never alerted about their own listing; criteria are matched with
  the same rules the search feed uses, so every term must appear.
- **Preference-respecting.** The alert record is written even when the
  notification is suppressed, so turning notifications back on does not
  resurrect a stale alert.

The saved-search editing UI (`SavedSearches.tsx`) lists, edits, and deletes
searches and shows recent alerts. An alert whose listing has since been
archived or deleted does not navigate to a dead page.

## Database changes

Migration `0010_notifications`, additive only.

- `NotificationPreference` gains `offers`, `matches`, `savedSearches`,
  `requestUpdates`, all defaulting to true.
- `ConversationParticipant` gains `unreadCount`, defaulting to 0.
- New tables `Notification` and `SavedSearchAlert`, both with unique
  `dedupeKey` indexes and composite indexes on `(userId, readAt)` and
  `(userId, createdAt)`.

`SavedSearch (userId, updatedAt)` already existed from `0001_init`, so it is
walked as-is rather than recreated. Rollback notes and backfill assumptions are
in the migration header.

Verified: the chain `0001`–`0010` applies to an empty database and
`migrate diff` reports **No difference detected**.

## Frontend

New: `src/lib/realtime.ts` (one socket per tab, subscription-based, reconnect
as a refetch signal), `NotificationCenter`, `NotificationPreferencesScreen`,
`SavedSearches`, `NotificationBell`, `src/lib/routes.ts`.

`Messages.tsx` gains realtime refetch-on-signal, keyset pagination with
de-duplication, and read-receipt ticks.

The realtime client holds **one socket per tab** and reference-counts its
subscribers, so unmounting one screen does not disconnect another and no
listener leaks.

## Verification runs

| Command | Result |
| --- | --- |
| Backend Jest | 34 suites, **225 tests passed** |
| PostgreSQL integration | 11 suites, **165 tests passed** |
| Frontend Vitest | 15 files, **131 tests passed** |
| Storage integration (unchanged) | 2 suites, 29 tests passed |
| Backend lint / tsc / build / prisma validate | pass |
| Frontend lint / tsc / build | pass |
| Full migration chain | 10 migrations applied |
| Schema drift | `No difference detected` |

Integration totals include a real Socket.IO client against a real server.

## Bugs found and fixed by these tests

1. **Messages were unreadable out of order.** The privacy spec caught the
   paginator depending on driver ordering; page order is now produced by the
   method itself.
2. **`except()` filters by socket id, not user id.** An attempted sender
   exclusion would not have worked; the echo is now handled by id-keyed
   rendering and documented.
3. **A failing notification left no trace.** The retry test proved the original
   scenario could not fail, so the test now uses a foreign-key violation to
   genuinely exercise the backoff path.
4. **The bell broke a signed-out assertion.** The App unread tests asserted no
   notification traffic at all; updated to assert the *message* badge is not
   sourced from notifications, and rewritten to name the authenticated
   endpoints rather than pin an exact path list.

## Not done, and why

- **No end-to-end encryption.** Messages are stored and served in plaintext at
  rest. Claiming otherwise would be false.
- **No email or push delivery.** Only in-app notifications work. No provider is
  configured, and none is required locally.
- **Unread counters are denormalized.** They are maintained in the sending
  transaction, but a direct database edit to `Message` outside the service would
  not move a counter. A correct-by-construction alternative is a `COUNT`, which
  is why the counter is documented at its declaration.
- **`markRead` is not transactional with reading.** It is a single update, so
  there is no multi-statement race to lose.
- **Redis is not used for presence or fan-out.** Socket.IO's default in-memory
  adapter is sufficient for a single instance; a multi-instance deployment would
  need the Redis adapter, which is an infrastructure concern.