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
