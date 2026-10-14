/**
 * Database URL for integration tests. Integration specs require a
 * real, disposable PostgreSQL instance (see scripts/run-integration-tests.sh).
 *
 * Safety: the helper refuses any URL whose host is not loopback, so
 * integration tests can never run against a production or shared host.
 */
export function integrationDatabaseUrl(): string {
  const url = process.env.NEIGHBORLY_TEST_DATABASE_URL
  if (!url) {
    throw new Error(
      'NEIGHBORLY_TEST_DATABASE_URL is not set. Run backend integration tests through scripts/run-integration-tests.sh, which starts a disposable local PostgreSQL container.'
    )
  }
  const parsed = new URL(url)
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(parsed.hostname)) {
    throw new Error(
      `Refusing to run integration tests against non-loopback database host: ${parsed.hostname}`
    )
  }
  return url
}
