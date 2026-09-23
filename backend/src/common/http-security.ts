import type { HelmetOptions } from 'helmet'

export function trustProxyEnabled(value = process.env.TRUST_PROXY) {
  return value === '1'
}

export function corsOrigins(raw = process.env.CORS_ORIGIN): string[] | false {
  if (!raw?.trim()) return false
  const origins = raw.split(',').map(value => value.trim()).filter(Boolean)
  if (origins.length === 0 || origins.includes('*')) return false
  return origins
}

export function helmetOptions(nodeEnv = process.env.NODE_ENV): HelmetOptions {
  const production = nodeEnv === 'production'
  return {
    contentSecurityPolicy: production ? undefined : false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
    hsts: production
  } as HelmetOptions
}

export function swaggerEnabled(nodeEnv = process.env.NODE_ENV) {
  return nodeEnv !== 'production'
}

export const jsonBodyLimit = '256kb'
