# Frontend lane contract

Backend contract for the housing and service cards, and for radius search. This file is the source the frontend lane should follow. Profile reads are unchanged: `GET /users/:id/profile` still returns `ratingAverage` (null when there are no reviews) and `reviewCount`.

## Public rating

`GET /housing`, `GET /housing/:id`, `GET /services`, and `GET /services/:id` each include:

| Field | Type | When |
| --- | --- | --- |
| `rating` | `number \| null` | Mean of published, unhidden reviews of the owner, rounded to one decimal. `null` when that count is 0, or when the rounded mean is not positive. |
| `reviewCount` | `number` | Count of those reviews. `0` when there are none. |

`rating` is never `0`. A card with no reviews is `rating: null` and `reviewCount: 0`.

The number comes from `Review` rows (`status = PUBLISHED`, `hiddenAt` null, `subjectId` = the listing owner). It does not come from `ServiceListing.rating` or `ServiceListing.reviewCount`. A stored `4.9` / `142` on the service row is not part of the public payload. Pending reviews and hidden reviews are not part of the average.

Housing has no rating columns. A housing card and a service card for the same owner show the same aggregate.

`PassportPrivacySettings.showRatings` is not applied to these listing cards.

## Radius search

These list routes accept `latitude`, `longitude`, and `radiusMiles`:

- `GET /listings`
- `GET /housing`
- `GET /jobs`
- `GET /services`
- `GET /requests`
- `GET /borrow/items`

`latitude` must be between -90 and 90. `longitude` must be between -180 and 180. `radiusMiles` is an integer from 1 to 500. A value outside that range is `400`. `radiusMiles` without both coordinates is `400`.

The radius filter is a PostGIS `ST_DWithin` circle on the `geog` column, ordered by distance. When `radiusMiles` is set, the `sort` parameter is not applied. Listing results include `distanceMiles`. Housing, jobs, and services stay arrays.

Drafts, paused listings (`ARCHIVED` with `deletedAt` null), archived listings (`deletedAt` set), and listings whose owner is not `ACTIVE` are excluded.

Community posts, events, lost-and-found, and giveaways have no coordinates and no radius parameters.
