/**
 * Environment defaults for the integration suite, applied before any test
 * module is imported.
 *
 * `AppModule` calls `ConfigModule.forRoot({ validationSchema })` while the
 * module is being *evaluated*, which happens as soon as a test file imports
 * it. Assigning `process.env` inside a test's `beforeAll` is too late for that:
 * the validation has already run and thrown.
 *
 * This file had been passing locally only because a developer had a
 * `.env` in `backend/`, which `ConfigModule` loads. `.env` is gitignored, so
 * on CI the file was absent and the suite died at import time with
 * `Config validation error: "JWT_SECRET" is required`. That is the worst
 * shape for a test: green on every developer machine, broken on the only
 * machine that matters.
 *
 * Jest `setupFiles` run before the test framework and before any import in a
 * test file, which is the only place early enough to matter.
 *
 * These are test fixtures, not credentials. `JWT_SECRET` only has to satisfy
 * the validator's length and production-strength rules; nothing here is ever
 * used against a real system.
 */
function applyIfUnset(key: string, value: string) {
  if (!process.env[key]) process.env[key] = value
}

applyIfUnset('NODE_ENV', 'test')
applyIfUnset('JWT_SECRET', 'integration-suite-secret-at-least-32-chars-long')
applyIfUnset('CORS_ORIGIN', 'http://localhost:4173')
applyIfUnset('PUBLIC_WEB_ORIGIN', 'http://localhost:4173')
applyIfUnset('COOKIE_SECURE', '0')

/*
 * Background sweeps are disabled for the whole run.
 *
 * Every suite shares one database, so a background poll started by whichever
 * app booted first can claim a DomainEventOutbox row - `claim` moves it to
 * PROCESSING - before the spec that wrote that row drains it. The spec's own
 * `drain` then finds nothing left to do and the notification is not readable
 * yet, which made a cross-milestone test pass alone and fail intermittently
 * in a full run.
 *
 * Pushing the intervals out of reach leaves the explicit drains in the specs
 * as the only consumer, so each test drives its own precondition regardless of
 * the order suites happen to run in.
 */
for (const key of [
  'NOTIFICATION_POLL_MS',
  'SAVED_SEARCH_POLL_MS',
  'BORROW_OVERDUE_POLL_MS',
  'REVIEW_PUBLISH_POLL_MS',
  'MISSION_REMINDER_POLL_MS',
]) {
  applyIfUnset(key, '3600000')
}