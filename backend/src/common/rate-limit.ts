import { HttpException, HttpStatus } from '@nestjs/common'
import { currentRequestId, writeLog } from './logger'
import { trustProxyEnabled } from './http-security'

type Bucket = { count: number; resetAt: number }
type RateLimitRedis = { incr: (key: string) => Promise<number>; pexpire: (key: string, ms: number) => Promise<number> }

const memory = new Map<string, Bucket>()
let redisClient: RateLimitRedis | null | undefined
let loggedRedisFallback = false

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
  redisClient = undefined
  loggedRedisFallback = false
}

export function setRateLimitClientForTests(client: RateLimitRedis | null) {
  redisClient = client
  loggedRedisFallback = false
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
  if (trustProxyEnabled()) {
    const forwarded = request.headers?.['x-forwarded-for']
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded
    const ip = first?.split(',')[0]?.trim()
    if (ip) return ip
  }
  return request.ip || 'unknown'
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
      noteRedisFallback()
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

function noteRedisFallback() {
  if (loggedRedisFallback) return
  loggedRedisFallback = true
  writeLog('warn', 'rate_limit.redis_fallback', { requestId: currentRequestId() })
}

async function getRedis() {
  if (redisClient !== undefined) return redisClient
  const url = process.env.REDIS_URL?.trim()
  if (!url) return null
  try {
    const { default: Redis } = await import('ioredis')
    const client = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true })
    await client.connect()
    redisClient = client
    return client
  } catch {
    noteRedisFallback()
    redisClient = null
    return null
  }
}
