# API Specification (Initial Production Contract)

## 1. API conventions

- Base URL: `/api/v1`
- Auth: JWT via Authorization header, plus refresh token rotation
- Validation: Zod for request validation and DTO parsing
- Errors: structured JSON envelope with `code`, `message`, `details`, `timestamp`
- Pagination: `page`, `limit`, `cursor`
- Filtering: query parameters with standardized operators on `category`, `price`, `distance`, `status`, `verified`, `sort`
- Rate limiting: global and per-user limits for high-risk endpoints

## 2. Authentication and profile endpoints

### `POST /auth/register`
Creates a user account and initial profile.

Request:
```json
{
  "email": "user@example.com",
  "password": "StrongPass!123",
  "firstName": "Gad",
  "lastName": "Miller",
  "neighborhood": "Inman Park",
  "city": "Atlanta",
  "state": "GA"
}
```

Response:
```json
{
  "user": { "id": "uuid", "email": "user@example.com" },
  "tokens": {
    "accessToken": "...",
    "refreshToken": "..."
  }
}
```

### `POST /auth/login`
Authenticates an existing user.

### `POST /auth/refresh`
Refreshes access tokens.

### `GET /users/me`
Returns authenticated user profile and trust summary.

### `PATCH /users/me/profile`
Updates profile fields, availability, and preferences.

### `GET /users/:id/profile`
Public profile including trust passport and reviews.

Implemented in the first frontend integration slice:

- `GET /users/me`
- `PATCH /users/me/onboarding`
- `GET /categories`

The onboarding endpoint persists neighborhood, interests, capabilities, and notification preferences.

## 3. Marketplace and listings endpoints

### `GET /categories`
Returns the seeded category catalog used by listing creation and filtering.

### `GET /listings`
Returns paginated listings with filters.

Query params:
- `query`
- `category`
- `condition`
- `minPrice`
- `maxPrice`
- `distance`
- `verifiedOnly`
- `freeOnly`
- `deliveryOnly`
- `sort`
- `neighborhood`

### `GET /listings/:id`
Returns listing detail, seller summary, related items, reviews, and availability.

Implemented listing persistence endpoints:

- `PATCH /listings/:id` – ownership-protected listing edits
- `DELETE /listings/:id` – ownership-protected archive/soft delete
- `POST /listings/:id/favorite` – authenticated favorite toggle
- `GET /listings/favorites` – authenticated saved listings
- `POST /listings/saved-searches` – persist a search and filter JSON
- `GET /listings/saved-searches` – retrieve the current user's saved searches

The Saved Items page consumes the favorites and saved-search endpoints. Price-drop history,
saved-search alert toggles, and notification delivery are not implemented yet and are shown
as unavailable rather than represented by fixture data.

### `POST /listings`
Creates a new listing.

Request example:
```json
{
  "title": "West Elm Mid-Century Modern Sofa",
  "category": "Furniture",
  "subcategory": "Sofas & Couches",
  "price": 650,
  "condition": "Like New",
  "description": "Clean, smoke-free sofa.",
  "location": {
    "latitude": 33.7490,
    "longitude": -84.3880,
    "neighborhood": "Decatur",
    "city": "Atlanta"
  },
  "pickupAvailable": true,
  "deliveryAvailable": false,
  "shippingAvailable": false,
  "images": ["s3://bucket/uuid.png"]
}
```

### `PATCH /listings/:id`
Updates listing fields.

### `DELETE /listings/:id`
Soft deletes a listing.

### `POST /listings/:id/save`
Saves or unsaves a listing.

### `GET /listings/favorites`
Returns saved listings.

## 4. Need requests and matching endpoints

### `POST /requests`
Creates a need request.

Example:
```json
{
  "title": "Looking for a standing desk under $500",
  "description": "Need a compact desk for a home office in Midtown.",
  "category": "Furniture",
  "requirements": ["under $500", "pickup available", "like new"],
  "location": {
    "latitude": 33.7756,
    "longitude": -84.3963,
    "radiusMiles": 10
  }
}
```

### `GET /requests/:id`
Return request details and matching listings.

### `GET /requests/:id/matches`
Return nearby listing and service matches.

### `POST /requests/:id/offers`
Create an offer to fulfill a request.

### `PATCH /offers/:id`
Accept, reject, or counter an offer.

Implemented in the first backend slice:

- `GET /api/v1/requests`
- `POST /api/v1/requests`
- `POST /api/v1/requests/:id/offers`
- `POST /api/v1/requests/offers/:id/counter`

## 5. Messaging endpoints

### `GET /conversations`
Returns active conversation summaries for the user.

### `GET /conversations/:id/messages`
Returns messages for a thread.

### `POST /conversations/:id/messages`
Sends a message.

### `POST /conversations/:id/read`
Marks messages as read.

### `POST /conversations/:id/typing`
Publishes typing status to socket clients.

Implemented in the first backend slice:

- `GET /api/v1/conversations`
- `GET /api/v1/conversations/:id/messages`
- `POST /api/v1/conversations/:id/messages`
- `PATCH /api/v1/conversations/:id/read`
- Socket.IO namespace `/realtime` is reserved for authenticated conversation events.

## 6. Transaction endpoints

### `GET /transactions`
Returns active and completed transactions for the authenticated user.

### `POST /transactions/:id/appointments`
Creates or updates a meetup/appointment.

### `POST /transactions/:id/complete`
Marks the exchange as complete.

### `POST /transactions/:id/payments`
Creates payment intent or local payment record.

### `POST /transactions/:id/disputes`
Starts a dispute or claim process.

Implemented in the first backend slice:

- `GET /api/v1/transactions`
- `PATCH /api/v1/transactions/:id/status`

The status endpoint enforces the server-side state machine and records every valid transition as a `TransactionMilestone`.

## 7. Community endpoints

### `GET /community/posts`
Returns recent neighborhood posts and events.

### `POST /community/posts`
Creates a new community post.

### `POST /community/posts/:id/comments`
Adds a comment.

### `POST /community/posts/:id/reactions`
Adds or updates a reaction.

### `GET /community/events`
Returns event listings and RSVP state.

## 8. Trust and moderation endpoints

### `POST /reviews`
Creates a review after a transaction is complete.

### `GET /users/:id/reviews`
Returns reviews for a user.

### `POST /reports`
Reports abuse, fraud, or dangerous behavior.

### `POST /moderation/actions`
Creates an admin moderation action.

## 9. Notification endpoints

### `GET /notifications`
Returns notifications and badge counts.

### `PATCH /notifications/:id/read`
Marks a notification as read.

## 10. Workflow example

The primary request-first flow should work like this:

1. User posts a `NeedRequest`
2. Search service finds relevant `Listing`, `ServiceOffer`, `HousingListing`, or `JobListing`
3. Other users create `RequestOffer` entries
4. Requester opens thread conversation
5. Offer accepted/rejected and `Transaction` created
6. Appointment and payment milestones update
7. Completion triggers `Review` and `TrustPassport` updates

## 11. Validation and security requirements

- All request bodies validated with Zod schemas
- Authenticated user context enforced via guards
- Users can only access their own messages, offers, and financial records unless explicitly authorized
- Files uploaded via S3 presign flows never expose secret keys to frontend
- Rate limit low-trust endpoints such as login and password reset
- WebSocket events must require auth tokens and validate message identity

## 12. OpenAPI overview

The backend should expose Swagger/OpenAPI for:

- Auth modules
- User profiles and verification
- Listings and search
- Need requests and offers
- Messaging and WebSockets
- Transactions and payments
- Trust, review, and reporting
- Community features

This will let the frontend team integrate against a versioned contract while the backend matures.
