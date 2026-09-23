# Frontend-to-Backend Feature Map

Page engine: `src/App.tsx` holds `page` and swaps screens. There is no URL per screen. Fixtures live in `src/data/index.ts` (`sellers`, `listings`, `jobs`, `services`, `housingListings`, `communityPosts`, `mapListings`, `conversations`).

**IMPLEMENTED** means the page or client already calls an endpoint that exists. **TARGET** means the screen is Figma-complete and still local. Request-flow states for Nova are specified in [UX_REQUEST_FLOW_STATES.md](./UX_REQUEST_FLOW_STATES.md). Decisions that constrain wiring are in [DECISIONS.md](./DECISIONS.md).

v1 wiring does not add AI calls. The Create Listing AI Review step and landing scam-detection sentence stay visual.

## IMPLEMENTED

### Shell

| Location | Behavior | API |
| --- | --- | --- |
| `App` boot | "Loading Neighborly..." until session check finishes | `GET /users/me` when `neighborly.access_token` is set. Failure clears the token. |
| `App` sign-out | Returns to `landing` | `api.auth.signOut` removes the token only. |
| Signed-out gate | Any page other than `landing` and `onboarding` shows the existing house empty state with two buttons, both navigating to `landing` | None |
| `Landing` sign-in dialog | Email and password, inline error, disabled while submitting | `POST /auth/login` |
| `Onboarding` | Multi-step account setup. Email path persists. | `POST /auth/register`, then `PATCH /users/me/onboarding` |
| `CreateListing` | Loads categories. Publish persists a listing. Step-5 alert and "Publishing..." already exist. | `GET /categories`, `POST /listings` |
| `SavedItems` | Saved Listings and Saved Searches tabs load, error, and empty for real. | `GET /listings/favorites`, `GET /listings/saved-searches`, `POST /listings/:id/favorite` |
| `ListingCard` heart | Calls the API unless the parent passes `onSavedChange` | `POST /listings/:id/favorite` |

`src/api/client.ts` also implements `requests.list`, `requests.create`, `requests.createOffer`, `requests.counterOffer`, `transactions.list`, `transactions.transition`, and `conversations.list|messages|send|markRead`. **No page calls them.** That is client-only coverage, not a wired screen.

### Create Listing payload that actually leaves the browser

`categoryId`, `title` (AI-suggested title string if "Apply suggestion" was clicked, still just a string), `description`, `priceCents` from the dollar field, `condition`, `pickupAvailable`, `deliveryAvailable`.

Not sent: photos, tags, shipping, coordinates, the AI panels.

### Saved Items behaviors that are not the API

- Collection chips and "New collection" are local. Every chip shows `savedListings.length`.
- Compare bar is local (max 3). "Compare →" has no handler.
- Price Alerts copies favorites and paints a synthetic "$100 off" / "↓ $100 off". That is not `PriceHistory`.
- New-match block is static copy: "New-match alerts will appear here once saved-search notifications are enabled."

## TARGET

### Page inventory

| Page id | File | What the screen shows today | Fixtures | Target module when wired | Notes for Nova |
| --- | --- | --- | --- | --- | --- |
| `landing` | `Landing.tsx` | Marketing, search field, sign-in dialog, Preview bar | Inline feature copy | Auth is implemented | Search box is not hooked to `GET /listings`. Preview "Home feed" calls `signIn()` in React only. |
| `onboarding` | `Onboarding.tsx` | Method, profile, neighborhood, interests, notifications | Step copy | Implemented | Google and Apple tiles are not providers. |
| `home` | `HomeFeed.tsx` | Category chips, listing rails, services, community strip | `listings`, `services`, `communityPosts` | Listings, then community | Cards go to `listing` with no id. Heart uses `ListingCard` default and will fail on fixture ids (`l1`). |
| `explore` | `Explore.tsx` | Query, filters, grid/list, suggestions | `listings` filtered in the browser | `GET /listings` plus target filters | "Save alert" toggles `alertSaved` locally. Map control navigates to `map`. |
| `categories` | `Categories.tsx` | Category grid and a listing strip | `listings` plus inline category metadata | `GET /categories` then listings | Some tiles navigate to `housing`, `services`, `jobs`, `community`. |
| `map` | `MapDiscovery.tsx` | Map-style discovery | `mapListings` | Target geo query | No Mapbox call. `MAPBOX_TOKEN` may be empty. |
| `listing` | `ListingDetail.tsx` | Always `listings[0]` (West Elm sofa) | `listings` | `GET /listings/:id` | Save, offer amount, message modal, and report are `useState`. "Send offer" has no handler. Message "send" sets local success and routes to `messages`. |
| `create` | `CreateListing.tsx` | Six-step wizard | Sample desk copy is the initial state | Request publish: `POST /requests`. Listing publish already calls `POST /listings`. | Composer states: [UX_REQUEST_FLOW_STATES.md](./UX_REQUEST_FLOW_STATES.md). |
| `messages` | `Messages.tsx` | Two panes, filters, thread, offer card, safety banner | `conversations` | Conversations API once a thread can be created | Accept/Decline set local `offerStatus`. Counter is unwired. Send appends a local bubble unless the text mentions Venmo, Zelle, or PayPal. |
| `saved` | `SavedItems.tsx` | Three tabs | API for the first two tabs | Price history and alert delivery are target | Keep the empty/error cards when extending. |
| `profile` | `Profile.tsx` | Always `sellers[0]` (Marcus) | `sellers`, `listings`, inline `reviews` | `GET /users/:id/profile`, reviews list | Follow and report are local. Reviews tab is read-only. |
| `dashboard` | `Dashboard.tsx` | Overview, My Listings, Offers, Activity | `listings` plus inline `offers`, `meetups`, activity | Requests, offers, transactions, reviews | Offer and review states: [UX_REQUEST_FLOW_STATES.md](./UX_REQUEST_FLOW_STATES.md). Stats are literals (`3`, `624`, `12`, `$1,925`). |
| `housing` | `Housing.tsx` | Rental browsing | `housingListings` | Target `HousingListing` | Out of the request-flow slice. |
| `services` | `Services.tsx` | Provider cards | `services` | Target service tables | Out of slice. |
| `jobs` | `Jobs.tsx` | List/detail, apply, save | `jobs` | Target job tables | Apply and save are local arrays. |
| `community` | `Community.tsx` | Posts and events | `communityPosts` | Target community tables | Out of slice. |

`Navigation` (`src/components/Navigation.tsx`) highlights the current page id, pins location to a local Atlanta list, and shows `unreadMessages` from the prop (hardcoded `2` in `App`). Sign-out calls the prop. Global search is not a request.

### Domain map (target bindings, existing screens only)

- `landing` + `onboarding` → `User`, `Profile`, `UserPreference`, `NotificationPreference`. Verification and device-session tables are target and have no screen of their own.
- `explore`, `home`, `categories`, `listing` → `Listing` and `Category`. Favorites → `Favorite`. Explore's save-alert control → `SavedSearch` (endpoint exists; Explore does not call it).
- `create` as a need → `NeedRequest` (`POST /requests`). `create` as a sale → `Listing` (already posted).
- Offer cards on `dashboard` and `messages` → `RequestOffer`, `CounterOffer`, `OfferItem`.
- `messages` bubbles → `Conversation`, `Message`.
- Dashboard meetups and the Messages progress strip → `Transaction`, `TransactionMilestone`, `Appointment`.
- Dashboard "Reviews to complete" and Profile reviews → `Review`.
- `housing`, `services`, `jobs`, `community` → target tables listed in [DATABASE_DESIGN.md](./DATABASE_DESIGN.md). Leave fixtures in place.

### Controls that look done and are local

- Explore suggestions, filters, sort, and view toggle.
- Map pin selection and radius.
- Listing detail negotiate, reserve, report, related-item clicks (`onClick={() => {}}` on related cards).
- Messages filters do not include a real `transactions` predicate (`filter === 'transactions'` falls through to all).
- Dashboard Accept, Counter, Decline, Edit, Pause, Promote, Mark sold, Adjust price.
- Profile follow and report.
- Jobs apply and save.
- Community reactions and RSVP (fixture handlers in that page).

### Wiring order for the request flow

1. Point `create` publish at `POST /requests` using the state spec. Leave listing publish available only if the same wizard is still the sale path; do not add a second wizard.
2. Point Dashboard Offers and the Messages offer card at real offer ids. Until `GET /requests/:id` exists, render loading then the empty or error state from the UX spec. Do not keep the Marcus/David/Priya fixture rows on an API-backed tab.
3. Counter uses `POST /requests/offers/:id/counter`. Accept and Decline wait for target routes.
4. Messages list uses `GET /conversations` only when rows exist. Do not synthesize threads.
5. Reviews: open the existing modal from "Rate". Submit waits for `POST /reviews`.

Client methods to reuse, not rewrite: `api.requests.create`, `api.requests.list`, `api.requests.counterOffer`, `api.conversations.*`, `api.transactions.list`, `api.transactions.transition`.
