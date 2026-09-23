import { HttpException, HttpStatus } from '@nestjs/common'

type Bucket = { count: number; resetAt: number }

const memory = new Map<string, Bucket>()
let redisClient: { incr: (key: string) => Promise<number>; pexpire: (key: string, ms: number) => Promise<number> } | null | undefined

export const rateLimitPolicies = {
  authRegister: { env: 'RATE_LIMIT_AUTH_REGISTER', limit: 5, windowMs: 15 * 60 * 1000 },
  authLogin: { env: 'RATE_LIMIT_AUTH_LOGIN', limit: 10, windowMs: 15 * 60 * 1000 },
  messaging: { env: 'RATE_LIMIT_MESSAGING', limit: 30, windowMs: 60 * 1000 },
  listings: { env: 'RATE_LIMIT_LISTINGS', limit: 20, windowMs: 60 * 60 * 1000 },
  offers: { env: 'RATE_LIMIT_OFFERS', limit: 30, windowMs: 60 * 60 * 1000 },
  reports: { env: 'RATE_LIMIT_REPORTS', limit: 10, windowMs: 60 * 60 * 1000 }
} as const

export type RateLimitScope = keyof typeof rateLimitPolicies

export function resetRateLimitsForTests() {
  memory.clear()
}

export function rateLimitsEnabled() {
  return process.env.NODE_ENV !== 'test' || process.env.RATE_LIMIT_ENFORCE === '1'
}

function configuredLimit(envName: string, fallback: number) {
  const raw = process.env[envName]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function clientAddress(request: { headers?: Record<string, string | string[] | undefined>; ip?: string }) {
  const forwarded = request.headers?.['x-forwarded-for']
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded
  const ip = first?.split(',')[0]?.trim()
  return ip || request.ip || 'unknown'
}

export async function enforceRateLimit(scope: RateLimitScope, id: string) {
  if (!rateLimitsEnabled()) return
  const policy = rateLimitPolicies[scope]
  const max = configuredLimit(policy.env, policy.limit)
  const count = await hit(`${scope}:${id}`, policy.windowMs)
  if (count > max) throw new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS)
}

async function hit(key: string, windowMs: number) {
  const client = await getRedis()
  if (client) {
    try {
      const count = await client.incr(key)
      if (count === 1) await client.pexpire(key, windowMs)
      return count
    } catch {
      // A Redis outage falls back to the in-process window so limits stay on.
    }
  }
  const now = Date.now()
  const current = memory.get(key)
  if (!current || current.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowMs })
    return 1
  }
  current.count += 1
  return current.count
}

async function getRedis() {
  const url = process.env.REDIS_URL?.trim()
  if (!url) return null
  if (redisClient !== undefined) return redisClient
  try {
    const { default: Redis } = await import('ioredis')
    const client = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true })
    await client.connect()
    redisClient = client
    return client
  } catch {
    redisClient = null
    return null
  }
}
