# Frontend-to-Backend Feature Map

Page engine: `src/App.tsx` holds `page` and swaps screens. There is no URL per screen. Remaining fixtures live in `src/data/index.ts` (`sellers`, `listings`, `mapListings`). Map and Profile no longer read those arrays. Housing, jobs, services, and community fixture arrays were removed after those screens were pointed at `/api/v1`. Landing and the Categories featured strip still use `listings`. Listing Detail uses `GET /listings/:id` for UUID ids, including the similar strip. Non-UUID ids still use `listings`.

**IMPLEMENTED** means the page or client already calls an endpoint that exists. **TARGET** means the screen is Figma-complete and still local, or a control on a wired screen has no endpoint. Request-flow states for Nova are specified in [UX_REQUEST_FLOW_STATES.md](./UX_REQUEST_FLOW_STATES.md). Decisions that constrain wiring are in [DECISIONS.md](./DECISIONS.md).

v1 wiring does not add AI calls. The Create Listing AI Review step and landing scam-detection sentence stay visual. This map is not a release-complete claim. Local `.env`, Compose, and browser e2e on a Mac are still a separate step.

## IMPLEMENTED

### Shell

| Location | Behavior | API |
| --- | --- | --- |
| `App` boot | "Loading Neighborly..." until session check finishes | `GET /users/me` when `neighborly.access_token` is set. Failure clears the token. |
| `App` sign-out | Returns to `landing` | `api.auth.signOut` removes the token only. |
| `Navigation` message badge | Same coral count on the desktop header, the mobile header, and the mobile bottom nav. The badge stays hidden at 0. Click still opens `messages`. | `GET /conversations` after a session. The count is conversations whose latest message is from someone else and whose caller `lastReadAt` is missing or older than that message (`unreadConversations`). `GET /conversations` returns only the latest message, so this is a thread count, not a notification feed. 401, an empty inbox, and signed-out all hide the badge. There is no `GET /notifications`. |
| Signed-out gate | Any page other than `landing` and `onboarding` shows the existing house empty state with two buttons, both navigating to `landing` | None |
| `Landing` sign-in dialog | Email and password, inline error, disabled while submitting | `POST /auth/login` |
| `Onboarding` | Multi-step account setup. Email path persists. | `POST /auth/register`, then `PATCH /users/me/onboarding` |
| `CreateListing` | Loads categories. Publish persists a marketplace listing. Save draft persists `DRAFT` and returns home. Step-5 alert, "Publishing...", and "Saving..." stay in the existing wizard. AI Review copy is still local. | `GET /categories`, `POST /listings`, `POST /listings/drafts` |
| `SavedItems` | Saved Listings and Saved Searches tabs load, error, and empty for real. | `GET /listings/favorites`, `GET /listings/saved-searches`, `POST /listings/:id/favorite` |
| `ListingCard` heart | Calls the API unless the parent passes `onSavedChange` | `POST /listings/:id/favorite` |
| `HomeFeed` listings, services, events, discussions | Nearby, recommended, free, and new-today rails use listings. Service, event, and discussion strips use the vertical APIs. Loading, empty, and error cards match Dashboard. 401 copy is "Sign in to continue." | `GET /listings`, `GET /services`, `GET /community/events`, `GET /community/posts`, `GET /users/me` for the greeting name |
| `Dashboard` offers, reviews, meetups, my listings, activity, message count | Offers, reviews, and meetups were already live. The Offers tab and Overview pending cards now load the caller's offers (`scope=all` so Received and Sent chips still work). My Listings filters `GET /listings` to the signed-in seller. Activity is built from offers, conversations, and transactions. Header name comes from `GET /users/me`. | `GET /users/me`, `GET /requests/offers?scope=all`, `GET /transactions`, `GET /conversations`, `GET /listings`, `POST /reviews`, offer accept/reject |
| `Housing` | Rent/sale, type, beds, max price (dollars converted to `maxPriceCents`), pets, furnished, verified, utilities, and sort are query params. Cards format `priceCents / 100`. Owner name is the public card. Distance is the label "Nearby" because miles are not stored. | `GET /housing` |
| `Jobs` | Type, level, workplace, and search hit `GET /jobs`. Salary stays the display string. Apply and bookmark call the job routes. Saved and applied ids come from the caller's lists. A 401 on those private reads leaves the public list up and shows "Sign in to continue." | `GET /jobs`, `GET /jobs/saved`, `GET /jobs/applications`, `POST /jobs/:id/apply`, `POST /jobs/:id/save` |
| `Services` | Category pills and the search field call `GET /services`. "Request quote" posts notes, preferred date/time, and address. The requester's success panel is the existing "Request sent!" block. The provider still does not see the street address until accept, which this page does not perform. | `GET /services`, `POST /services/:id/quotes` |
| `Community` | Feed, events, lost & found, and giveaways load from the community routes. Reactions, RSVP, giveaway claim, and the new-post modal persist. Counts on the stats bar for posts and events are the loaded rows. | `GET/POST /community/posts`, `POST /community/posts/:id/reactions`, `GET /community/events`, `POST /community/events/:id/rsvp`, `GET /community/lost-found`, `GET /community/giveaways`, `POST /community/giveaways/:id/claim` |

`src/api/client.ts` implements requests, conversations, transactions, reviews, housing, jobs, services, and community. Vitest covers the vertical mappers plus happy, empty, and 401 renders for these screens (`pnpm test`).

### Create Listing payload that actually leaves the browser

`categoryId`, `title` (AI-suggested title string if "Apply suggestion" was clicked, still just a string), `description`, `condition`, `pickupAvailable`, `deliveryAvailable`, and `priceCents` when the dollar field is filled (`Math.round(dollars * 100)`). Publish calls `POST /listings`. Save draft calls `POST /listings/drafts` with the same body.

Not sent: photos, tags, shipping, coordinates, listing-type card, and the AI panels. Those panels stay on screen. `POST /requests` is not called by this wizard.

### Saved Items behaviors that are not the API

- Collection chips and "New collection" are local. Every chip shows `savedListings.length`.
- Compare bar is local (max 3). "Compare →" has no handler.
- Price Alerts copies favorites and paints a synthetic "$100 off" / "↓ $100 off". That is not `PriceHistory`.
- New-match block is static copy: "New-match alerts will appear here once saved-search notifications are enabled."

### Chrome that stays painted after this wiring

These controls and copy do not have an endpoint. They stay on screen and are not treated as persisted:

- Home location line "Inman Park · Atlanta, GA", category chips (visual only), "Neighbors to follow" people, and the map teaser pins.
- Community "2,847 neighbors" is not a user count. Service category pill counts `(24)`, `(12)`, and the rest are the original labels.
- Dashboard trust banner ("Verified Neighbor", 98%, 4.9, 52 transactions). View, save, message, and offer counters on a listing card are "—". "Earned" is "—" because payments are not connected. Pause, Promote, and Mark sold have no route.
- Housing heart, Tour, and the commute teaser. Message jumps to the messages page without creating a thread.
- Jobs city field stays "Atlanta, GA" and is not a query param. Share has no handler. Responsibility bullets fall back to the original four lines only when a job has an empty `responsibilities` array.
- Services heart and "Become a provider".
- Community "+ Post lost/found" and "+ Give something" have no composer yet. Reply and Share on a post do not open a thread. Lost-and-found "Contact" does not start a conversation.
- Explore's bell ("Save alert"), the Saved Items price-alert bell, and Onboarding notification toggles are not the nav message badge. They stay local. Saved-search delivery and a notification list are still target.

## TARGET

### Page inventory

| Page id | File | What the screen shows today | Fixtures | Target module when wired | Notes for Nova |
| --- | --- | --- | --- | --- | --- |
| `landing` | `Landing.tsx` | Marketing, search field, sign-in dialog | Inline feature copy and `listings` slice | Auth is implemented | Search box is not hooked to `GET /listings`. Header Browse, Services, Housing, Jobs, and "Post a Listing" open the sign-in dialog. Get started and "Create an account" still open onboarding. There is no preview bar that enters the app without a session. |
| `onboarding` | `Onboarding.tsx` | Method, profile, neighborhood, interests, notifications | Step copy | Implemented | Google and Apple tiles are not providers. |
| `home` | `HomeFeed.tsx` | Category chips, listing rails, services, community strip | Suggested people only | Listings, services, events, and posts are implemented | Follow has no endpoint. Cards go to `listing` with the real id. |
| `explore` | `Explore.tsx` | Query, filters, grid/list, suggestions | Suggestions are inline. Results come from `GET /listings`, then extra filters run in the browser | Target filters beyond `query` | "Save alert" toggles `alertSaved` locally. Map control navigates to `map`. |
| `categories` | `Categories.tsx` | Category grid and a listing strip | Featured strip still uses `listings`. Housing, Jobs, Services, and Vehicles counts come from the API. Other tile counts stay the original labels. | `GET /categories` (`listingCount`) | Loading, empty, and error lines sit under the existing header. Some tiles navigate to `housing`, `services`, `jobs`, `community`. |
| `map` | `MapDiscovery.tsx` | Map-style discovery | None for pins or the list. Safe spots and the mile line stay painted | `GET /listings?limit=100` | No Mapbox call. Pins use painted neighborhood centroids, not coordinates. See `docs/API_SPEC.md`. |
| `listing` | `ListingDetail.tsx` | Live listing for a UUID id. Non-UUID ids still match `listings` | Fixtures only when the id is not a UUID | `GET /listings/:id`, `GET /listings` for similar cards (`categoryId` when present, otherwise recent published), `POST /listings/:id/favorite`, `GET /listings/favorites` to paint the saved heart, `POST /conversations` on Message send for a UUID seller | Seller card uses the public seller on the listing. "View full profile" passes that user id to `profile`. Message send for that live listing posts `participantId`, `listingId`, and the trimmed body, then keeps the painted “Message sent!” redirect. 401 shows “Sign in to continue.” Other failures stay in the modal. A non-UUID id still uses the local sent state and does not call the API. Negotiate, reserve, report, and share stay local. No owner archive control is painted here. There is no `GET /notifications`. |
| `create` | `CreateListing.tsx` | Six-step wizard | Sample desk copy is the initial state | Publishes with `POST /listings`. Save draft uses `POST /listings/drafts`. | AI Review stays decorative. Composer states: [UX_REQUEST_FLOW_STATES.md](./UX_REQUEST_FLOW_STATES.md). |
| `messages` | `Messages.tsx` | Two panes, filters, thread, offer card, safety banner | None for the thread list | Conversations API | Accept, decline, counter, and send are wired when a thread exists. |
| `saved` | `SavedItems.tsx` | Three tabs | API for the first two tabs | Price history and alert delivery are target | Keep the empty/error cards when extending. |
| `profile` | `Profile.tsx` | Signed-in user, or `userId` when passed | None | `GET /users/me` when no id is passed, then `GET /users/:id/profile`, `GET /users/:id/reviews`, `GET /listings?sellerId=` for published and `status=SOLD` | `App` stores the optional id from navigation. Listing detail passes the seller id. "My Profile" passes none, so the signed-in user loads. No edit control, so follow, message, and report stay local. Reviews tab is read-only. Response time is an em dash. The avatar check means `emailVerified`, not an ID check. |
| `dashboard` | `Dashboard.tsx` | Overview, My Listings, Offers, Activity | Trust banner and the em dashes noted above | Requests, offers, transactions, reviews, listings, conversations are implemented | Offer and review states: [UX_REQUEST_FLOW_STATES.md](./UX_REQUEST_FLOW_STATES.md). |
| `housing` | `Housing.tsx` | Rental browsing | None | Implemented | See the implemented table. |
| `services` | `Services.tsx` | Provider cards and quote modal | Category counts only | Implemented | Quote modal posts to the API. Address stays on the requester response. |
| `jobs` | `Jobs.tsx` | List/detail, apply, save | Atlanta field and the responsibility fallback | Implemented | Apply and save persist. |
| `community` | `Community.tsx` | Posts, events, lost & found, giveaways | "2,847 neighbors" and giveaway tips | Implemented | Reactions, RSVP, claim, and new posts persist. |

`Navigation` (`src/components/Navigation.tsx`) highlights the current page id, pins location to a local Atlanta list, and shows `unreadMessages` from `App`. That number is the live unread-thread count from `GET /conversations`, or 0 when the caller is signed out, the list is caught up, or the list returns 401. The badge chrome is unchanged. Sign-out calls the prop. Global search is not a request. The Messages inbox row still marks a thread unread from the other participant's `lastReadAt`; the nav badge and the Dashboard "N unread" line both use the caller's `lastReadAt`.

### Domain map (target bindings, existing screens only)

- `landing` + `onboarding` → `User`, `Profile`, `UserPreference`, `NotificationPreference`. Verification and device-session tables are target and have no screen of their own.
- `explore`, `home`, `categories`, `listing` → `Listing` and `Category`. Favorites → `Favorite`. Explore's save-alert control → `SavedSearch` (endpoint exists; Explore does not call it).
- `create` → `Listing` (`POST /listings` and `POST /listings/drafts`). Need requests stay on `POST /requests` for other callers. The wizard does not post a need.
- Offer cards on `dashboard` and `messages` → `RequestOffer`, `CounterOffer`, `OfferItem`.
- `messages` bubbles → `Conversation`, `Message`.
- Dashboard meetups and the Messages progress strip → `Transaction`, `TransactionMilestone`, `Appointment`.
- Dashboard "Reviews to complete" and Profile reviews → `Review`. Profile loads `GET /users/:id/reviews`. Dashboard does not call that list yet.
- `housing`, `services`, `jobs`, `community` → `HousingListing`, `JobListing`, `ServiceListing`, `CommunityPost`, `CommunityEvent`, `LostFoundItem`, and `Giveaway`. The four pages call those routes. Field mapping is in [API_SPEC.md](./API_SPEC.md).

### Controls that look done and are local

- Explore suggestions, filters, sort, and view toggle.
- Map radius subtitle ("Within 5 miles of Inman Park") and safe-spot pins. Pin selection, the list, category chips, search text, and "Search area" use the published listing payload. Closest sort is distance on the painted map.
- Listing detail negotiate, reserve, report, and share. Related cards for a UUID listing navigate with the live id. Message send on a UUID listing calls `POST /conversations`. Fixture listings still use the local modal.
- Messages filters do not include a real `transactions` predicate (`filter === 'transactions'` falls through to all).
- Dashboard Pause, Promote, and Mark sold.
- Profile follow and report.
- Community reply, share, lost-and-found contact, and the two create buttons that have no form.

### Request flow already on these screens

Dashboard loads caller-scoped offers with `GET /requests/offers?scope=all`, then accept, reject, conversations, transactions, and review create. Messages still uses request list/get, counter, accept, and reject. Do not put fixture people back on those tabs. The remaining gaps are the TARGET controls above. The Create Listing wizard publishes a listing, not a need. This map is not a release-complete claim.

Client methods to reuse, not rewrite: `api.requests.create`, `api.requests.list`, `api.requests.counterOffer`, `api.conversations.*` (including `create`), `api.transactions.list`, `api.transactions.transition`, `api.housing.list`, `api.jobs.*`, `api.services.list`, `api.services.requestQuote`, `api.community.*`.
