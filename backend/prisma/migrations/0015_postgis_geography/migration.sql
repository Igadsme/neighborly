/*
  PostGIS radius search. Additive on a fresh database and on one that
  already has listings.

  - Enables postgis if it is not already enabled.
  - Adds a nullable geography column. Existing rows keep their latitude and
  - longitude; nothing is deleted or rewritten except the new column.
  - Backfills that column from latitude/longitude when both are in range.
  - A BEFORE INSERT/UPDATE trigger keeps the column in sync with later writes
    from Prisma, which never selects or writes the column itself.
  - A GiST index supports ST_DWithin.

  Re-running the statements is safe: extension, column, and index use
  IF NOT EXISTS, and the backfill only fills rows whose geography is still null.
*/

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE OR REPLACE FUNCTION neighborly_sync_location()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.latitude IS NULL OR NEW.longitude IS NULL
     OR NEW.latitude < -90 OR NEW.latitude > 90
     OR NEW.longitude < -180 OR NEW.longitude > 180 THEN
    NEW.geog := NULL;
  ELSE
    NEW.geog := ST_SetSRID(
      ST_MakePoint(NEW.longitude::double precision, NEW.latitude::double precision),
      4326
    )::geography;
  END IF;
  RETURN NEW;
END;
$$;

-- Listing
ALTER TABLE "Listing" ADD COLUMN IF NOT EXISTS "geog" geography(Point,4326);
CREATE INDEX IF NOT EXISTS "Listing_geog_idx" ON "Listing" USING GIST ("geog");
DROP TRIGGER IF EXISTS listing_geog_sync ON "Listing";
CREATE TRIGGER listing_geog_sync
  BEFORE INSERT OR UPDATE OF latitude, longitude ON "Listing"
  FOR EACH ROW EXECUTE FUNCTION neighborly_sync_location();
UPDATE "Listing"
SET "geog" = ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND latitude BETWEEN -90 AND 90
  AND longitude BETWEEN -180 AND 180
  AND "geog" IS NULL;

-- NeedRequest
ALTER TABLE "NeedRequest" ADD COLUMN IF NOT EXISTS "geog" geography(Point,4326);
CREATE INDEX IF NOT EXISTS "NeedRequest_geog_idx" ON "NeedRequest" USING GIST ("geog");
DROP TRIGGER IF EXISTS need_request_geog_sync ON "NeedRequest";
CREATE TRIGGER need_request_geog_sync
  BEFORE INSERT OR UPDATE OF latitude, longitude ON "NeedRequest"
  FOR EACH ROW EXECUTE FUNCTION neighborly_sync_location();
UPDATE "NeedRequest"
SET "geog" = ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND latitude BETWEEN -90 AND 90
  AND longitude BETWEEN -180 AND 180
  AND "geog" IS NULL;

-- HousingListing
ALTER TABLE "HousingListing" ADD COLUMN IF NOT EXISTS "geog" geography(Point,4326);
CREATE INDEX IF NOT EXISTS "HousingListing_geog_idx" ON "HousingListing" USING GIST ("geog");
DROP TRIGGER IF EXISTS housing_listing_geog_sync ON "HousingListing";
CREATE TRIGGER housing_listing_geog_sync
  BEFORE INSERT OR UPDATE OF latitude, longitude ON "HousingListing"
  FOR EACH ROW EXECUTE FUNCTION neighborly_sync_location();
UPDATE "HousingListing"
SET "geog" = ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND latitude BETWEEN -90 AND 90
  AND longitude BETWEEN -180 AND 180
  AND "geog" IS NULL;

-- JobListing
ALTER TABLE "JobListing" ADD COLUMN IF NOT EXISTS "geog" geography(Point,4326);
CREATE INDEX IF NOT EXISTS "JobListing_geog_idx" ON "JobListing" USING GIST ("geog");
DROP TRIGGER IF EXISTS job_listing_geog_sync ON "JobListing";
CREATE TRIGGER job_listing_geog_sync
  BEFORE INSERT OR UPDATE OF latitude, longitude ON "JobListing"
  FOR EACH ROW EXECUTE FUNCTION neighborly_sync_location();
UPDATE "JobListing"
SET "geog" = ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND latitude BETWEEN -90 AND 90
  AND longitude BETWEEN -180 AND 180
  AND "geog" IS NULL;

-- ServiceListing
ALTER TABLE "ServiceListing" ADD COLUMN IF NOT EXISTS "geog" geography(Point,4326);
CREATE INDEX IF NOT EXISTS "ServiceListing_geog_idx" ON "ServiceListing" USING GIST ("geog");
DROP TRIGGER IF EXISTS service_listing_geog_sync ON "ServiceListing";
CREATE TRIGGER service_listing_geog_sync
  BEFORE INSERT OR UPDATE OF latitude, longitude ON "ServiceListing"
  FOR EACH ROW EXECUTE FUNCTION neighborly_sync_location();
UPDATE "ServiceListing"
SET "geog" = ST_SetSRID(ST_MakePoint(longitude::double precision, latitude::double precision), 4326)::geography
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND latitude BETWEEN -90 AND 90
  AND longitude BETWEEN -180 AND 180
  AND "geog" IS NULL;
