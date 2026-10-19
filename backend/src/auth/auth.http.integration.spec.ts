import { ValidationPipe } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { randomUUID } from 'node:crypto'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { CsrfGuard } from './csrf.guard'
import { OutboxEmailSender } from './email-sender'
import { EMAIL_SENDER } from './email-sender'
import { CSRF_COOKIE, CSRF_HEADER, REFRESH_COOKIE } from './session-cookie'
import { PrismaService } from '../prisma/prisma.service'
import { createTestPrisma } from '../common/testing/integration-fixtures'

const ORIGIN = 'https://app.example.test'
const PASSWORD = 'CorrectHorse42x'

/**
 * Cookie and CSRF behaviour has to be proven over real HTTP: header and
 * cookie handling only exists in the adapter, so a service-level test
 * would not exercise any of it.
 */
describe('Auth HTTP cookie and CSRF contract', () => {
  let prisma: PrismaService
  let baseUrl: string
  let close: () => Promise<void>

  beforeAll(async () => {
    process.env.JWT_SECRET = 'integration-jwt-secret-at-least-32-chars'
    process.env.CORS_ORIGIN = ORIGIN
    process.env.NODE_ENV = 'test'
    prisma = createTestPrisma()
    await prisma.$connect()

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [AuthController],
      providers: [AuthService, CsrfGuard, OutboxEmailSender, { provide: EMAIL_SENDER, useValue: new OutboxEmailSender(prisma) }, { provide: PrismaService, useValue: prisma }]
    }).compile()

    const app = moduleRef.createNestApplication({ forceCloseConnections: true })
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    if (!address || typeof address === 'string') throw new Error('not listening')
    baseUrl = `http://127.0.0.1:${address.port}`
    close = () => app.close()
  })

  afterAll(async () => {
    await close?.()
    await prisma.$disconnect()
  })

  interface CallOptions {
    method?: string
    body?: unknown
    origin?: string | null
    cookie?: string
    csrf?: string
    userAgent?: string
  }

  async function call(path: string, options: CallOptions = {}) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const { origin = ORIGIN, cookie, csrf } = options
    if (origin) headers.Origin = origin
    if (cookie) headers.Cookie = cookie
    if (csrf) headers[CSRF_HEADER] = csrf
    if (options.userAgent) headers['User-Agent'] = options.userAgent
    const response = await fetch(`${baseUrl}/api/v1${path}`, {
      method: options.method ?? 'POST',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    })
    return { response, setCookie: response.headers.getSetCookie(), status: response.status }
  }

  function cookieValue(setCookie: string[], name: string) {
    const entry = setCookie.find(value => value.startsWith(`${name}=`))
    return entry ? entry.split(';')[0] : undefined
  }

  function setCookieAttributes(setCookie: string[], name: string) {
    return setCookie.find(value => value.startsWith(`${name}=`)) ?? ''
  }

  async function register(prefix: string) {
    const email = `${prefix}-${randomUUID()}@example.com`
    const result = await call('/auth/register', {
      body: { email, password: PASSWORD, firstName: 'Http', lastName: 'User' },
      userAgent: 'integration-browser'
    })
    expect(result.status).toBe(201)
    return {
      email,
      refreshCookie: cookieValue(result.setCookie, REFRESH_COOKIE)!,
      csrfCookie: cookieValue(result.setCookie, CSRF_COOKIE)!,
      csrfValue: decodeURIComponent(cookieValue(result.setCookie, CSRF_COOKIE)!.split('=')[1]),
      accessToken: (await result.response.json()).accessToken as string,
      setCookie: result.setCookie
    }
  }

  it('sets a hardened refresh cookie and a readable CSRF cookie on login', async () => {
    const user = await register('cookie')
    const login = await call('/auth/login', { body: { email: user.email, password: PASSWORD } })
    expect(login.status).toBe(200)

    const refresh = setCookieAttributes(login.setCookie, REFRESH_COOKIE)
    expect(refresh).toMatch(/HttpOnly/i)
    expect(refresh).toMatch(/SameSite=Lax/i)
    expect(refresh).toMatch(/Path=\/api\/v1\/auth/i)
    expect(refresh).toMatch(/Max-Age=/i)

    const csrf = setCookieAttributes(login.setCookie, CSRF_COOKIE)
    // Readable by the frontend on purpose; the refresh cookie is not.
    expect(csrf).not.toMatch(/HttpOnly/i)
    expect(csrf).toMatch(/SameSite=Lax/i)
    expect(login.setCookie.join(' ')).not.toContain(user.accessToken)
  })

  it('rotates the cookie on refresh and never returns the refresh token in the body', async () => {
    const user = await register('rotate-http')
    const jar = `${user.refreshCookie}; ${user.csrfCookie}`
    const refreshed = await call('/auth/refresh', { cookie: jar, csrf: user.csrfValue })
    expect(refreshed.status).toBe(200)

    const body = await refreshed.response.text()
    expect(body).not.toContain('refreshToken')
    expect(body).not.toContain(user.refreshCookie.split('=')[1])
    expect(cookieValue(refreshed.setCookie, REFRESH_COOKIE)).not.toBe(user.refreshCookie)

    // The pre-rotation cookie is dead.
    const replay = await call('/auth/refresh', { cookie: jar, csrf: user.csrfValue })
    expect(replay.status).toBe(401)
  })

  it('refuses a cookie-authenticated mutation without a CSRF header', async () => {
    const user = await register('csrf-missing')
    const jar = `${user.refreshCookie}; ${user.csrfCookie}`
    const result = await call('/auth/refresh', { cookie: jar })
    expect(result.status).toBe(403)
  })

  it('refuses a CSRF header that does not match the cookie', async () => {
    const user = await register('csrf-mismatch')
    const jar = `${user.refreshCookie}; ${user.csrfCookie}`
    const result = await call('/auth/refresh', { cookie: jar, csrf: 'forged-token-that-is-long-enough-to-pass-length' })
    expect(result.status).toBe(403)
  })

  it('refuses a request from an unlisted origin', async () => {
    const user = await register('csrf-origin')
    const jar = `${user.refreshCookie}; ${user.csrfCookie}`
    const result = await call('/auth/refresh', { cookie: jar, csrf: user.csrfValue, origin: 'https://evil.example' })
    expect(result.status).toBe(403)
  })

  it('clears both cookies on logout and revokes only that session', async () => {
    const user = await register('logout-http')
    const second = await call('/auth/login', { body: { email: user.email, password: PASSWORD } })
    const secondCookie = cookieValue(second.setCookie, REFRESH_COOKIE)!
    const secondCsrf = decodeURIComponent(cookieValue(second.setCookie, CSRF_COOKIE)!.split('=')[1])

    const jar = `${user.refreshCookie}; ${user.csrfCookie}`
    const out = await call('/auth/logout', { cookie: jar, csrf: user.csrfValue })
    expect(out.status).toBe(204)
    expect(out.setCookie.join(' ')).toContain(`${REFRESH_COOKIE}=;`)

    // The other device stays signed in.
    const stillAlive = await call('/auth/refresh', { cookie: `${secondCookie}; ${CSRF_COOKIE}=${secondCsrf}`, csrf: secondCsrf })
    expect(stillAlive.status).toBe(200)
  })

  it('rejects an unknown refresh cookie without leaking a reason', async () => {
    const result = await call('/auth/refresh', {
      cookie: `${REFRESH_COOKIE}=${randomUUID()}.${'a'.repeat(43)}; ${CSRF_COOKIE}=${'b'.repeat(43)}`,
      csrf: 'b'.repeat(43)
    })
    expect(result.status).toBe(401)
  })

  it('validates the password strength rule server side', async () => {
    const weak = await call('/auth/register', {
      body: { email: `weak-${randomUUID()}@example.com`, password: 'short', firstName: 'A', lastName: 'B' }
    })
    expect(weak.status).toBe(400)

    const noClasses = await call('/auth/register', {
      body: { email: `weak2-${randomUUID()}@example.com`, password: 'alllowercaseletters', firstName: 'A', lastName: 'B' }
    })
    expect(noClasses.status).toBe(400)
  })

  it('rejects unknown fields instead of mass-assigning them', async () => {
    const result = await call('/auth/register', {
      body: {
        email: `mass-${randomUUID()}@example.com`,
        password: PASSWORD,
        firstName: 'A',
        lastName: 'B',
        emailVerifiedAt: new Date().toISOString(),
        passwordHash: 'injected'
      }
    })
    expect(result.status).toBe(400)
  })

  it('returns a 409 for a duplicate registration without echoing the hash', async () => {
    const user = await register('dup-http')
    const again = await call('/auth/register', {
      body: { email: user.email, password: PASSWORD, firstName: 'A', lastName: 'B' }
    })
    expect(again.status).toBe(409)
    expect(await again.response.text()).not.toContain('argon2')
  })

  it('keeps the forgot-password response identical for known and unknown addresses', async () => {
    const user = await register('forgot-http')
    const known = await call('/auth/forgot-password', { body: { email: user.email } })
    const unknown = await call('/auth/forgot-password', { body: { email: `ghost-${randomUUID()}@example.com` } })
    expect(known.status).toBe(202)
    expect(unknown.status).toBe(202)
    expect(await known.response.text()).toBe(await unknown.response.text())
  })
})