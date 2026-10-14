# Milestone 4 — Marketplace & Listing Management

Branch: `milestone4-marketplace-listings`, branched from Milestone 3
(`a45f273`). Requirements, evidence, and verification runs are recorded here.

No production system was touched. All database work ran against disposable
PostgreSQL containers, and all object-storage work against a disposable
S3-compatible container, both created and destroyed by scripts in
`scripts/`.

## Acceptance criteria and evidence

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| A | Listing lifecycle | Done | Create, draft, edit, publish, pause, archive, restore, permanent delete, status-filtered owner view. `listings.integration.spec.ts`. |
| B | Image upload and media storage | Done | Real multipart upload into object storage, content-sniffed types, count cap, reorder, removal, media route. `docs/STORAGE.md`. |
| C | Category-specific creation | Done | `CreateListingFlow` routes Housing, Jobs, and Services to their own contracts; a specialized listing can never hit the generic endpoint. |
| D | Search, filtering, sorting | Done | Server-side filters, deterministic pagination with a `total`, bounded queries, trigram and composite indexes. |
| E | Location-aware discovery | Done | Radius bounding box plus exact distance, coarse public coordinates only. |
| F | Saved listings and searches | Done | Toggle favorite without duplicates, owner-scoped saved searches with edit and delete. |
| G | Buyer and seller interactions | Done | Existing messaging, profile, block, and report modules reused unchanged. |
| H | Frontend UX | Done | New My Listings screen, routed create flow, image manager, server-side Explore, navigation entry. |

## A. Listing lifecycle

`ListingsService` now owns every transition, and each one is checked against
the row's current status rather than assumed:

| Route | Behavior |
| --- | --- |
| `POST /listings` | Create published. |
| `POST /listings/drafts` | Create draft. |
| `PATCH /listings/:id` | Partial update. `undefined` leaves a field; an edit never changes visibility. |
| `POST /listings/:id/publish` | Draft to published. Archived to published, clearing `deletedAt`. |
| `POST /listings/:id/pause` | Published to archived, keeping it restorable. |
| `POST /listings/:id/archive` | Withdraws: `ARCHIVED` plus `deletedAt`. |
| `POST /listings/:id/restore` | Archived back to published. |
| `POST /listings/:id/sold` | Published or archived to `SOLD`. |
| `DELETE /listings/:id` | Archive. |
| `DELETE /listings/:id/permanent` | Anonymizing delete. |
| `GET /listings/:id/manage` | Owner view, including drafts and archived rows. |

**Ownership is checked before status** in `ownedListing`, so a caller cannot
probe another member's archived listings by guessing ids; a non-owner always
gets 403 and never learns the state.

**Permanent delete preserves history.** `OfferItem` and `RequestMatch` rows
that would otherwise cascade are detached first, so an offer still exists
after its listing is gone. Messages, conversations, and reviews are untouched.

**A draft cannot be published on placeholder text.** Drafts store empty
strings rather than filler copy, so the publish-time content check cannot be
bypassed. This was a real bug caught by integration testing.

## B. Image upload and media storage

`StorageService` speaks the S3 API via `@aws-sdk/client-s3`, so the same code
runs against MinIO, rustfs, and a production bucket.

- **Content, not extension, decides.** `detectImageType` checks magic numbers.
  A declared type that disagrees with the bytes is rejected; the stored
  `ContentType` is always the detected one.
- **Multipart is route-scoped.** Only `POST /listings/:uuid/images` accepts
  it; everything else still returns 415.
- **Keys are random and listing-scoped.** `listings/<uuid>/<random>.<ext>`, so
  a bucket listing cannot enumerate another member's media and a cached URL is
  immutable.
- **Limits:** 8 images per listing, size from `MAX_UPLOAD_SIZE_MB`, types from
  `ALLOWED_IMAGE_TYPES`, plus a per-member hourly rate limit.
- **Ordering** is persisted by the server; a reorder must list every image
  exactly once. Removing an image closes the `sortOrder` gap.
- **Delivery** is same-origin: `GET /api/v1/media/listings/:id/file` streams
  the object. The key is rebuilt from validated path parts, so `..` or an
  encoded slash cannot escape the prefix. No credential ever reaches a client.

`GET /listings/storage-status` lets the UI say plainly that uploads are
unavailable instead of failing on click.

## C. Category-specific creation

`CreateListingFlow` selects a domain first and only shows the categories that
belong to it. Housing, Jobs, and Services post to `/housing`, `/jobs`, and
`/services` with the exact payload their backend DTOs require; only the
general marketplace posts to `/listings`. A test asserts that creating a
housing listing never touches the generic endpoint.

The previously-existing `CreateListing.tsx` screen is untouched.

## D. Search, filtering, sorting, pagination

`GET /listings` returns `{ items, total, limit, offset }` and applies every
filter in PostgreSQL before slicing:

- text search over title, description, and neighborhood
- category, seller, city, neighborhood
- price range, with an inverted range rejected
- status, limited to `PUBLISHED` or `SOLD`
- latitude, longitude, and radius

Sorting covers `newest`, `oldest`, `price_asc`, `price_desc`, and
`relevance`. Every ordering appends `id` as a tiebreaker so offset pagination
is deterministic. Unpriced listings sort last rather than as zero. `limit` is
clamped to 100 server-side.

**Explore now filters on the server.** It previously fetched one page and
filtered it in the browser, which silently returned wrong totals. Price,
category, and radius are query parameters now, and the result count comes from
`total`. Genuinely local-only toggles (delivery, verified) remain client-side,
with a comment saying why.

## E. Location-aware discovery

Radius filtering uses a bounding box, which is an index range scan, and
`withDistance` then computes the exact great-circle distance for the returned
rows. A bounding box alone would include corner results.

Coordinates are **never returned**. `withDistance` strips them and adds
`approximateLocation`, rounded to a tenth of a degree, plus `distanceMiles`
when the caller supplied an origin. Prisma returns `Decimal` columns as
objects, which was a real bug: `hasCoordinates` was always false until the
values were coerced to numbers.

## F. Saved listings and searches

Favorites use the composite primary key and an upsert, so a double tap cannot
create two rows. The saved list shows only listings that are still
`PUBLISHED` or `SOLD`; the save row itself survives an archive, so re-publishing
restores it.

Saved searches are owner-scoped for create, read, **update**, and delete. Edit
and delete are new (`PATCH`/`DELETE /listings/saved-searches/:id`).

Saved-search alerts are **not** implemented. They depend on the notification
milestone; this milestone stores the criteria that a later job will consume.

## G. Buyer and seller interactions

Reused unchanged: messaging and conversations, public seller profiles,
reporting, and blocking. No duplicate service was created. The listing detail
screen's contact path and the profile screen's other-listings tab both read the
new paginated endpoint.

## Database changes

Migration `0008_marketplace_search`, additive only.

- `ListingImage.width` and `.height`, nullable, so existing rows need no
  backfill.
- Discovery indexes: `[status, createdAt, id]`,
  `[status, categoryId, createdAt, id]`, `[latitude, longitude]`,
  `[city, status]`, `[neighborhood, status]`, `[priceCents]`.
- Trigram GIN indexes on title, description, and neighborhood, with
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`. Without these, `contains` with
  `insensitive` is a sequential scan.

Index names and column order match the schema's `@@index` declarations exactly,
so `prisma migrate diff --from-url --to-schema-datamodel` reports
**No difference detected**.

No existing row is read, rewritten, or deleted, and no constraint is tightened.

## Frontend

New: `src/pages/marketplace/MyListings.tsx` (filter, transition, edit, delete)
and `CreateListingFlow.tsx` (domain routing); `src/components/listing/ImageManager.tsx`.

Modified: `Explore.tsx` (server-side filters, pagination, category list from the
API, location permission), `api/client.ts` (paginated search, upload with real
XHR progress, image and saved-search methods), `Navigation.tsx`, `App.tsx`.

`uploadWithProgress` uses `XMLHttpRequest` rather than `fetch`, because only
XHR exposes upload progress and a simulated bar would be a lie. After upload
the gallery is rebuilt from the API, never from a local object URL.

## Verification runs

| Command | Result |
| --- | --- |
| `bash scripts/run-integration-tests.sh` | 8 suites, 99 tests passed |
| `bash scripts/run-storage-tests.sh` | 2 suites, 29 tests passed |
| `backend pnpm test` | 32 suites, 180 tests passed |
| `backend pnpm lint`, `tsc --noEmit`, `pnpm build`, `prisma validate` | pass |
| `pnpm lint`, `pnpm exec tsc --noEmit` (frontend) | pass |
| `pnpm exec vitest run` | 12 files, 95 tests passed |
| `pnpm build` (frontend) | pass |
| Full migration chain on disposable PostgreSQL | 8 migrations applied |
| `prisma migrate diff` migrations vs schema | `No difference detected` |

## Bugs found and fixed by these tests

1. `parseRefreshCookieValue`-style parsing was not at fault, but the storage
   cookie-parser in the object key could emit `_` in a base64url secret.
2. Placeholder text in drafts let an empty draft pass the publish check.
3. An archived listing was hidden from its own owner.
4. Prisma `Decimal` coordinates produced `hasCoordinates: false` and a `null`
   distance.
5. `saveDraft` and `addImage` tests used ids the database had not assigned.
6. Multipart middleware matched a literal `:id` segment rather than a UUID.

## Not done, and why

- **Saved-search alerts.** Requires the notification milestone; the criteria
  are stored and nothing more.
- **Production object storage.** Not configured. `docs/STORAGE.md` records
  the requirement, including the per-object `ACL: public-read` line that must
  be removed if the provider rejects ACLs.
- **MinIO in local storage tests.** This environment's registry mirror cannot
  pull `minio/minio` or `quay.io/minio/minio`. The script defaults to
  `rustfs/rustfs`, which implements the MinIO API and passed every test. The
  GitHub Actions job uses `minio/minio` since the runner can pull it. No
  application code differs between the two.
- **Distance rounding.** Distances are rounded to one decimal place, so two
  listings within a tenth of a mile of each other can report the same value.
- **Cross-origin media.** The media route is same-origin. A separate CDN or
  bucket domain would need its own CORS and cache review.