/**
 * Deep links placed in verification and recovery emails.
 *
 * `PUBLIC_WEB_ORIGIN` is the absolute origin of the web app. The token is
 * carried in the query string of a same-origin link, so it is only ever
 * read by the frontend that serves it. These builders are the single
 * place that formats a secret into a URL.
 */

export const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000

export function publicWebOrigin() {
  return (process.env.PUBLIC_WEB_ORIGIN ?? 'http://localhost:8443').replace(/\/$/, '')
}

export function verificationLink(token: string) {
  return `${publicWebOrigin()}/?verify=${encodeURIComponent(token)}`
}

export function emailChangeLink(token: string) {
  return `${publicWebOrigin()}/?verifyEmailChange=${encodeURIComponent(token)}`
}

export function resetLink(token: string) {
  return `${publicWebOrigin()}/?reset=${encodeURIComponent(token)}`
}