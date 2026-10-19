import { BadRequestException } from '@nestjs/common'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { assertGeoQuery, MAX_RADIUS_MILES } from './geo-search'

describe('assertGeoQuery', () => {
  it('rejects latitude and longitude outside the valid range', () => {
    expect(() => assertGeoQuery({ latitude: 91, longitude: 0, radiusMiles: 5 })).toThrow(BadRequestException)
    expect(() => assertGeoQuery({ latitude: -91, longitude: 0, radiusMiles: 5 })).toThrow(BadRequestException)
    expect(() => assertGeoQuery({ latitude: 0, longitude: 181, radiusMiles: 5 })).toThrow(BadRequestException)
    expect(() => assertGeoQuery({ latitude: 0, longitude: -181, radiusMiles: 5 })).toThrow(BadRequestException)
    expect(() => assertGeoQuery({ latitude: Number.NaN, longitude: 0, radiusMiles: 5 })).toThrow(BadRequestException)
  })

  it('rejects a radius above the cap and a radius without coordinates', () => {
    expect(() => assertGeoQuery({ latitude: 33.75, longitude: -84.35, radiusMiles: MAX_RADIUS_MILES + 1 })).toThrow(BadRequestException)
    expect(() => assertGeoQuery({ latitude: 33.75, longitude: -84.35, radiusMiles: 0 })).toThrow(BadRequestException)
    expect(() => assertGeoQuery({ radiusMiles: 5 })).toThrow(BadRequestException)
  })

  it('returns the origin only when latitude, longitude, and radius are all in range', () => {
    expect(assertGeoQuery({ latitude: 33.75 })).toBeNull()
    expect(assertGeoQuery({})).toBeNull()
    expect(assertGeoQuery({ latitude: 33.75, longitude: -84.35, radiusMiles: 5 })).toEqual({
      latitude: 33.75,
      longitude: -84.35,
      radiusMiles: 5
    })
    expect(assertGeoQuery({ latitude: -90, longitude: 180, radiusMiles: MAX_RADIUS_MILES })).toEqual({
      latitude: -90,
      longitude: 180,
      radiusMiles: MAX_RADIUS_MILES
    })
  })
})

describe('PostGIS migration 0015', () => {
  const sql = readFileSync(join(__dirname, '../../prisma/migrations/0015_postgis_geography/migration.sql'), 'utf8')

  it('enables PostGIS, adds a GiST index, and backfills without dropping coordinates', () => {
    expect(sql).toContain('CREATE EXTENSION IF NOT EXISTS postgis')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "geog" geography(Point,4326)')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "Listing_geog_idx" ON "Listing" USING GIST ("geog")')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "NeedRequest_geog_idx" ON "NeedRequest" USING GIST ("geog")')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "HousingListing_geog_idx" ON "HousingListing" USING GIST ("geog")')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "JobListing_geog_idx" ON "JobListing" USING GIST ("geog")')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "ServiceListing_geog_idx" ON "ServiceListing" USING GIST ("geog")')
    expect(sql).toContain('ST_MakePoint')
    expect(sql).not.toMatch(/DROP COLUMN\s+"?latitude"?/i)
    expect(sql).not.toMatch(/DELETE FROM/i)
  })
})
