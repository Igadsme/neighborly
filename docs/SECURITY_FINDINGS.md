# Security findings — Sprint 1

Handoff from Sentinel to Forge. Rechecked against `main` at `5d079e8` (offer accept, reviews, and realtime send). That audit pass did not change controllers, gateways, or services.

Forge closed the two items that were still open: public listing seller PII, and unauthenticated `/realtime`. Request reads and JWT `sub` mapping were already fixed.

## SF-1 — Public request list PII — fixed

| | |
| --- | --- |
| Severity | Critical (was) |
| Status | Fixed on `main` |
| Owner | Forge |
| Route | `GET /api/v1/requests` |

`RequestsService.list` no longer includes the full `User`. It selects a public requester card:

- `id`
- `profile.displayName`
- `profile.firstName`
- `profile.neighborhood`
- `profile.city`

`passwordHash`, `email`, account status, and precise `latitude` / `longitude` are not in that select. `GET /api/v1/requests/:id` uses the same select for the requester and the offerer. `backend/src/requests/requests.service.spec.ts` asserts the public query does not contain `passwordHash`.

### Related — public listing reads — fixed

| | |
| --- | --- |
| Severity | Critical (was) |
| Status | Fixed |
| Owner | Forge |
| Routes | `GET /api/v1/listings`, `GET /api/v1/listings/:id`, `GET /api/v1/listings/favorites` |

`ListingsService.list`, `get`, and `listFavorites` no longer include the full `User`. They select the same public seller card as requests (`backend/src/common/public-user.select.ts`):

- `id`
- `profile.displayName`
- `profile.firstName`
- `profile.neighborhood`
- `profile.city`

`passwordHash`, `email`, account status, verification flags, and profile coordinates are not in that select. Those three reads also select listing columns explicitly and omit listing `latitude` / `longitude`. `backend/src/listings/listings.service.spec.ts` asserts the seller query select does not include `passwordHash`.

Favorites stays authenticated. The list and detail routes stay public. Create and update still persist coordinates for the seller; they are not part of these reads.

## SF-2 — Unauthenticated Socket.IO connections — fixed

| | |
| --- | --- |
| Severity | High (was) |
| Status | Fixed |
| Owner | Forge |
| Channel | Socket.IO namespace `/realtime` (`MessagingGateway`) |

`MessagingGateway` now rejects the `/realtime` handshake unless it carries a valid access token. The token is read from `handshake.auth.token` or `Authorization: Bearer`. `afterInit` registers Socket.IO middleware that calls `next(error)` on failure, so the client gets `connect_error` instead of `connect`. `handleConnection` verifies again and calls `disconnect(true)` if no user id was stored.

The socket user id is JWT `sub`. A client-supplied user id on the handshake or on `conversation.join` is ignored. `conversation.join` (`{ conversationId }` or the id string) joins `conversation:{id}` only after `ConversationParticipant` matches that socket user. `publishMessage` is unchanged: HTTP `sendMessage` still checks the participant before it emits `message.created`.

Covered by `backend/src/messaging/messaging.gateway.spec.ts`:

- handshake and connection without a token are rejected
- a valid access token is accepted and `userId` is `sub`
- a non-participant does not join; a forged user id is not used

Manual check, if you want the live handshake:

```js
import { io } from 'socket.io-client'
const socket = io('http://localhost:3000/realtime', { auth: {} })
socket.on('connect', () => console.log('connected', socket.id))
socket.on('connect_error', error => console.log('rejected', error.message))
```

An empty `auth` payload should log `rejected`. A login access token in `auth.token` should connect. Emit `conversation.join` with `{ conversationId }` only for a conversation that includes that user.

## SF-3 — JWT `sub` mapped to `request.user.id` — fixed

| | |
| --- | --- |
| Severity | High (was) |
| Status | Fixed on `main` |
| Owner | Forge |
| Route | Every handler behind `AuthGuard` |

`AuthGuard` now verifies the access token and assigns `request.user = { id: payload.sub, email: payload.email }`. Tokens missing `sub` or `email` are rejected. Controllers that read `AuthenticatedRequest.user.id` receive the subject.

Covered by:

- `backend/src/auth/auth.guard.spec.ts` — a token signed with `sub` becomes `request.user.id`
- `backend/src/auth/auth.jwt.spec.ts` — login issues `sub === user.id`, and the guard maps that `sub` onto `request.user.id`

The previous `it.failing` case is a normal passing assertion.

## Test harness note — `test:e2e` removed

`main` at `5d079e8` still defines `test:e2e` as `jest --config test/jest-e2e.json --runInBand`. `backend/test/jest-e2e.json` is still absent, and Playwright is not a dependency. This branch removes that script. Unit tests stay on `pnpm test` in `backend/`. Add `test:e2e` back when a real suite and its config exist.
