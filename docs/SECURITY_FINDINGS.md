# Security findings — Sprint 1

Handoff from Sentinel to Forge. Rechecked against `main` at `5d079e8` (offer accept, reviews, and realtime send). This pass does not change controllers, gateways, or services.

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

### Related, still open — public listing reads

`ListingsService.list`, `ListingsService.get`, and `ListingsService.listFavorites` still use `seller: { include: { profile: true } }`. That include returns every `User` scalar, including `passwordHash` and `email`, plus the full profile (precise coordinates).

| | |
| --- | --- |
| Severity | Critical |
| Status | Open |
| Owner | Forge |
| Routes | `GET /api/v1/listings`, `GET /api/v1/listings/:id`, `GET /api/v1/listings/favorites` |

Favorites is authenticated. The list and detail routes are public.

Suggested fix: reuse the public user select from requests (`id` plus display name, first name, neighborhood, city) on every seller include that leaves the server. Do not return `passwordHash` or `email` on those routes.

## SF-2 — Unauthenticated Socket.IO connections — still open

| | |
| --- | --- |
| Severity | High |
| Status | Open |
| Owner | Forge |
| Channel | Socket.IO namespace `/realtime` (`MessagingGateway`) |

Rechecked in `backend/src/messaging/messaging.gateway.ts` on `5d079e8`. The class is still only `@WebSocketGateway({ namespace: '/realtime', cors })` plus `publishMessage`. There is no `OnGatewayConnection` hook, no JWT check of `handshake.auth.token` or `Authorization`, and no guard. `main.ts` does not install socket middleware. HTTP `AuthGuard` does not run for this namespace.

`publishMessage` now uses optional chaining (`this.server?.to(...)`). That avoids a crash when the server is unset. It does not authenticate the handshake.

### Repro

1. Start the API.
2. Connect a Socket.IO client to `http://<host>:<port>/realtime` with an empty `auth` payload and no `Authorization` header.
3. The `connect` event fires.

```js
import { io } from 'socket.io-client'
const socket = io('http://localhost:3000/realtime', { auth: {} })
socket.on('connect', () => console.log('connected', socket.id))
socket.on('connect_error', error => console.log('rejected', error.message))
```

CORS uses `CORS_ORIGIN` and does not authenticate the client.

### Expected

The handshake is rejected unless it carries a valid access token. The socket user id comes from JWT `sub`. Conversation rooms are joined only after a `ConversationParticipant` check.

### Actual

Any client that completes the Socket.IO handshake stays connected. `publishMessage` emits `message.created` only to room `conversation:<id>`. Nothing in the gateway joins a socket to that room, so anonymous connections do not currently receive message payloads. The next join or broadcast still has no authenticated user to authorize.

### Suggested fix

On connection, verify the access token with `JWT_SECRET`, disconnect on failure, and store `userId` from `sub`. Authorize every room join and emit against `ConversationParticipant`. Ignore client-supplied user ids.

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
