import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Single-use token helpers.
 *
 * Tokens are 256 bits from the platform CSPRNG and are only ever
 * persisted as a SHA-256 digest, so read access to the database does not
 * yield usable credentials. SHA-256 (not bcrypt/argon2) is deliberate:
 * these are high-entropy random values, so there is nothing to brute
 * force and verification must stay fast enough for every request.
 */

const TOKEN_BYTES = 32

export function randomToken(bytes = TOKEN_BYTES): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Constant-time comparison of two hex digests of equal length. */
export function sameTokenHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length || left.length === 0) return false
  return timingSafeEqual(left, right)
}

export interface IssuedToken {
  /** Plaintext token. Returned to the user exactly once, never stored. */
  token: string
  tokenHash: string
}

export function issueToken(): IssuedToken {
  const token = randomToken()
  return { token, tokenHash: hashToken(token) }
}

/** A refresh cookie carries its session id so lookup is a primary-key read. */
export function refreshCookieValue(sessionId: string): string {
  const secret = randomToken()
  return `${sessionId}.${secret}`
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseRefreshCookieValue(value: string): { sessionId: string; token: string } | null {
  const separator = value.indexOf('.')
  if (separator <= 0) return null
  const sessionId = value.slice(0, separator)
  // The secret is base64url, so it may contain `-` and `_`. Only the
  // session id ahead of the dot is constrained to a UUID.
  const token = value.slice(separator + 1)
  if (!UUID_PATTERN.test(sessionId) || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) return null
  return { sessionId, token }
}