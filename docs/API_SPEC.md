# API specification

This document records implemented routes only. The live OpenAPI document is served at `/docs`; the API base path is `/api/v1`.

## Conventions

- JSON REST API. Authenticated operations accept `Authorization: Bearer <access-token>`.
- DTOs are validated by NestJS validation pipes.
- Pagination for listing search uses `limit` and `offset`.
- `DATABASE_URL`, `JWT_SECRET`, and `CORS_ORIGIN` are required by the backend. Redis and S3-compatible storage are required for production.
- Short-lived access tokens are paired with rotated, revocable HTTP-only refresh sessions. Redis-backed route rate limiting is global.

## Health and authentication

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | No | Process health |
| GET | `/ready` | No | Database readiness check |
| POST | `/auth/register` | No | Create account and issue access token |
| POST | `/auth/login` | No | Authenticate and issue access token |
| POST | `/auth/refresh` | Refresh cookie | Rotate refresh session and issue access token |
| POST | `/auth/logout` | Refresh cookie | Revoke the current device session |
| POST | `/auth/logout-all` | Yes | Revoke all device sessions |
| GET | `/users/me` | Yes | Current user and profile |
| PATCH | `/users/me/onboarding` | Yes | Persist neighborhood, interests, capabilities, and notification preferences |
| PATCH | `/users/me` | Yes | Edit the caller's profile |
| GET | `/users/me/export` | Yes | Export account data without credentials |
| DELETE | `/users/me` | Yes + password | Anonymize the account and revoke sessions |
| GET | `/users/:id/profile` | Yes | Read a minimized active public profile |

## Categories and listings

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/categories` | No | List available categories |
| GET | `/listings` | No | Search listings |
| GET | `/listings/mine` | Yes | List caller's published listings and private drafts |
| GET | `/listings/:id` | No | Read a listing |
| POST | `/listings` | Yes | Create a private draft listing |
| POST | `/listings/:id/publish` | Yes, owner | Publish a draft listing |
| PATCH | `/listings/:id` | Yes, owner | Edit a listing |
| DELETE | `/listings/:id` | Yes, owner | Archive a listing |
| POST | `/listings/:id/images/upload` | Yes, owner | Get a short-lived S3-compatible signed form for one image |
| POST | `/listings/:id/images/complete` | Yes, owner | Verify uploaded object metadata and persist its listing image |
| POST | `/listings/:id/images/reorder` | Yes, owner | Set the cover image and order for all attached images |
| DELETE | `/listings/:id/images/:imageId` | Yes, owner | Remove a listing image |
| POST | `/listings/:id/favorite` | Yes | Toggle favorite; response reports resulting `saved` state |
| GET | `/listings/favorites` | Yes | List the caller's saved listings |
| GET | `/listings/saved-searches` | Yes | List saved searches |
| POST | `/listings/saved-searches` | Yes | Persist query and filter JSON |
| DELETE | `/listings/saved-searches/:id` | Yes, owner | Delete a saved search |

Listing search currently supports query, category ID, price bounds, condition, free-only, delivery availability, sort (`newest`, `price_asc`, `price_desc`), limit, and offset. Verified-only and radius filtering are not supported. Unknown query fields are rejected by request validation.

Image uploads use short-lived presigned POST forms; the server checks ownership, image count, object size, declared MIME type, and image file signature before persisting the image. JPEG, PNG, and WebP are supported, up to 10 MB each and 5 images per listing. Storage routes return service-unavailable until the S3 endpoint, bucket, credentials, and public read URL are configured.

## Need requests and offers

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/requests` | Yes | List visible requests; offer data is restricted to request participants |
| POST | `/requests` | Yes | Create a need request |
| POST | `/requests/:id/offers` | Yes | Submit an offer |
| POST | `/requests/offers/:id/counter` | Yes | Counter an offer |
| PATCH | `/requests/offers/:id/accept` | Yes, request owner | Accept offer, close request, create transaction and private conversation |
| PATCH | `/requests/offers/:id/reject` | Yes, request owner | Reject offer |

There is no standalone request detail, matching, nearby radius discovery, attachment, or expiration endpoint yet.

## Conversations and messages

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/conversations` | Yes | List caller's conversations |
| POST | `/conversations` | Yes | Find or create a direct conversation with a participant |
| GET | `/conversations/:id/messages` | Yes, participant | Read conversation history |
| POST | `/conversations/:id/messages` | Yes, participant | Persist and send a message |
| PATCH | `/conversations/:id/read` | Yes, participant | Mark messages read |

Socket.IO namespace `/realtime` requires a valid access token at handshake. Joining a conversation room requires participant authorization. Message delivery, read updates, and typing events are restricted to authorized rooms. Attachments and Socket.IO notification delivery are not implemented.

## Notifications

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/notifications` | Yes | List the caller's latest 50 notifications |
| GET | `/notifications/unread-count` | Yes | Return the caller's unread notification count |
| PATCH | `/notifications/:id/read` | Yes, owner | Mark one notification as read |
| PATCH | `/notifications/read-all` | Yes | Mark all of the caller's notifications as read |

New offers, counteroffers, offer decisions, and incoming messages create durable in-app notifications in the same database transaction as their source action. Message notifications respect the user's `messages` preference. The frontend polls the unread count and provides a persisted notification center; push/email delivery and notification pagination are not implemented.

## Transactions and reviews

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/transactions` | Yes, participant | List caller's transactions |
| PATCH | `/transactions/:id/status` | Yes, participant | Apply a permitted transaction state transition |
| POST | `/transactions/:id/appointments` | Yes, participant | Schedule the exchange |
| POST | `/transactions/:id/reviews` | Yes, eligible participant | Review the other participant after completion |

Offer acceptance creates a transaction at `ACCEPTED`; scheduling uses the appointment endpoint. The server enforces allowed status transitions and participant access. A database uniqueness constraint prevents duplicate reviews for the same transaction, author, and subject.

## Community

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET/POST | `/community/posts` | Yes | List visible posts or create a post |
| POST | `/community/posts/:id/comments` | Yes | Add a comment |
| POST | `/community/posts/:id/reactions` | Yes | Toggle like/helpful/celebrate reaction |
| DELETE | `/community/posts/:id` | Yes, author | Soft-delete a post |
| GET/POST | `/community/events` | Yes | List upcoming events or create one |
| POST | `/community/events/:id/rsvp` | Yes | Set RSVP and enforce capacity |
| DELETE | `/community/events/:id` | Yes, organizer | Cancel an event |

Blocked-neighbor activity is excluded from results, and interaction endpoints enforce blocks in both directions.

## Trust and safety

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/safety/blocks` | Yes | List caller's blocked accounts |
| POST/DELETE | `/safety/blocks/:userId` | Yes | Block or unblock an account |
| POST | `/safety/reports` | Yes | Report a user, listing, request, or message |
| GET | `/safety/reports` | Moderator/admin | Review reports, optionally filtered by status |
| PATCH | `/safety/reports/:id` | Moderator/admin | Record an action and resolve/dismiss a report |

Blocking is enforced for direct conversations, request offers, community interactions, and event RSVPs. Duplicate open reports for the same target are rejected.

## Planned, not implemented

The remaining planned contracts are password recovery/email verification, payment intents/payouts/refunds, saved-search match delivery, push/email notifications, message attachments, domain-specific housing applications/service bookings/job applications, geospatial radius search, disputes, and detailed operational audit history. Do not build clients against these until their routes appear in the generated OpenAPI document.
