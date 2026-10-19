import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { integrationDatabaseUrl } from './integration-db'

describe('integrationDatabaseUrl', () => {
  const original = process.env.NEIGHBORLY_TEST_DATABASE_URL

  afterEach(() => {
    if (original === undefined) delete process.env.NEIGHBORLY_TEST_DATABASE_URL
    else process.env.NEIGHBORLY_TEST_DATABASE_URL = original
  })

  it('accepts a loopback PostgreSQL URL', () => {
    process.env.NEIGHBORLY_TEST_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:55432/neighborly_m2'
    expect(integrationDatabaseUrl()).toBe('postgresql://postgres:postgres@127.0.0.1:55432/neighborly_m2')
  })

  it('fails loudly when the variable is unset', () => {
    delete process.env.NEIGHBORLY_TEST_DATABASE_URL
    expect(() => integrationDatabaseUrl()).toThrow(/NEIGHBORLY_TEST_DATABASE_URL is not set/)
  })

  it('leaves the PostGIS spatial_ref_sys table out of the integration reset', () => {
    const source = readFileSync(join(__dirname, 'integration-global-setup.ts'), 'utf8')
    expect(source).toContain("table_name <> 'spatial_ref_sys'")
    expect(source).toContain('deptype')
  })

  it.each([
    'postgresql://user:pw@db.example.com:5432/neighborly',
    'postgresql://user:pw@10.0.0.5:5432/neighborly',
    'postgresql://neighborly:neighborly@localhost:5432/neighborly'
      .replace('localhost', 'staging-postgres')
  ])('refuses the non-loopback host in %s', url => {
    process.env.NEIGHBORLY_TEST_DATABASE_URL = url
    expect(() => integrationDatabaseUrl()).toThrow(/Refusing to run integration tests against non-loopback database host/)
  })
})