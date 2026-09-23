import { HttpException } from '@nestjs/common'
import { enforceRateLimit, resetRateLimitsForTests } from './rate-limit'

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

  it('does not count when enforcement is off', async () => {
    delete process.env.RATE_LIMIT_ENFORCE
    await enforceRateLimit('authLogin', '203.0.113.8')
    await enforceRateLimit('authLogin', '203.0.113.8')
    await expect(enforceRateLimit('authLogin', '203.0.113.8')).resolves.toBeUndefined()
  })
})
