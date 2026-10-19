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
