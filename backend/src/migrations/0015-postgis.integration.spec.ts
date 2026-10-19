import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { Client } from 'pg'

/**
 * Migration 0015 on a real PostGIS server.
 *
 * A fresh database and a database that already has listings (migrations
 * 0001–0014 applied, then rows inserted) both have to end with the extension,
 * the GiST indexes, and a geography value backfilled from latitude/longitude.
 */

const DATABASE_URL = process.env.NEIGHBORLY_TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? ''

if (!/postgres/.test(DATABASE_URL)) {
  throw new Error('These tests need a real PostgreSQL. Set NEIGHBORLY_TEST_DATABASE_URL.')
}

const MIGRATIONS_DIR = `${__dirname}/../../prisma/migrations`
const SCHEMA = 'prisma/schema.prisma'

const THROUGH_0014 = [
  '0001_init',
  '0002_onboarding',
  '0003_verticals',
  '0004_trust_safety',
  '0005_query_indexes',
  '0006_transaction_offer_unique',
  '0007_auth_accounts',
  '0008_marketplace_search',
  '0009_requests_matching',
  '0010_notifications',
  '0011_neighborly_borrow',
  '0012_passport_trust',
  '0013_neighborhood_missions',
  '0014_completion_confirmation'
]

function dbUrl(database: string): string {
  return DATABASE_URL.replace(/\/[^/?]*(\?|$)/, `/${database}$1`)
}

function prisma(args: string[], database: string, input?: string): string {
  const withSchema = args.some(arg => arg.includes('schema-datamodel') || arg.includes('from-migrations'))
  const argv = ['prisma', ...args, ...(withSchema ? [] : [`--schema=${SCHEMA}`])]
  return execFileSync('npx', argv, {
    input,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: dbUrl(database) },
    stdio: ['pipe', 'pipe', 'pipe']
  })
}

async function sql(database: string, statement: string): Promise<Record<string, unknown>[]> {
  const client = new Client({ connectionString: dbUrl(database) })
  await client.connect()
  try {
    const result = await client.query(statement)
    return result.rows as Record<string, unknown>[]
  } finally {
    await client.end()
  }
}

function applyMigrationFile(database: string, name: string): void {
  prisma(['db', 'execute', '--file', `${MIGRATIONS_DIR}/${name}/migration.sql`], database)
}

function createDatabase(): string {
  const name = `m2_geo_${randomBytes(4).toString('hex')}`
  prisma(['db', 'execute', '--stdin'], 'postgres', `CREATE DATABASE "${name}"`)
  return name
}

function dropDatabase(name: string): void {
  prisma(['db', 'execute', '--stdin'], 'postgres', `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
}

function migrate(args: string[], database: string): void {
  prisma(['migrate', ...args], database)
}

const LEGACY_ROWS = `
INSERT INTO "User" (id, email, "passwordHash", status, "createdAt", "updatedAt") VALUES
 ('a1000000-0000-4000-8000-000000000001','geo.legacy@example.com','x','ACTIVE',now(),now());
INSERT INTO "Category" (id, name, slug, "createdAt") VALUES
 ('b1000000-0000-4000-8000-000000000001','Geo','geo-legacy',now());
INSERT INTO "Listing" (id, "categoryId", "sellerId", title, description, status, latitude, longitude, "createdAt", "updatedAt") VALUES
 ('c1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001','Legacy chair','Has coordinates','PUBLISHED',33.75,-84.35,now(),now());
INSERT INTO "HousingListing" (id, "ownerId", title, description, "propertyType", "listingType", "priceCents", beds, baths, latitude, longitude, "createdAt", "updatedAt") VALUES
 ('d1000000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001',
  'Legacy flat','Already on the map','Apartment','rent',180000,2,1,33.76,-84.36,now(),now());
`

describe('migration 0015 PostGIS geography', () => {
  const created: string[] = []

  afterAll(() => {
    for (const name of created) dropDatabase(name)
  }, 600_000)

  it('enables PostGIS and the GiST indexes on a fresh database', async () => {
    const name = createDatabase()
    created.push(name)
    migrate(['deploy'], name)
    const extension = await sql(name, `SELECT extname FROM pg_extension WHERE extname = 'postgis'`)
    expect(extension).toHaveLength(1)
    const indexes = await sql(name, `
      SELECT indexname FROM pg_indexes
      WHERE indexname IN (
        'Listing_geog_idx','NeedRequest_geog_idx','HousingListing_geog_idx','JobListing_geog_idx','ServiceListing_geog_idx'
      )
      ORDER BY indexname
    `)
    expect(indexes.map(row => row.indexname)).toEqual([
      'HousingListing_geog_idx',
      'JobListing_geog_idx',
      'Listing_geog_idx',
      'NeedRequest_geog_idx',
      'ServiceListing_geog_idx'
    ])
    await sql(name, `
      INSERT INTO "User" (id, email, "passwordHash", status, "createdAt", "updatedAt") VALUES
       ('a2000000-0000-4000-8000-000000000001','geo.fresh@example.com','x','ACTIVE',now(),now());
      INSERT INTO "Category" (id, name, slug, "createdAt") VALUES
       ('b2000000-0000-4000-8000-000000000001','Fresh','geo-fresh',now());
      INSERT INTO "Listing" (id, "categoryId", "sellerId", title, description, status, latitude, longitude, "createdAt", "updatedAt") VALUES
       ('c2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',
        'a2000000-0000-4000-8000-000000000001','Triggered chair','Filled by the trigger','PUBLISHED',33.75,-84.35,now(),now());
    `)
    const filled = await sql(name, `SELECT (geog IS NOT NULL) AS filled FROM "Listing" WHERE id = 'c2000000-0000-4000-8000-000000000001'`)
    expect(filled[0]?.filled).toBe(true)

    const inserted = await sql(name, `
      SELECT ST_X(geog::geometry) AS x, ST_Y(geog::geometry) AS y
      FROM "Listing" WHERE id = 'c2000000-0000-4000-8000-000000000001'
    `)
    expect(Number(inserted[0]?.x)).toBeCloseTo(-84.35, 4)
    expect(Number(inserted[0]?.y)).toBeCloseTo(33.75, 4)

    await sql(name, `
      UPDATE "Listing"
      SET latitude = 40.71, longitude = -74.00
      WHERE id = 'c2000000-0000-4000-8000-000000000001'
    `)
    const moved = await sql(name, `
      SELECT ST_X(geog::geometry) AS x, ST_Y(geog::geometry) AS y
      FROM "Listing" WHERE id = 'c2000000-0000-4000-8000-000000000001'
    `)
    expect(Number(moved[0]?.x)).toBeCloseTo(-74, 4)
    expect(Number(moved[0]?.y)).toBeCloseTo(40.71, 4)

    await sql(name, `
      UPDATE "Listing" SET latitude = NULL
      WHERE id = 'c2000000-0000-4000-8000-000000000001'
    `)
    const cleared = await sql(name, `
      SELECT (geog IS NULL) AS cleared FROM "Listing" WHERE id = 'c2000000-0000-4000-8000-000000000001'
    `)
    expect(cleared[0]?.cleared).toBe(true)

    await sql(name, `
      UPDATE "Listing" SET latitude = 33.75, longitude = 181
      WHERE id = 'c2000000-0000-4000-8000-000000000001'
    `)
    const invalid = await sql(name, `
      SELECT (geog IS NULL) AS cleared FROM "Listing" WHERE id = 'c2000000-0000-4000-8000-000000000001'
    `)
    expect(invalid[0]?.cleared).toBe(true)
  }, 600_000)

  it('backfills geography for listings that existed before the column', async () => {
    const name = createDatabase()
    created.push(name)
    for (const migration of THROUGH_0014) applyMigrationFile(name, migration)
    prisma(['db', 'execute', '--stdin'], name, LEGACY_ROWS)
    for (const migration of THROUGH_0014) migrate(['resolve', '--applied', migration], name)
    migrate(['deploy'], name)

    const listing = await sql(name, `SELECT (geog IS NOT NULL) AS filled, latitude IS NOT NULL AS kept FROM "Listing"`)
    expect(listing[0]).toMatchObject({ filled: true, kept: true })
    const housing = await sql(name, `SELECT (geog IS NOT NULL) AS filled FROM "HousingListing"`)
    expect(housing[0]?.filled).toBe(true)
    const index = await sql(name, `SELECT indexdef FROM pg_indexes WHERE indexname = 'Listing_geog_idx'`)
    expect(String(index[0]?.indexdef)).toContain('USING gist')
  }, 600_000)
})
