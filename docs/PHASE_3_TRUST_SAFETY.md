# Phase 3 — Trust and safety

Completion record for branch `cursor/phase3-trust-safety-a1b2`. **Release readiness is not claimed.** This PR does not start Phase 4. Atlas continues Phases 4–6 after merge. Phase 7 stays unstarted until the product owner approves it.

Base before this work: `2b96bed` (`feat: Phase 2 product wiring and honesty labels`).

## Commits

| SHA | Subject |
| --- | --- |
| `2feed6e` | feat: add reports, blocks, moderation, and abuse limits |
| `045a473` | feat: wire listing, profile, and message report and block controls |
| docs commit on this branch | docs: record Phase 3 trust and safety completion |

## Endpoints

All paths are under `/api/v1`. Guarded routes require `Authorization: Bearer`.

| Method | Path | Auth | Result |
| --- | --- | --- | --- |
| `POST` | `/safety/reports` | User | Create a report. 404 missing or invisible target. 409 own content or duplicate. 429 over the report cap. |
| `GET` | `/safety/reports` | User | Caller’s reports only. |
| `GET` | `/safety/blocks` | User | Caller’s blocks only. |
| `POST` | `/safety/blocks` | User | Block a user. 404 unknown user. 409 self-block or duplicate. |
| `DELETE` | `/safety/blocks/:userId` | User | Unblock. 404 if that row is not the caller’s. 400 if the id is not a UUID. |
| `GET` | `/moderation/reports` | Moderator or admin | Queue. Default `status=OPEN`. 403 otherwise. |
| `GET` | `/moderation/reports/:id` | Moderator or admin | Report plus a short target preview. |
| `POST` | `/moderation/reports/:id/actions` | Moderator or admin | `DISMISS`, `RESOLVE`, `HIDE`, `SUSPEND_USER`, `RESTORE_USER`. |

Report body: `targetType` (`LISTING`, `USER`, `MESSAGE`, `COMMUNITY_POST`), `targetId`, `reason` (`SPAM`, `SCAM`, `HARASSMENT`, `INAPPROPRIATE`, `OTHER`), optional `details`.

There is no route that grants staff. Insert `StaffRoleAssignment` (`MODERATOR` or `ADMIN`) for the user id.

### Interaction rules

Either person blocking the other returns 403 `"You cannot interact with this person"` for:

- `POST /conversations` and `POST /conversations/:id/messages`
- offer create, counter, accept, and reject
- job apply, service quote, community reaction, community comment
- a review of that person

Existing threads stay readable. A hidden message is still in the thread with the body `This message was removed`. The stored body remains for the moderation preview.

`HIDE` sets `deletedAt` (and `ARCHIVED`) on a listing or community post, or `Message.hiddenAt`. `SUSPEND_USER` sets `User.status` to `SUSPENDED`. Login already rejects a non-`ACTIVE` account. `RESTORE_USER` sets `ACTIVE`.

Ownership checks that already returned 403 or 404 are unchanged. Conversation lists now select the public participant card (`id` and profile display name, first name, neighborhood, city) and do not select `passwordHash` or `email`. Saved searches, favorites, quotes, applications, and transactions stay scoped to the caller or the owner. A non-participant message report is 404, so the id is not confirmed.

### HTTP errors

Nest’s JSON shape is unchanged: `{ statusCode, message, error }`.

| Status | When |
| --- | --- |
| 401 | Missing or invalid access token. |
| 403 | Not the owner, not a participant, not staff, or a block is in the way. |
| 404 | Private or missing target, including a draft listing and a message outside the caller’s threads. |
| 409 | Duplicate report or block, self-report, self-block, closed report, or an action that does not apply. |
| 429 | Rate limit. Message: `Too many requests`. |

## Rate limits

In Redis when `REDIS_URL` is set (`INCR` + `PEXPIRE`). Otherwise an in-process window. If Redis throws, the process uses that in-memory window. Disabled when `NODE_ENV=test` unless `RATE_LIMIT_ENFORCE=1`.

| Action | Env | Default | Window | Key |
| --- | --- | --- | --- | --- |
| Register | `RATE_LIMIT_AUTH_REGISTER` | 5 | 15 minutes | client address |
| Login | `RATE_LIMIT_AUTH_LOGIN` | 10 | 15 minutes | client address |
| New conversation and message send | `RATE_LIMIT_MESSAGING` | 30 | 1 minute | caller id |
| Listing create and draft | `RATE_LIMIT_LISTINGS` | 20 | 1 hour | caller id |
| Offer create and counter | `RATE_LIMIT_OFFERS` | 30 | 1 hour | caller id |
| Report create | `RATE_LIMIT_REPORTS` | 10 | 1 hour | caller id |

The address is the first `X-Forwarded-For` value, then the socket address. A failed login still counts.

## Text sanitization

`sanitizeText` in `backend/src/common/text.ts` strips markup and ASCII control characters, trims, and caps length. It runs on registration names, listing and request text, offer and counter messages, chat bodies, review bodies, community post and comment text, housing, job, and service create text, quote notes, and report details.

## Frontend wires

Figma layout is unchanged. Existing controls now call the API:

- Listing detail, UUID id: “Report this listing” → `POST /safety/reports` with `LISTING` / `OTHER`. A fixture id still says reporting is not available.
- Profile: “Report this profile” → `USER` / `OTHER`. “Block this profile” / “Unblock this profile” only when another user’s id was passed in. Own profile has no block button. Follow stays local.
- Messages: the existing shield button (`Report this conversation`) reports the latest incoming `MESSAGE`, or the other `USER` when the thread has no incoming message. A 403 from a block shows in the existing send alert.

Community has no report button. The lost-and-found line “Reports from neighbors will show up here” is empty-state copy. `COMMUNITY_POST` reports are accepted by the API and are not painted on that screen.

## Tests

Backend Jest (`pnpm test` in `backend/`, 152 passing) includes:

- `safety.service.spec.ts` — report, duplicate, self-report, hidden message id, block/unblock, queue forbidden to a neighbor, hide, suspend, closed report
- `safety.http.spec.ts` — 401, 400, 404, 409, 403, and 429 on reports, plus 429 on login, message send, listing create, and offer create
- `rate-limit.spec.ts`, `text.spec.ts`
- `messaging.service.spec.ts` — blocked send does not publish
- `messaging.privacy.spec.ts` — public participant select and redacted hidden messages
- Existing ownership specs for listings, requests, reviews, and conversations still pass

Frontend Vitest (`pnpm test`, 55 passing) includes listing report, fixture report left local, profile report/block/unblock, and the message shield.

`pnpm exec tsc --noEmit` and `pnpm build` passed for the frontend and the backend on this machine. CI on the pull request is the check that must be green before merge.

## Known issues

- Not production ready. No signed-in browser pass against Compose was run for this phase. Docker Desktop was not part of this verification.
- Rate-limit windows are per process when `REDIS_URL` is empty or Redis errors. Several API instances do not share a memory window.
- `X-Forwarded-For` is trusted. The proxy in front of the API has to overwrite it.
- Suspension is enforced at login and on the interactions above. `AuthGuard` does not reload `User.status` on every request, so an access token issued before suspension works until it expires (default 15 minutes).
- The same person cannot file a second report of the same target after the first is dismissed. The unique key does not depend on status.
- Hiding a listing or post sets `deletedAt`. The owner’s publish route treats that as missing, so they cannot put it back. Restoring hidden content is not a moderation action. `RESTORE_USER` only changes account status.
- There is no admin UI and no seed staff user.
- Community posts, housing, jobs, and services can be reported only through the API. The painted community screen has no report control.
- Notifications, follow, share, reserve, and payments are still not in this release.

## Rollback

The migration `0004_trust_safety` is additive: new tables plus nullable `Message.hiddenAt`.

- App rollback: deploy the previous build (`2b96bed`). The old Prisma client ignores the extra column and the unused tables.
- Database rollback is optional. Do not drop the tables if any report or block rows should be kept. A down migration was not added. Dropping them later is a separate migration after the app no longer reads them.
- Do not merge this branch if frontend or backend CI is red.
