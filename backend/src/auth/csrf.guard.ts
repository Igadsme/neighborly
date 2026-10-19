import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import type { Request, Response } from 'express'
import { corsOrigins } from '../common/http-security'
import { CSRF_COOKIE, CSRF_HEADER, csrfCookieAttributes, parseCookies } from './session-cookie'
import { randomToken, sameTokenHash } from './token-crypto'

/**
 * CSRF and origin protection for cookie-authenticated mutations.
 *
 * Two independent checks, both required:
 *
 * 1. Origin/Referer must appear in the configured CORS allow-list, so a
 *    cross-site form post from an unrelated host is rejected outright.
 * 2. Double-submit token: the `neighborly.csrf` cookie value must be
 *    echoed in the `X-Neighborly-CSRF` header. A cross-site attacker can
 *    force the cookie to be sent but cannot read it to set the header.
 *
 * Applied only to routes that authenticate from the refresh cookie.
 * Routes guarded by the bearer access token are not cookie-authenticated
 * and are therefore not forgeable, so they do not need this guard.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const response = context.switchToHttp().getResponse<Response>()
    this.ensureCsrfCookie(request, response)
    if (!originAllowed(request)) throw new ForbiddenException('Cross-origin request refused')
    const cookieToken = parseCookies(request.headers.cookie)[CSRF_COOKIE]
    const headerToken = request.headers[CSRF_HEADER]
    const presented = Array.isArray(headerToken) ? headerToken[0] : headerToken
    if (!cookieToken || typeof presented !== 'string' || !presented) {
      throw new ForbiddenException('Missing CSRF token')
    }
    if (!sameTokenHash(presented, cookieToken)) throw new ForbiddenException('Invalid CSRF token')
    return true
  }

  private ensureCsrfCookie(request: Request, response: Response) {
    const existing = parseCookies(request.headers.cookie)[CSRF_COOKIE]
    if (existing && existing.length >= 32) return
    response.cookie(CSRF_COOKIE, newCsrfToken(), csrfCookieAttributes())
  }
}

/**
 * Not a security boundary on its own: the value only binds a cookie to the
 * header that echoes it, and the cookie is readable by the frontend. It
 * uses the platform CSPRNG so a guess is not feasible either way.
 */
export function newCsrfToken() {
  return randomToken(32)
}

/** True when this response already carries the CSRF cookie. */
export function hasSetCookie(response: Response, name: string) {
  const existing = response.getHeader('Set-Cookie')
  const values = Array.isArray(existing) ? existing : typeof existing === 'string' ? [existing] : []
  return values.some(value => value.startsWith(`${name}=`))
}

/**
 * An absent Origin header is treated as a same-origin non-browser client
 * (curl, server-to-server, integration tests). Browsers always send
 * Origin on cross-origin requests and on same-origin POSTs in modern
 * browsers, so this does not weaken the browser case.
 */
export function originAllowed(request: Request): boolean {
  const origin = headerValue(request.headers.origin)
  const referer = headerValue(request.headers.referer)
  const candidate = origin ?? (referer ? safeOrigin(referer) : undefined)
  if (!candidate) return !originHeaderPresent(request)
  const allowed = corsOrigins()
  if (!allowed) return false
  return allowed.includes(candidate)
}

function originHeaderPresent(request: Request) {
  return Boolean(headerValue(request.headers.origin) || headerValue(request.headers.referer))
}

function headerValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

function safeOrigin(referer: string): string | undefined {
  try {
    return new URL(referer).origin
  } catch {
    return undefined
  }
}