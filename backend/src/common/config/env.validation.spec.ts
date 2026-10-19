import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { envValidationSchema } from './env.validation'

const bootEnv = {
  DATABASE_URL: 'postgresql://neighborly:neighborly@localhost:5432/neighborly',
  JWT_SECRET: 'unit-test-jwt-secret-32-characters-min',
  CORS_ORIGIN: 'http://localhost:8443'
}

describe('envValidationSchema', () => {
  it('accepts Postgres, JWT, and CORS without Redis, refresh, or S3', () => {
    const { error, value } = envValidationSchema.validate(bootEnv, { allowUnknown: true })
    expect(error).toBeUndefined()
    expect(value.DATABASE_URL).toBe(bootEnv.DATABASE_URL)
    expect(value.JWT_SECRET).toBe(bootEnv.JWT_SECRET)
    expect(value.CORS_ORIGIN).toBe(bootEnv.CORS_ORIGIN)
    expect(value.PUBLIC_WEB_ORIGIN).toBe('http://localhost:8443')
    expect(value.REDIS_URL).toBeUndefined()
    expect(value.JWT_REFRESH_SECRET).toBeUndefined()
    expect(value.S3_ENDPOINT).toBeUndefined()
  })

  it('rejects a wildcard CORS origin', () => {
    const { error } = envValidationSchema.validate({ ...bootEnv, CORS_ORIGIN: '*' }, { allowUnknown: true })
    expect(error).toBeDefined()
  })

  it('requires Redis, an explicit proxy choice, and a non-placeholder JWT in production', () => {
    const production = {
      ...bootEnv,
      NODE_ENV: 'production',
      CORS_ORIGIN: 'https://app.example.com',
      JWT_SECRET: 'prod-jwt-secret-value-7f3c9a1e2b4d6f80',
      REDIS_URL: 'rediss://cache.example.com:6380',
      TRUST_PROXY: '1'
    }
    expect(envValidationSchema.validate(production, { allowUnknown: true }).error).toBeUndefined()
    expect(envValidationSchema.validate({ ...production, REDIS_URL: '' }, { allowUnknown: true }).error).toBeDefined()
    expect(envValidationSchema.validate({ ...production, TRUST_PROXY: '' }, { allowUnknown: true }).error).toBeDefined()
    expect(
      envValidationSchema.validate(
        { ...production, JWT_SECRET: 'replace-with-a-local-secret-at-least-32-chars' },
        { allowUnknown: true }
      ).error
    ).toBeDefined()
  })

  it('rejects a partial S3 configuration', () => {
    const { error } = envValidationSchema.validate({ ...bootEnv, S3_BUCKET: 'neighborly-media' }, { allowUnknown: true })
    expect(error).toBeDefined()
  })

  it('still accepts Redis and S3 when a client will use them', () => {
    const { error } = envValidationSchema.validate(
      {
        ...bootEnv,
        REDIS_URL: 'redis://localhost:6379',
        JWT_REFRESH_SECRET: 'unit-test-refresh-secret-32-characters',
        S3_ENDPOINT: 'http://localhost:9000',
        S3_BUCKET: 'neighborly-media',
        S3_ACCESS_KEY: 'neighborly',
        S3_SECRET_KEY: 'neighborly-secret'
      },
      { allowUnknown: true }
    )
    expect(error).toBeUndefined()
  })
})

describe('local env template', () => {
  const template = readFileSync(resolve(__dirname, '../../../../env.example'), 'utf8')
  const apiTemplate = readFileSync(resolve(__dirname, '../../../.env.example'), 'utf8')

  it('points PUBLIC_WEB_ORIGIN at the Vite dev origin and drops stale claims', () => {
    expect(template).toContain('PUBLIC_WEB_ORIGIN=http://localhost:8443')
    expect(template).not.toMatch(/refresh tokens are not issued/i)
    expect(template).not.toMatch(/no upload route is mounted/i)
    expect(template).toMatch(/production must set PUBLIC_WEB_ORIGIN or verification links point at the wrong host/i)
    expect(apiTemplate).toContain('PUBLIC_WEB_ORIGIN=http://localhost:8443')
    expect(apiTemplate).toMatch(/production must set PUBLIC_WEB_ORIGIN or verification links point at the wrong host/i)
  })
})

describe('background worker intervals', () => {
  const base = {
    NODE_ENV: 'test',
    CORS_ORIGIN: 'http://localhost:4173',
    JWT_SECRET: 'x'.repeat(40),
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/neighborly_test'
  }

  it('accepts the overdue sweep interval', () => {
    expect(
      envValidationSchema.validate({ ...base, BORROW_OVERDUE_POLL_MS: '300000' }, { allowUnknown: true }).error
    ).toBeUndefined()
  })

  it('rejects a non-numeric or non-positive interval rather than silently disabling the sweep', () => {
    // An unvalidated value becomes NaN, and Number.isFinite(NaN) is false, so
    // the interval would never be scheduled and the overdue sweep would simply
    // never run. Failing at boot is the intended outcome.
    for (const bad of ['soon', '0', '-1', '']) {
      expect(
        envValidationSchema.validate({ ...base, BORROW_OVERDUE_POLL_MS: bad }, { allowUnknown: true }).error
      ).toBeDefined()
    }
  })
})

describe('production cookie and transport safety', () => {
  const production = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@db.internal:5432/neighborly?schema=public',
    REDIS_URL: 'rediss://cache.internal:6380',
    JWT_SECRET: '7f3c9a1e2b4d6f80a1b2c3d4e5f60718293a4b5c6d7e8f9',
    JWT_REFRESH_SECRET: '9e8d7c6b5a4938271605f4e3d2c1b0a99887766554433221100ffeeddccbbaa',
    CORS_ORIGIN: 'https://app.example.com',
    TRUST_PROXY: '1',
    COOKIE_SECURE: '1'
  }
  const validate = (env: Record<string, unknown>) =>
    envValidationSchema.validate(env, { allowUnknown: true }).error

  it('accepts a correctly configured production environment', () => {
    expect(validate(production)).toBeUndefined()
  })

  it('refuses COOKIE_SECURE=0 in production', () => {
    // The session and refresh cookies are the credentials. A non-Secure cookie
    // is sent over plain HTTP, so production must not be able to opt out.
    expect(validate({ ...production, COOKIE_SECURE: '0' })).toBeDefined()
  })

  it('refuses the console email sender in production', () => {
    expect(validate({ ...production, EMAIL_SENDER: 'console' })).toBeDefined()
  })

  it('refuses a wildcard CORS origin', () => {
    expect(validate({ ...production, CORS_ORIGIN: '*' })).toBeDefined()
  })

  it('still allows COOKIE_SECURE=0 outside production, for local HTTP', () => {
    expect(
      validate({
        ...production,
        NODE_ENV: 'development',
        COOKIE_SECURE: '0',
        TRUST_PROXY: '0',
        CORS_ORIGIN: 'http://localhost:4173',
        REDIS_URL: 'redis://localhost:6379'
      })
    ).toBeUndefined()
  })
})
