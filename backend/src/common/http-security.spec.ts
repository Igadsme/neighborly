import { corsOrigins, helmetOptions, swaggerEnabled, trustProxyEnabled } from './http-security'

describe('http security', () => {
  it('parses a comma-separated origin list and rejects a wildcard', () => {
    expect(corsOrigins('http://localhost:8443, https://app.example.com')).toEqual([
      'http://localhost:8443',
      'https://app.example.com'
    ])
    expect(corsOrigins('*')).toBe(false)
    expect(corsOrigins('')).toBe(false)
  })

  it('turns swagger and a relaxed CSP off in production', () => {
    expect(swaggerEnabled('production')).toBe(false)
    expect(swaggerEnabled('development')).toBe(true)
    expect(helmetOptions('production').contentSecurityPolicy).toBeUndefined()
    expect(helmetOptions('development').contentSecurityPolicy).toBe(false)
    expect(helmetOptions('production').hsts).toBe(true)
  })

  it('trusts forwarded addresses only when TRUST_PROXY=1', () => {
    expect(trustProxyEnabled('1')).toBe(true)
    expect(trustProxyEnabled('0')).toBe(false)
    expect(trustProxyEnabled(undefined)).toBe(false)
  })
})
