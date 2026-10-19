# Frontend-to-backend feature map

The React/Vite application and its existing component system remain the UI source of truth. `src/api/client.ts` centralizes REST and Socket.IO access; `src/api/listing-mapper.ts` maps API listing records into the existing listing-card model.

## Current page and action mapping

| Page / route | Connected behavior | Remaining fixture, unavailable, or partial behavior |
| --- | --- | --- |
| Landing | Public API listing/category preview, email/password login; registration routes to onboarding | Social sign-in is unavailable; usage/testimonial/trust claims are removed |
| Onboarding | Account, manually selected neighborhood, interests, capabilities, and preference persistence | Automatic location, email/phone verification, legal documents, push/email notification delivery, and refresh-token rotation are absent |
| HomeFeed | Marketplace listing feed, API category filters, free-only filter, persisted favorite state, listing-ID navigation, loading/error/empty/retry states | Recommendations are not personalized; alerts, services, community, events, follows, and maps are explicitly unavailable |
| Explore | API listing search, server-side supported filters/sort, persisted favorite state, pagination inputs | Radius and verified-only controls are unavailable; map mode is disabled; example queries are not search history |
| Categories | API category catalog, newest marketplace listings, category selection opens filtered Explore | Category descriptions/counts/trending terms are not available in API |
| MapDiscovery | Explicit unavailable state | Map pins, radius search, and neighborhood boundaries are not implemented |
| ListingDetail | Persisted listing ID route uses API detail, listing images, favorite toggle, direct conversation with seller | Legacy route without an ID shows an unavailable state; listing-specific offers are unavailable |
| CreateListing | Dynamic categories; files validated client/server, uploaded via short-lived S3-compatible signed forms, confirmed and ordered before the listing draft is published; retries continue a saved draft | Drafts cannot yet be managed after leaving this flow; the UI does not expose post-publication image editing; image upload requires configured object storage |
| Requests | Create/discover requests, submit offer, requester accept/reject, transaction schedule/progression/completion, review | No request detail API, matching/radius search, attachments, or live database/E2E verification |
| Messages | REST conversation history/send/read, Socket.IO message/typing/read updates, disconnected polling fallback; incoming message persists a notification | Attachments and push/email notification delivery are unavailable |
| Notifications | API-backed offer, counteroffer, offer decision, and incoming-message records; read state and unread count persist, notification center has loading/empty/error/retry states | Latest 50 only; no pagination, push/email delivery, notification preferences UI, or live database/E2E verification |
| SavedItems | API favorites and saved-search persistence; save-state failure rollback; restore saved query and filters to Explore; owner-only saved-search deletion | Price alerts, new-match alerts, and collections/wishlist are unavailable |
| Profile | Current account identity, own published listings, completed exchange count, and received review records use APIs | Profile editing, verification, passport, report/block, and explainable trust metrics are unavailable |
| Dashboard | Account-derived listing/offer/exchange/conversation counts, incoming request offers, accept/decline actions, exchange status, conversation previews, and owner-only listing edit/archive actions use APIs | Listing analytics, draft management, counteroffers, notification activity feed, and trust metrics are unavailable |
| Housing | Searches real marketplace listings in a matching persisted housing category; details, saves, and generic message-seller flow reuse core marketplace APIs | No housing category yields an explicit unavailable state; no applications, booking, or housing-specific verification |
| Services | Searches real marketplace listings in a matching persisted service category; details, saves, and generic message-seller flow reuse core marketplace APIs | Provider profiles, availability, booking, and background checks are unavailable |
| Jobs | Searches real marketplace listings in a matching persisted jobs/gigs category; details, saves, and generic message-seller flow reuse core marketplace APIs | No matching category yields an unavailable state; applications and hiring workflow are absent |
| Community | Explicit unavailable state with routes back to marketplace and requests | Posts, reactions, events, RSVP, and moderation APIs are absent |

## Global navigation

The navigation identity and neighborhood are read from the authenticated profile; absent values are shown as generic/unset rather than fabricated. Location editing and radius search are unavailable, and the location display is non-interactive. Search inputs route to Explore but do not accept or preserve a query. The bell badge uses the persisted unread notification count; no message-unread count is advertised.

## Persisted API data and workflow

- Account and onboarding: `POST /auth/register`, `POST /auth/login`, `GET /users/me`, `PATCH /users/me/onboarding`.
- Marketplace: categories and listing search/detail/create/edit/archive in the listings controller.
- Saving: listing favorite toggle and saved-search create/list.
- Requests: create/list and offer submit/counter/accept/reject.
- Acceptance: server-side operation accepts one offer, closes the request, creates a transaction, and creates a participant-only conversation.
- Transaction lifecycle: schedule appointment, enforce status transition, complete, then review.
- Messaging: conversation create/list, message history/send, read state, authenticated Socket.IO events. Offer and message actions persist in-app notification records; notifications can be listed/read through the authenticated API.

The API uses explicit public response selections for listing/request/conversation data. Never map password hashes, private profile fields, or exact coordinates into public cards.

## Remaining mock-data dependencies

No page imports runtime marketplace fixtures from `src/data`; remaining references in Explore, HomeFeed, and SavedItems are type-only. Unimplemented capability surfaces remain explicit: MapDiscovery, Community publishing, Housing bookings/applications, Services booking/provider profiles, Job applications, saved-search alerts/removal, trust/safety verification, payments, and push/email notifications. Listing photos now use signed uploads; Landing retains static brand/feature copy but uses live records for its listing/category preview.

## Interaction policy

For any further page connection, meaningful controls must call a persisted endpoint, reflect backend state after refresh, be intentionally disabled with an explanation, or show an explicit unavailable state. Loading, empty, error, retry, unauthorized, and removed states should be supplied for connected operations. Preserve existing responsive layout and styles.
