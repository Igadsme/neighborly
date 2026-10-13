import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Jest globalSetup for the real-PostgreSQL integration suite.
 *
 * The integration specs share one database and build their fixtures from
 * fixed UUIDs, so a second run against the same database inherits every row
 * the first run left behind. Assertions that are correct on a clean database
 * then fail for reasons that have nothing to do with the code under test: a
 * notification count sees last run's notification, a uniqueness constraint
 * fires on a row that already exists, and a concurrency test finds two
 * exchanges where it expected one.
 *
 * CI hides this because every job starts from a fresh container. Anyone
 * running the suite locally twice sees failures that look like real
 * regressions. Truncating application tables before the run makes a rerun
 * behave like the first run, which is the property the suite should have had.
 *
 * Only application data is deleted. The schema, and the `_prisma_migrations`
 * ledger in particular, are left untouched, so a run still exercises the
 * migrated database rather than quietly recreating it.
 */

/**
 * Refuses to run against anything but a disposable verification database.
 * `scripts/run-integration-tests.sh` creates `neighborly_m2` in a throwaway
 * container; `integration-db.ts` applies the same rule. This is the last
 * check before a TRUNCATE, so it is deliberately the strictest: a host or
 * database name that looks like production or staging aborts the run.
 */
function assertDisposable(url: string) {
  const database = url.split('?')[0].split('/').filter(Boolean).pop() ?? ''
  const looksReal = /prod|staging|replica|primary|neighborly$/i.test(url)
  const ok = database !== '' && /test|audit|legacy|migrate|m1[01]|m2/i.test(database) && !looksReal
  if (!ok) {
    throw new Error(
      'Refusing to truncate: the integration suite only resets a disposable ' +
        `verification database. Got "${database}" from ${url}`
    )
  }
}

/**
 * Tables a migration populates with reference data. Migration 0013 inserts
 * the badge catalogue, and the missions specs assert against it ("publishes
 * the badge catalogue with an explanation for each"). These rows are owned by
 * the schema history, not by a test fixture: deleting them makes the suite
 * fail in a way that looks like a product defect but is really the reset
 * destroying data it does not own. They are preserved for the same reason
 * `_prisma_migrations` is preserved.
 */
const MIGRATION_SEEDED_TABLES = new Set(['CommunityBadge'])

/** Every application table, excluding the Prisma migration ledger. */
function applicationTables(): string[] {
  // The connection string is read from the same place the specs read it, so
  // the reset and the tests can never disagree about which database is in use.
  const url = process.env.NEIGHBORLY_TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
  const sql = `
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'
    ORDER BY table_name;`

  const out = execFileSync(
    'docker',
    ['exec', '-i', containerName(), 'psql', '-U', 'postgres', '-d', databaseName(url), '-t', '-A', '-c', sql],
    { encoding: 'utf8' }
  )
  return out
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(table => !MIGRATION_SEEDED_TABLES.has(table))
}

function databaseName(url: string): string {
  return url.split('?')[0].split('/').filter(Boolean).pop() ?? ''
}

function containerName(): string {
  // The disposable container the runner script creates. Overridable so a
  // developer pointing at their own container can still run the suite.
  return process.env.NEIGHBORLY_TEST_CONTAINER ?? 'neighborly-m2-test'
}

/**
 * The reset is database-wide, so it is worth asserting that the suite the
 * developer is about to run is the one that was counted here. A filter that
 * silently matched nothing would make the reset look applied while leaving
 * fixtures untouched.
 */
function specs(): string[] {
  const root = join(__dirname, '..', '..')
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (entry.endsWith('.integration.spec.ts')) found.push(full)
    }
  }
  walk(root)
  return found
}

/**
 * Background sweeps are disabled for the run.
 *
 * Every suite shares one database. A background poll started by whichever app
 * booted first can claim a DomainEventOutbox row - `claim` moves it to
 * PROCESSING - before the spec that wrote that row gets to drain it. The
 * spec's own `drain` then finds nothing left to do, and the notification is
 * not readable yet, so the case fails even though nothing is wrong with the
 * product. The observed symptom was a cross-milestone test that passed on its
 * own and failed intermittently in a full run.
 *
 * Pushing the intervals out of reach for the whole run leaves the explicit
 * drains in the specs as the only consumer, so each test drives its own
 * precondition regardless of the order suites happen to run in. `??=` keeps a
 * deliberate value if one is already set.
 */
function disableBackgroundSweeps() {
  for (const key of [
    'NOTIFICATION_POLL_MS',
    'SAVED_SEARCH_POLL_MS',
    'BORROW_OVERDUE_POLL_MS',
    'REVIEW_PUBLISH_POLL_MS',
    'MISSION_REMINDER_POLL_MS',
  ]) {
    process.env[key] ??= '3600000'
  }
}

export default async function globalSetup() {
  const url = process.env.NEIGHBORLY_TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
  if (!url) return
  assertDisposable(url)
  disableBackgroundSweeps()

  const all = specs()
  if (all.length === 0) {
    throw new Error('Refusing to reset: no integration specs matched, so the discovery is broken')
  }

  const tables = applicationTables()
  if (tables.length === 0) {
    throw new Error(
      'Refusing to proceed: no tables found. The database is probably unmigrated; ' +
        'run the suite through scripts/run-integration-tests.sh'
    )
  }

  // TRUNCATE ... CASCADE in one statement so foreign keys cannot block it and
  // so a partial reset cannot leave a half-cleared database behind.
  const list = tables.map(t => `"public"."${t}"`).join(', ')
  execFileSync(
    'docker',
    ['exec', '-i', containerName(), 'psql', '-U', 'postgres', '-d', databaseName(url), '-c', `TRUNCATE ${list} CASCADE;`],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  )

  process.stdout.write(
    `Integration reset: cleared ${tables.length} tables in ${databaseName(url)} for ${all.length} spec files\n`
  )
}