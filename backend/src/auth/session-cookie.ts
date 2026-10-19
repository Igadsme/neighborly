/**
 * Refresh-cookie attributes and the browser cookie helpers.
 *
 * The refresh credential lives in an HttpOnly cookie so JavaScript can
 * never read it. `SameSite=Lax` allows the top-level GET navigation that
 * a verification link needs while still blocking cross-site POSTs, and
 * `Path` is scoped to the auth routes so the cookie is not attached to
 * ordinary API calls.
 */

export const REFRESH_COOKIE = 'neighborly.refresh'
export const CSRF_COOKIE = 'neighborly.csrf'
export const CSRF_HEADER = 'x-neighborly-csrf'

/** The CSRF cookie is deliberately readable by the frontend. */
export function csrfCookieAttributes() {
  return { httpOnly: false, sameSite: 'lax' as const, secure: secureCookies(), path: '/' }
}

export function refreshCookieAttributes(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: secureCookies(),
    path: '/api/v1/auth',
    maxAge: maxAgeSeconds
  }
}

export function secureCookies(nodeEnv = process.env.NODE_ENV): boolean {
  if (process.env.COOKIE_SECURE === '1') return true
  if (process.env.COOKIE_SECURE === '0') return false
  return nodeEnv === 'production'
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const jar: Record<string, string> = {}
  if (!header) return jar
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 1) continue
    const name = part.slice(0, index).trim()
    if (!name) continue
    try {
      jar[name] = decodeURIComponent(part.slice(index + 1).trim())
    } catch {
      jar[name] = part.slice(index + 1).trim()
    }
  }
  return jar
}