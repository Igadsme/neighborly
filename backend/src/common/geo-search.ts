import { BadRequestException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

/** Shared cap for every radius search. Matches the listing query DTO. */
export const MAX_RADIUS_MILES = 500

const METERS_PER_MILE = 1609.344

export type GeoQuery = {
  latitude?: number
  longitude?: number
  radiusMiles?: number
}

export type RadiusOrigin = {
  latitude: number
  longitude: number
  radiusMiles: number
}

const TABLES = {
  Listing: Prisma.raw('FROM "Listing" AS row INNER JOIN "User" AS owner ON owner.id = row."sellerId"'),
  HousingListing: Prisma.raw('FROM "HousingListing" AS row INNER JOIN "User" AS owner ON owner.id = row."ownerId"'),
  JobListing: Prisma.raw('FROM "JobListing" AS row INNER JOIN "User" AS owner ON owner.id = row."ownerId"'),
  ServiceListing: Prisma.raw('FROM "ServiceListing" AS row INNER JOIN "User" AS owner ON owner.id = row."ownerId"'),
  NeedRequest: Prisma.raw('FROM "NeedRequest" AS row INNER JOIN "User" AS owner ON owner.id = row."requesterId"')
} as const

export type RadiusTable = keyof typeof TABLES

export type RadiusPage = {
  ids: string[]
  distances: Map<string, number>
  total: number
}

/**
 * Rejects coordinates outside the valid range and a radius outside 1..MAX.
 * Returns the origin only when latitude, longitude, and radius are all set,
 * which is what turns the request into an ST_DWithin filter.
 */
export function assertGeoQuery(input: GeoQuery): RadiusOrigin | null {
  const { latitude, longitude, radiusMiles } = input
  if (latitude !== undefined) assertRange('Latitude', latitude, -90, 90)
  if (longitude !== undefined) assertRange('Longitude', longitude, -180, 180)
  if (radiusMiles !== undefined) {
    if (typeof radiusMiles !== 'number' || !Number.isInteger(radiusMiles) || radiusMiles < 1 || radiusMiles > MAX_RADIUS_MILES) {
      throw new BadRequestException(`Radius must be an integer from 1 to ${MAX_RADIUS_MILES} miles`)
    }
  }
  if (radiusMiles !== undefined && (latitude === undefined || longitude === undefined)) {
    throw new BadRequestException('Latitude and longitude are required when radiusMiles is set')
  }
  if (latitude === undefined || longitude === undefined || radiusMiles === undefined) return null
  return { latitude, longitude, radiusMiles }
}

function assertRange(label: string, value: number, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new BadRequestException(`${label} must be between ${min} and ${max}`)
  }
}

/** Case-insensitive substring match. `%`, `_`, and `\` in the term stay literal. */
export function ilikeContains(column: string, value: string): Prisma.Sql {
  const escaped = value.replace(/[\\%_]/g, char => `\\${char}`)
  return Prisma.sql`${Prisma.raw(column)} ILIKE ${`%${escaped}%`} ESCAPE '\\'`
}

export function orderByIds<T extends { id: string }>(rows: T[], ids: string[]): T[] {
  const byId = new Map(rows.map(row => [row.id, row]))
  return ids.flatMap(id => {
    const row = byId.get(id)
    return row ? [row] : []
  })
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

/**
 * Published, non-deleted rows whose owner is ACTIVE, inside the radius,
 * ordered by distance. Drafts, paused rows, archived rows, and suspended
 * sellers are excluded by the WHERE clause, not by a later filter.
 * COUNT(*) OVER() is the full match count. A page past the last row has
 * no row to carry that count, so its total is 0.
 */
export async function pageWithinRadius(
  prisma: PrismaService,
  table: RadiusTable,
  origin: RadiusOrigin,
  extra: Prisma.Sql,
  limit: number,
  offset: number
): Promise<RadiusPage> {
  const from = TABLES[table]
  const meters = origin.radiusMiles * METERS_PER_MILE
  const where = Prisma.sql`
    row."deletedAt" IS NULL
    AND owner.status = 'ACTIVE'
    AND owner."deletedAt" IS NULL
    AND row.geog IS NOT NULL
    AND ST_DWithin(
      row.geog,
      ST_SetSRID(ST_MakePoint(CAST(${origin.longitude} AS double precision), CAST(${origin.latitude} AS double precision)), 4326)::geography,
      ${meters}
    )
    AND ${extra}
  `
  const rows = await prisma.$queryRaw<Array<{ id: string; distance_miles: number | string; total: number | string }>>(Prisma.sql`
    SELECT row.id::text AS id,
           (ST_Distance(
             row.geog,
             ST_SetSRID(ST_MakePoint(CAST(${origin.longitude} AS double precision), CAST(${origin.latitude} AS double precision)), 4326)::geography
           ) / ${METERS_PER_MILE}) AS distance_miles,
           (COUNT(*) OVER())::int AS total
    ${from}
    WHERE ${where}
    ORDER BY distance_miles ASC, row.id ASC
    LIMIT ${limit} OFFSET ${offset}
  `)
  const distances = new Map<string, number>()
  const ids: string[] = []
  for (const row of rows) {
    ids.push(row.id)
    const miles = Number(row.distance_miles)
    distances.set(row.id, Number.isFinite(miles) ? round1(miles) : 0)
  }
  return { ids, distances, total: Number(rows[0]?.total ?? 0) }
}
