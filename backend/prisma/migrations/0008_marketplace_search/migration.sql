/*
  Milestone 4 marketplace discovery. Additive only: indexes and one new
  column. No existing row is read, rewritten, or deleted, and no
  constraint is tightened, so this is safe on a populated database.

  Adds:
  - ListingImage.width/height, filled in by later uploads. Nullable, so
    existing image rows need no backfill and a missing value simply means
    the client falls back to its default aspect ratio.
  - Trigram indexes on the searched text columns. `contains` with an
    `insensitive` mode is a sequential scan without these, so discovery
    gets slower as the table grows.
  - A composite index matching the default newest-first listing query.
  - Coordinate indexes so a radius bounding box is an index range scan
    rather than a full scan.

  Rollback: `DROP INDEX` each name below and
  `ALTER TABLE "ListingImage" DROP COLUMN "width", "height"`.
  Dropping the indexes only affects performance, so a rollback is safe at
  any time. Dropping the columns discards image dimensions.
*/

-- AlterTable: image dimensions recorded at upload time.
ALTER TABLE "ListingImage" ADD COLUMN "width" INTEGER, ADD COLUMN "height" INTEGER;

-- CreateIndex (default list: status + recency, with the category variant).
-- Names and column order match the schema's @@index declarations exactly so
-- `prisma migrate diff` reports no drift.
CREATE INDEX "Listing_status_createdAt_id_idx" ON "Listing"("status", "createdAt", "id");
-- The schema already declares @@index([status, categoryId, createdAt]), so
-- this adds a descending variant matching the newest-first page query.
CREATE INDEX "Listing_status_categoryId_createdAt_id_idx" ON "Listing"("status", "categoryId", "createdAt", "id");

-- CreateIndex (radius discovery: bounding box range scan)
CREATE INDEX "Listing_latitude_longitude_idx" ON "Listing"("latitude", "longitude");

-- CreateIndex (city and neighborhood filtering)
CREATE INDEX "Listing_city_status_idx" ON "Listing"("city", "status");
CREATE INDEX "Listing_neighborhood_status_idx" ON "Listing"("neighborhood", "status");

-- CreateIndex (price sorting and price filtering)
CREATE INDEX "Listing_priceCents_idx" ON "Listing"("priceCents");

-- Substring search over title and description needs trigram support.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Listing_title_idx" ON "Listing" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "Listing_description_idx" ON "Listing" USING GIN ("description" gin_trgm_ops);
CREATE INDEX "Listing_neighborhood_idx" ON "Listing" USING GIN ("neighborhood" gin_trgm_ops);