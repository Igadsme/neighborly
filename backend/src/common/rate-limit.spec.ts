import { HttpException } from '@nestjs/common'
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
})
