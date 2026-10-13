import { INestApplication } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import {
  ConsoleEmailSender,
  EMAIL_SENDER,
  EmailSender,
  OutboxEmailSender,
} from './auth/email-sender'

/**
 * Application-level startup test.
 *
 * Milestone 10 found that `ListingsModule` and `NotificationsModule` referenced
 * `AuthGuard` in their controllers without importing `AuthModule`, so the real
 * application failed to start with `UnknownDependenciesException`. Every
 * existing suite passed: they each build an isolated TestingModule for one
 * feature, and a feature module can resolve its own guards in isolation while
 * still being unable to resolve them inside the full graph.
 *
 * This suite boots the actual AppModule, which is the only kind of test that
 * can catch that class of defect. It is the regression guard for the wiring,
 * not for feature behaviour.
 */

describe('application startup', () => {
  let app: INestApplication

  beforeAll(async () => {
    // The app validates its environment on creation. These values are test
    // fixtures, not credentials, and no connection is opened by booting.
    process.env.NODE_ENV = 'test'
    process.env.JWT_SECRET = 'm11-startup-test-secret-that-is-long-enough-32'
    process.env.CORS_ORIGIN = 'http://localhost:4173'
    // `.env` in this repository points at the long-lived development database,
    // which has not been migrated past 0011 and therefore has no
    // NeighborhoodMission table. `??=` would silently keep that value, so the
    // disposable test database is set unconditionally when one is supplied.
    process.env.DATABASE_URL = process.env.NEIGHBORLY_TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
    // The NotificationDispatcher starts a background poll as soon as the app
    // boots. On a database with no seed data its first sweep can be in flight
    // while a request is served, which makes request-level assertions flaky for
    // reasons that have nothing to do with wiring. This suite is about startup
    // and module resolution, so the poll interval is pushed out of the way.
    process.env.NOTIFICATION_POLL_MS ??= '3600000'
    process.env.SAVED_SEARCH_POLL_MS ??= '3600000'
    process.env.BORROW_OVERDUE_POLL_MS ??= '3600000'
    process.env.REVIEW_PUBLISH_POLL_MS ??= '3600000'
    process.env.MISSION_REMINDER_POLL_MS ??= '3600000'

    // NestFactory rather than Test.createTestingModule: the point of this suite is
// to boot the application the way main.ts does, so a defect that only appears
// in the real composition root cannot hide behind a testing module.
const moduleRef = await NestFactory.create(AppModule, { logger: ['error', 'warn'] })
    app = moduleRef
    app.setGlobalPrefix('api/v1')
    await app.init()
  }, 60_000)

  afterAll(async () => {
    // Exercises the shutdown path: background timers are cleared and the
    // Prisma pool is closed, which is what happens on a real deploy restart.
    if (app) await app.close()
  }, 30_000)

  it('resolves dependency injection for the whole module graph', () => {
    expect(app).toBeDefined()
  })

  it('routes requests across every feature area', async () => {
    /*
     * Probing the mounted routes is more meaningful than reading Nest's
     * internal router stack, which is an implementation detail whose shape
     * changes between adapters. A request that reaches a controller proves the
     * module registered, the guards resolved and the global prefix applied.
     *
     * These are all unauthenticated or rejected-with-401 paths, chosen so the
     * assertion is "the route exists and is protected", not "the data is
     * correct". A 404 or 500 would mean the module did not mount.
     */
    await app.listen(0)
    const url = await app.getUrl()

    const probes: Array<[string, number[]]> = [
      ['/api/v1/health', [200]],
      ['/api/v1/listings', [200]],
      ['/api/v1/categories', [200]],
      ['/api/v1/missions', [200]],
      // The borrow marketplace is browsable without a session, like listings.
      ['/api/v1/borrow/items', [200]],
      // Personal areas must be protected: reaching a controller without a
      // session has to be refused, never served.
      ['/api/v1/notifications', [401]],
      ['/api/v1/passport/me', [401]],
    ]

    for (const [path, expected] of probes) {
      const response = await fetch(`${url}${path}`)
      if (!expected.includes(response.status)) {
        const body = await response.text()
        throw new Error(`${path} returned ${response.status}, expected ${expected.join('|')}. Body: ${body.slice(0, 300)}`)
      }
    }
  })

  /*
   * Regression guard for a P1 defect found in the final 12-milestone audit.
   *
   * AuthModule bound EMAIL_SENDER with a factory that returned the sender
   * *class* rather than an instance. Nest injects a factory's return value
   * verbatim, so every consumer received a constructor: `sender.send` was
   * undefined and any code path that sent an email threw a TypeError.
   *
   * The blast radius was the whole product, not one feature: registration,
   * email verification, and password reset all send mail, so a brand-new
   * member could not create an account at all. Both adapter settings were
   * affected — `console` and the default `outbox`.
   *
   * Nothing caught it because the auth suites override the token with
   * `useValue: new OutboxEmailSender(prisma)`, an actual instance, and a unit
   * test cannot tell an injected constructor from an injected instance unless
   * it asserts on the resolved value. This suite resolves the token from the
   * real module graph, which is the only place the wiring is visible.
   */
  it('injects a usable email sender instance, not a class', async () => {
    const sender = await app.get<EmailSender>(EMAIL_SENDER, { strict: false })

    expect(sender).toBeDefined()
    // A constructor has no `send` on its own prototype-less object; this
    // assertion is what the broken wiring failed.
    expect(typeof sender.send).toBe('function')
    expect(sender).not.toBe(OutboxEmailSender)
    expect(sender).not.toBe(ConsoleEmailSender)
    // Constructors are functions, so also rule out being handed a bare class.
    expect(typeof sender).toBe('object')
  })

  it('completes registration end-to-end through the real module graph', async () => {
    // The strongest possible check: the endpoint a new member hits first.
    // Before the fix this returned 500 with "this.email.send is not a
    // function", because registration sends a verification email.
    const url = await app.getUrl()
    const response = await fetch(`${url}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `startup-guard-${Date.now()}@example.com`,
        // Satisfies the password policy: length, lower, upper and a digit.
        password: 'StartupGuardPassw0rd',
        firstName: 'Startup',
        lastName: 'Guard',
      }),
    })
    const body = await response.text()

    expect(response.status).toBe(201)
    expect(body).toContain('accessToken')
    expect(body).not.toContain('this.email.send is not a function')
  })

  it('serves the health endpoint', async () => {
    // Already listening from the previous case, so this asserts the response
    // rather than re-testing the plumbing.
    const url = await app.getUrl()
    const response = await fetch(`${url}/api/v1/health`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as { status?: string }
    expect(body.status).toBe('ok')
  })

  it('closes without throwing', async () => {
    const closing = app.close()
    await expect(closing).resolves.toBeUndefined()
    // Guard against a second close in afterAll throwing.
    app = undefined as unknown as INestApplication
  })
})