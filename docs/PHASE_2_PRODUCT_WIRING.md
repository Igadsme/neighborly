# Phase 2 product wiring

This note records what Phase 2 connected to the API and what stays intentionally unavailable. It is not a release. **Release readiness: NOT claimed.**

Branch: `cursor/phase2-product-wiring-589e`, based on `cc952fb` (Phase 1 marketplace seed).

## Wired end to end

- Landing popular cards and the hero preview load `GET /listings?status=PUBLISHED&limit=4`. Browse, Services, Housing, Jobs, Post a Listing, category tiles, and a card click open sign-in and then that page. Category chip counts for For Sale, Housing, Jobs, Services, and Vehicles come from `GET /categories` (`listingCount`). Other chips show an em dash.
- Dashboard Pause calls `POST /listings/:id/pause` (status `ARCHIVED`, still visible to the owner, hidden from public browse). Resume calls `POST /listings/:id/publish`. Mark sold calls `POST /listings/:id/sold`. My Listings loads `GET /listings/mine`.
- Dashboard trust copy uses `GET /users/:id/profile` (email confirmed, average rating, review count, sold listings) and completed transactions from `GET /transactions`. Empty ratings say "No reviews yet". There is no painted 4.9 or 52.
- Categories neighborhood counts use `GET /listings/neighborhoods`. A missing neighborhood is 0. A failed load says "Counts unavailable".
- Community neighbor count uses `GET /community/summary` (active users). Posts and events still count loaded rows.
- Community replies load and post `GET/POST /community/posts/:id/comments`. Lost-and-found and giveaway composers call `POST /community/lost-found` and `POST /community/giveaways`. Contact starts `POST /conversations`. Reactions, RSVP, claim, and new posts were already live.
- Housing and service Message start `POST /conversations`. Service category pill counts are counted from the loaded list. "Become a provider" calls `POST /services`. Job apply and save, and service quotes, were already live.
- Explore "Save search" calls `POST /listings/saved-searches`.
- Profile Message on another user calls `POST /conversations`.
- The nav unread badge stays the conversation unread count from `GET /conversations`. There is no separate notification list in the UI. Onboarding notification toggles already persist on `PATCH /users/me/onboarding`. Dashboard Activity is built from offers, conversations, and transactions.

## Intentionally disabled

Each of these keeps its control and explains why it does not complete:

- Promote (Dashboard and Create Listing). Payments are not connected.
- Share on a community post or a job. This app has no per-screen URL to share.
- Report on a listing or profile. No report route.
- Reserve item, and Send offer on Listing Detail. Offers belong to requests, not a listing.
- Housing save, tour, and commute filter. No favorite, tour, or commute route.
- Service save. No service-favorite route.
- Follow on Profile and Home. No follow route.
- Housing and Jobs have no create control on the existing screens. `POST /housing` and `POST /jobs` already exist and were not given a new page.
- Community events have no create control on the screen. `POST /community/events` already exists.
- Suggested people on Home stay the painted sample cards, labeled Preview · Examples. Follow is disabled. The painted scores are not live ratings.
- Landing testimonials are labeled Preview · Examples. They are not live stats.
- Listing view, save, message, and offer counters on Dashboard stay an em dash, with a “Not tracked yet” tooltip.
