import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { Client } from 'pg'

/**
 * Migration 0012 upgrade-path tests.
 *
 * Milestone 8 added `Review.updatedAt` as `NOT NULL` with no default and no
 * backfill. That succeeds on an empty table and fails outright on any
 * installation that already has reviews — which is every installation created
 * before Milestone 8. Every milestone suite migrated a *fresh* database, so the
 * failure was never observed until Milestone 10 tried to bring a legacy
 * database forward.
 *
 * These tests exercise the upgrade path against real PostgreSQL for the states
 * that matter, and assert that no review is lost and no history is rewritten.
 *
 * Requires a disposable PostgreSQL, supplied through
 * NEIGHBORLY_TEST_DATABASE_URL like the other integration suites. Each case
 * builds its own throwaway database on that server and drops it afterwards.
 */

const DATABASE_URL =
  process.env.NEIGHBORLY_TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? ''

if (!/postgres/.test(DATABASE_URL)) {
  throw new Error(
    'These tests need a real PostgreSQL. Set NEIGHBORLY_TEST_DATABASE_URL to a ' +
      'disposable database, e.g. the one scripts/run-integration-tests.sh starts.'
  )
}

const MIGRATIONS_DIR = `${__dirname}/../../prisma/migrations`
const SCHEMA = 'prisma/schema.prisma'

/** Points the connection string at a specific database on the same server. */
function dbUrl(database: string): string {
  return DATABASE_URL.replace(/\/[^/?]*(\?|$)/, `/${database}$1`)
}

/**
 * Runs a Prisma CLI command against one database.
 *
 * `db execute --stdin` is used rather than `psql` so the tests need no local
 * PostgreSQL client binary, only the Prisma CLI the project already depends on.
 */
function prisma(args: string[], database: string, input?: string): string {
  // `db execute` and `migrate` reject `--url` and `--schema` together, so the
  // target database is chosen through the environment instead. That is also
  // how every other suite in this repository points at a disposable database.
  //
  // `migrate diff --to-schema-datamodel` names its own schema path, so the
  // helper does not add `--schema` when the caller already picked a target.
  const withSchema = args.some(a => a.includes('schema-datamodel') || a.includes('from-migrations'))
  const argv = ['prisma', ...args, ...(withSchema ? [] : [`--schema=${SCHEMA}`])]
  return execFileSync('npx', argv, {
    input,
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: dbUrl(database) },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

/**
 * Executes SQL against one database and returns rows as plain objects.
 *
 * `prisma db execute` deliberately discards result sets, so reads go through
 * the `pg` client the project already depends on. A fresh connection per call
 * keeps the helper stateless and safe against leaking sessions between tests.
 */
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

/** Applies one migration file verbatim, building a pre-0012 schema. */
function applyMigrationFile(database: string, name: string): void {
  const file = `${MIGRATIONS_DIR}/${name}/migration.sql`
  prisma(['db', 'execute', '--file', file], database)
}

function createDatabase(): string {
  const name = `m11_mig_${randomBytes(4).toString('hex')}`
  prisma(['db', 'execute', '--stdin'], 'postgres', `CREATE DATABASE "${name}"`)
  return name
}

function dropDatabase(name: string): void {
  prisma(['db', 'execute', '--stdin'], 'postgres', `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
}

/** One-shot scalar read, for count-style assertions. */
async function countReviews(database: string): Promise<number> {
  const rows = await sql(database, 'SELECT COUNT(*)::int AS total FROM "Review";')
  return Number(rows[0]?.total)
}

/** Runs `migrate` subcommands (deploy/resolve) against one database. */
function migrate(args: string[], database: string): void {
  prisma(['migrate', ...args], database)
}

const THROUGH_0011 = [
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
]

/**
 * Accounts, a listing, a transaction and three reviews written before 0012.
 *
 * Three rows with distinct createdAt values, so the backfill can be shown to
 * preserve each row's own timestamp rather than stamping them all identically.
 */
const LEGACY_REVIEWS = `
INSERT INTO "User" (id,email,"passwordHash",status,"createdAt","updatedAt") VALUES
 ('40000000-0000-4000-8000-000000000001','m11.a@example.com','x','ACTIVE',now(),now()),
 ('40000000-0000-4000-8000-000000000002','m11.b@example.com','x','ACTIVE',now(),now()),
 ('40000000-0000-4000-8000-000000000003','m11.c@example.com','x','ACTIVE',now(),now());
INSERT INTO "Category" (id,name,slug,"createdAt") VALUES
 ('60000000-0000-4000-8000-000000000001','Tools','tools',now());
INSERT INTO "Listing" (id,"categoryId","sellerId",title,description,status,"createdAt","updatedAt") VALUES
 ('50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001','Legacy item','A thing','PUBLISHED',now(),now());
-- Several transactions so every review is a distinct (transaction, author)
-- pair. 0012 adds a unique index on that pair, and a fixture that violated it
-- would fail for a different reason than the one under test.
INSERT INTO "Transaction" (id,status,"createdAt","updatedAt") VALUES
 ('70000000-0000-4000-8000-000000000001','COMPLETED',now(),now()),
 ('70000000-0000-4000-8000-000000000002','COMPLETED',now(),now()),
 ('70000000-0000-4000-8000-000000000003','COMPLETED',now(),now());
INSERT INTO "Review" (id,"transactionId","authorId","subjectId",rating,body,"createdAt") VALUES
 ('80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002',
  5,'First legacy review','2026-01-15 10:30:00'),
 ('80000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003',
  4,'Second legacy review','2026-02-20 14:45:00'),
 ('80000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003',
  3,'Third legacy review','2026-03-25 08:15:00');
`

const readReviews = (db: string) =>
  sql(
    db,
    `SELECT id::text AS id, rating::int AS rating, "authorId"::text AS "authorId",
            "subjectId"::text AS "subjectId", "createdAt"::text AS "createdAt",
            "updatedAt"::text AS "updatedAt", status::text AS status
     FROM "Review" ORDER BY "createdAt";`,
  )

/** Builds a pre-Milestone-8 database: schema at 0011, reviews present, with the
 * migration history marked applied so `migrate deploy` resumes at 0012 exactly
 * as it would on a real legacy installation. */
function buildLegacyDatabase(): string {
  const name = createDatabase()
  for (const m of THROUGH_0011) applyMigrationFile(name, m)
  prisma(['db', 'execute', '--stdin'], name, LEGACY_REVIEWS)
  for (const m of THROUGH_0011) migrate(['resolve', '--applied', m], name)
  return name
}

describe('migration 0012 upgrade path', () => {
  let emptyInstall: string

  beforeAll(() => {
    emptyInstall = createDatabase()
  }, 600_000)

  afterAll(() => {
    if (emptyInstall) dropDatabase(emptyInstall)
  }, 600_000)

  it('applies cleanly to an empty database (fresh install)', () => {
    migrate(['deploy'], emptyInstall)
    return countReviews(emptyInstall).then(total => expect(total).toBe(0))
  }, 600_000)

  describe('a pre-Milestone-8 installation', () => {
    let legacy: string

    beforeAll(() => {
      legacy = buildLegacyDatabase()
    }, 600_000)

    afterAll(() => {
      // The drift check needs a throwaway shadow database.
      if (legacy) {
        dropDatabase(`${legacy}_shadow`)
        dropDatabase(legacy)
      }
    }, 600_000)

    it('deploys 0012 where it previously failed with SQLSTATE 23502', () => {
      expect(() => migrate(['deploy'], legacy)).not.toThrow()
    }, 600_000)

    it('loses no review', async () => {
      expect(await countReviews(legacy)).toBe(3)
    })

    it('preserves each review rating and ownership', async () => {
      const rows = await readReviews(legacy)
      expect(rows.map(r => r.rating).sort()).toEqual([3, 4, 5])
      // Ownership is carried through untouched: the migration never rewrites
      // who wrote a review or who it was about.
      expect(rows.map(r => `${r.authorId}->${r.subjectId}`)).toEqual([
        '40000000-0000-4000-8000-000000000001->40000000-0000-4000-8000-000000000002',
        '40000000-0000-4000-8000-000000000002->40000000-0000-4000-8000-000000000003',
        '40000000-0000-4000-8000-000000000001->40000000-0000-4000-8000-000000000003',
      ])
    })

    it("backfills updatedAt from each row's own createdAt, not the migration time", async () => {
      const rows = await readReviews(legacy)
      expect(rows.length).toBe(3)
      for (const row of rows) {
        // Timestamps are compared as instants, not strings: the column and the
        // backfill source may differ in trailing precision.
        expect(new Date(String(row.updatedAt)).getTime()).toBe(new Date(String(row.createdAt)).getTime())
      }
    })

    it('publishes pre-existing reviews rather than withholding them', async () => {
      const rows = await readReviews(legacy)
      expect(rows.every(r => r.status === 'PUBLISHED')).toBe(true)
    })

    it('leaves no database default on updatedAt', async () => {
      const rows = await sql(
        legacy,
        `SELECT column_default FROM information_schema.columns
         WHERE table_name = 'Review' AND column_name = 'updatedAt' AND column_default IS NOT NULL;`,
      )
      expect(rows).toEqual([])
    })

    it('accepts a review written after the upgrade', async () => {
      prisma(
        ['db', 'execute', '--stdin'],
        legacy,
        `INSERT INTO "Review" (id,"transactionId","authorId","subjectId",rating,body,"createdAt","updatedAt")
         VALUES ('80000000-0000-4000-8000-000000000099','70000000-0000-4000-8000-000000000002',
                 '40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002',
                 5,'Written after the upgrade',now(),now());`,
      )
      expect(await countReviews(legacy)).toBe(4)
    })

    it('introduces no schema drift', () => {
      // The same comparison the release gate runs: the migration history
      // against schema.prisma. "No difference detected" means the repaired
      // migration still describes exactly the intended schema.
      //
      // Prisma replays the migrations into a shadow database, so that database
      // has to exist before the command runs.
      prisma(['db', 'execute', '--stdin'], 'postgres', `CREATE DATABASE "${legacy}_shadow";`)
      const out = prisma(
        [
          'migrate',
          'diff',
          '--from-migrations',
          MIGRATIONS_DIR,
          '--to-schema-datamodel',
          'prisma/schema.prisma',
          `--shadow-database-url=${dbUrl(`${legacy}_shadow`)}`,
        ],
        legacy,
      )
      expect(out).toContain('No difference detected')
    }, 600_000)
  })

  it('recovers from a failed 0012 through the documented resolve step', async () => {
    const legacy = buildLegacyDatabase()
    try {
      // Reproduce the state an operator would be in: Prisma recorded 0012 as
      // started but never finished, so deploy refuses to continue.
      //
      // `checksum` is NOT NULL in Prisma's bookkeeping table, so a real value
      // is read back from an already-recorded row rather than invented.
      const recorded = await sql(
        legacy,
        `SELECT checksum FROM "_prisma_migrations" WHERE migration_name = '0011_neighborly_borrow';`,
      )
      prisma(
        ['db', 'execute', '--stdin'],
        legacy,
        `INSERT INTO "_prisma_migrations"
           (id,checksum,"migration_name","started_at","finished_at","rolled_back_at","logs","applied_steps_count")
         VALUES ('m11-simulated-failure','${recorded[0].checksum}','0012_passport_trust',
                 now(),NULL,NULL,'simulated failure',0);`,
      )

      migrate(['resolve', '--rolled-back', '0012_passport_trust'], legacy)
      migrate(['deploy'], legacy)

      expect(await countReviews(legacy)).toBe(3)
    } finally {
      dropDatabase(legacy)
    }
  }, 600_000)
})
