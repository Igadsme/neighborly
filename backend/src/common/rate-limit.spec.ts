import { Controller, HttpException, INestApplication, Post } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { applyRetryAfterHeader, LoggingExceptionFilter } from './logging.filter'
import { clientAddress, enforceRateLimit, resetRateLimitsForTests, setRateLimitClientForTests } from './rate-limit'

describe('enforceRateLimit', () => {
  const previousEnforce = process.env.RATE_LIMIT_ENFORCE
  const previousLogin = process.env.RATE_LIMIT_AUTH_LOGIN

  beforeEach(() => {
    resetRateLimitsForTests()
    process.env.RATE_LIMIT_ENFORCE = '1'
    process.env.RATE_LIMIT_AUTH_LOGIN = '2'
  })

  afterAll(() => {
    resetRateLimitsForTests()
    if (previousEnforce === undefined) delete process.env.RATE_LIMIT_ENFORCE
    else process.env.RATE_LIMIT_ENFORCE = previousEnforce
    if (previousLogin === undefined) delete process.env.RATE_LIMIT_AUTH_LOGIN
    else process.env.RATE_LIMIT_AUTH_LOGIN = previousLogin
  })

  it('allows traffic inside the window and returns 429 after the cap', async () => {
    await enforceRateLimit('authLogin', '203.0.113.8')
    await enforceRateLimit('authLogin', '203.0.113.8')
    await expect(enforceRateLimit('authLogin', '203.0.113.8')).rejects.toBeInstanceOf(HttpException)
    await expect(enforceRateLimit('authLogin', '203.0.113.8')).rejects.toMatchObject({ status: 429, message: 'Too many requests' })
    await expect(enforceRateLimit('authLogin', '203.0.113.9')).resolves.toBeUndefined()
  })

  it('uses the in-process window when Redis throws', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    setRateLimitClientForTests({
      incr: async () => {
        throw new Error('connection reset')
      },
      pexpire: async () => 0
    })
    await enforceRateLimit('authLogin', '203.0.113.8')
    await enforceRateLimit('authLogin', '203.0.113.8')
    await expect(enforceRateLimit('authLogin', '203.0.113.8')).rejects.toMatchObject({ status: 429 })
    expect(warn.mock.calls.some(call => String(call[0]).includes('rate_limit.redis_fallback'))).toBe(true)
    warn.mockRestore()
  })

  it('ignores X-Forwarded-For unless TRUST_PROXY=1', () => {
    const previous = process.env.TRUST_PROXY
    delete process.env.TRUST_PROXY
    expect(clientAddress({ headers: { 'x-forwarded-for': '203.0.113.9' }, ip: '127.0.0.1' })).toBe('127.0.0.1')
    process.env.TRUST_PROXY = '1'
    expect(clientAddress({ headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }, ip: '127.0.0.1' })).toBe('203.0.113.9')
    if (previous === undefined) delete process.env.TRUST_PROXY
    else process.env.TRUST_PROXY = previous
  })

  it('does not count when enforcement is off', async () => {
    delete process.env.RATE_LIMIT_ENFORCE
    await enforceRateLimit('authLogin', '203.0.113.8')
    await enforceRateLimit('authLogin', '203.0.113.8')
    await expect(enforceRateLimit('authLogin', '203.0.113.8')).resolves.toBeUndefined()
  })

  it('puts Retry-After on a 429 for the remaining window', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-19T00:00:00.000Z') })
    try {
      await enforceRateLimit('authLogin', '203.0.113.50')
      await enforceRateLimit('authLogin', '203.0.113.50')
      jest.setSystemTime(new Date('2026-10-19T00:05:00.000Z'))
      let caught: unknown
      try {
        await enforceRateLimit('authLogin', '203.0.113.50')
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(HttpException)
      const exception = caught as HttpException
      expect(exception.getStatus()).toBe(429)
      expect(exception.message).toBe('Too many requests')
      expect(exception.getResponse()).toMatchObject({ message: 'Too many requests', retryAfter: 600 })

      const response = { setHeader: jest.fn() }
      applyRetryAfterHeader(exception, response)
      expect(response.setHeader).toHaveBeenCalledWith('Retry-After', '600')
    } finally {
      jest.useRealTimers()
    }
  })
})

@Controller('probe')
class ProbeController {
  @Post()
  async hit() {
    await enforceRateLimit('authLogin', 'probe-user')
    return { ok: true }
  }
}

describe('Retry-After on the HTTP response', () => {
  let app: INestApplication
  let baseUrl = ''
  const previousEnforce = process.env.RATE_LIMIT_ENFORCE
  const previousLogin = process.env.RATE_LIMIT_AUTH_LOGIN

  beforeAll(async () => {
    process.env.RATE_LIMIT_ENFORCE = '1'
    process.env.RATE_LIMIT_AUTH_LOGIN = '1'
    const moduleRef = await Test.createTestingModule({ controllers: [ProbeController] }).compile()
    app = moduleRef.createNestApplication({ forceCloseConnections: true })
    app.setGlobalPrefix('api/v1')
    app.useGlobalFilters(new LoggingExceptionFilter(app.get(HttpAdapterHost).httpAdapter))
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    if (!address || typeof address === 'string') throw new Error('HTTP server is not listening')
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await app.close()
    resetRateLimitsForTests()
    if (previousEnforce === undefined) delete process.env.RATE_LIMIT_ENFORCE
    else process.env.RATE_LIMIT_ENFORCE = previousEnforce
    if (previousLogin === undefined) delete process.env.RATE_LIMIT_AUTH_LOGIN
    else process.env.RATE_LIMIT_AUTH_LOGIN = previousLogin
  })

  beforeEach(() => resetRateLimitsForTests())

  it('sends Retry-After when the login policy is exceeded', async () => {
    const init = { method: 'POST' }
    const first = await fetch(`${baseUrl}/api/v1/probe`, init)
    const second = await fetch(`${baseUrl}/api/v1/probe`, init)
    expect(first.status).toBe(201)
    expect(second.status).toBe(429)
    const retryAfter = second.headers.get('retry-after')
    expect(retryAfter).toMatch(/^[1-9]\d*$/)
    const body = (await second.json()) as { message: string; retryAfter: number }
    expect(body.message).toBe('Too many requests')
    expect(String(body.retryAfter)).toBe(retryAfter)
  })
})
