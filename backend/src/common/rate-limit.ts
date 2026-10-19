import { HttpException, HttpStatus } from '@nestjs/common'
import { currentRequestId, writeLog } from './logger'
import { trustProxyEnabled } from './http-security'

type Bucket = { count: number; resetAt: number }
type RateLimitRedis = {
  incr: (key: string) => Promise<number>
  pexpire: (key: string, ms: number) => Promise<number>
  pttl?: (key: string) => Promise<number>
}

const memory = new Map<string, Bucket>()
let redisClient: RateLimitRedis | null | undefined
let loggedRedisFallback = false

export const rateLimitPolicies = {
  authRegister: { env: 'RATE_LIMIT_AUTH_REGISTER', limit: 5, windowMs: 15 * 60 * 1000 },
  authLogin: { env: 'RATE_LIMIT_AUTH_LOGIN', limit: 10, windowMs: 15 * 60 * 1000 },
  // Credential-adjacent routes. Recovery is throttled by client address
  // and by recipient, verification by user, so one caller cannot probe an
  // address list or mail-bomb a target.
  authVerify: { env: 'RATE_LIMIT_AUTH_VERIFY', limit: 20, windowMs: 15 * 60 * 1000 },
  authResend: { env: 'RATE_LIMIT_AUTH_RESEND', limit: 3, windowMs: 15 * 60 * 1000 },
  authForgotPassword: { env: 'RATE_LIMIT_AUTH_FORGOT_PASSWORD', limit: 5, windowMs: 15 * 60 * 1000 },
  authResetPassword: { env: 'RATE_LIMIT_AUTH_RESET_PASSWORD', limit: 10, windowMs: 15 * 60 * 1000 },
  messaging: { env: 'RATE_LIMIT_MESSAGING', limit: 30, windowMs: 60 * 1000 },
  listings: { env: 'RATE_LIMIT_LISTINGS', limit: 20, windowMs: 60 * 60 * 1000 },
  listingImages: { env: 'RATE_LIMIT_LISTING_IMAGES', limit: 30, windowMs: 60 * 60 * 1000 },
  offers: { env: 'RATE_LIMIT_OFFERS', limit: 30, windowMs: 60 * 60 * 1000 },
  requests: { env: 'RATE_LIMIT_REQUESTS', limit: 20, windowMs: 60 * 60 * 1000 },
  reviews: { env: 'RATE_LIMIT_REVIEWS', limit: 30, windowMs: 60 * 60 * 1000 },
  missions: { env: 'RATE_LIMIT_MISSIONS', limit: 20, windowMs: 60 * 60 * 1000 },
  reports: { env: 'RATE_LIMIT_REPORTS', limit: 10, windowMs: 60 * 60 * 1000 },
  housing: { env: 'RATE_LIMIT_HOUSING', limit: 20, windowMs: 60 * 60 * 1000 },
  jobs: { env: 'RATE_LIMIT_JOBS', limit: 20, windowMs: 60 * 60 * 1000 },
  services: { env: 'RATE_LIMIT_SERVICES', limit: 20, windowMs: 60 * 60 * 1000 },
  // Reactions, comments, and RSVPs share this bucket with new posts, so the
  // window is a minute rather than an hour.
  community: { env: 'RATE_LIMIT_COMMUNITY', limit: 60, windowMs: 60 * 1000 },
  transactions: { env: 'RATE_LIMIT_TRANSACTIONS', limit: 30, windowMs: 60 * 60 * 1000 },
  profile: { env: 'RATE_LIMIT_PROFILE', limit: 20, windowMs: 60 * 60 * 1000 },
  accountEmail: { env: 'RATE_LIMIT_ACCOUNT_EMAIL', limit: 5, windowMs: 15 * 60 * 1000 }
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
  const hitResult = await hit(`${scope}:${id}`, policy.windowMs)
  if (hitResult.count > max) throw tooManyRequests(hitResult.retryAfterSeconds)
}

/** Seconds still left in the window. RFC 9110 Retry-After accepts a delta. */
function tooManyRequests(retryAfterSeconds: number) {
  const retryAfter = Math.max(1, Math.ceil(retryAfterSeconds))
  return new HttpException(
    { statusCode: HttpStatus.TOO_MANY_REQUESTS, message: 'Too many requests', retryAfter },
    HttpStatus.TOO_MANY_REQUESTS
  )
}

async function hit(key: string, windowMs: number) {
  const client = await getRedis()
  if (client) {
    try {
      const count = await client.incr(key)
      if (count === 1) await client.pexpire(key, windowMs)
      let ttlMs = windowMs
      if (typeof client.pttl === 'function') {
        const ttl = await client.pttl(key)
        if (typeof ttl === 'number' && ttl > 0) ttlMs = ttl
      }
      return { count, retryAfterSeconds: ttlMs / 1000 }
    } catch {
      // A Redis outage falls back to the in-process window so limits stay on.
      noteRedisFallback()
    }
  }
  const now = Date.now()
  const current = memory.get(key)
  if (!current || current.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowMs })
    return { count: 1, retryAfterSeconds: windowMs / 1000 }
  }
  current.count += 1
  return { count: current.count, retryAfterSeconds: (current.resetAt - now) / 1000 }
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
