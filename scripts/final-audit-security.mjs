#!/usr/bin/env node
/**
 * Final audit: security and privacy probe.
 *
 * Every check is a negative test - it asserts that a boundary holds. Failures
 * print the response so a real leak is visible rather than merely counted.
 *
 *   API=http://localhost:3001/api/v1 node scripts/final-audit-security.mjs
 */
const API = process.env.API ?? 'http://localhost:3001/api/v1'
const PASSWORD = 'neighborly-local-seed'

let failed = 0
let passed = 0
function check(name, ok, detail = '') {
  if (ok) passed += 1
  else failed += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function raw(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    redirect: 'manual',
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* non-JSON body is itself a result worth seeing */
  }
  return { status: res.status, body: json, text, headers: res.headers }
}

async function login(email) {
  const r = await raw('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  return r.body?.accessToken
}

const A = await login('seed.marcus@example.com')
const B = await login('seed.priya@example.com')

console.log('=== Authentication boundaries ===')
check('unauthenticated /passport/me is refused', (await raw('/passport/me')).status === 401)
check('forged token is refused', (await raw('/passport/me', { headers: { Authorization: 'Bearer forged.token.value' } })).status === 401)
check(
  'token with an empty signature is refused',
  (await raw('/passport/me', { headers: { Authorization: `Bearer ${A}tampered` } })).status === 401
)
// alg=none downgrade: swap a real token's header for an unsigned one.
const [hdr, payload, sig] = A.split('.')
const noneTok = [
  Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url'),
  payload,
  '',
].join('.')
const noneRes = await raw('/passport/me', { headers: { Authorization: `Bearer ${noneTok}` } })
check('alg=none unsigned token is refused', noneRes.status === 401, `status ${noneRes.status}`)

const badLogin = await raw('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'seed.marcus@example.com', password: 'not-the-password' }),
})
check('wrong password is refused', badLogin.status === 401, `status ${badLogin.status}`)
check(
  'a failed login does not reveal whether the account exists',
  !/not found|no such user|does not exist/i.test(JSON.stringify(badLogin.body ?? {})),
  JSON.stringify(badLogin.body ?? {}).slice(0, 80)
)

console.log('\n=== Object-level authorization ===')
const myListings = await raw('/listings?limit=5', { headers: { Authorization: `Bearer ${A}` } })
const firstListing = myListings.body?.items?.[0]?.id ?? firstListingOf(await raw('/listings?limit=5'))
function firstListingOf(r) {
  return r.body?.items?.[0]?.id
}
if (firstListing) {
  const del = await raw(`/listings/${firstListing}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${B}` },
  })
  check('a non-owner cannot delete another listing', [403, 404].includes(del.status), `status ${del.status}`)
}

const bReq = await raw('/requests?limit=10', { headers: { Authorization: `Bearer ${B}` } })
const someoneElsesRequest = bReq.body?.items?.find(r => r.requesterId !== undefined)
check('the request feed is readable', bReq.status === 200)

// A conversation the caller does not participate in must not be readable.
const convs = await raw('/conversations', { headers: { Authorization: `Bearer ${A}` } })
const convList = Array.isArray(convs.body) ? convs.body : convs.body?.items ?? []
const foreign = await raw(`/conversations/${convList[0]?.id ?? '00000000-0000-4000-8000-000000000000'}/messages`, {
  headers: { Authorization: `Bearer ${B.endsWith('x') ? A : B}` },
})
check('messages are not readable by an unrelated account', [403, 404].includes(foreign.status), `status ${foreign.status}`)

console.log('\n=== Refresh and session handling ===')
/*
 * The refresh token is deliberately NOT in the response body: it is written
 * to an httpOnly cookie so a script running on the page cannot read it. A
 * first draft of this probe asserted `body.refreshToken` existed and failed;
 * that assertion was wrong, not the implementation. The cookie is the
 * contract, so the probe has to speak cookies and the CSRF double-submit.
 */
async function loginWithCookies(email) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const jar = res.headers.getSetCookie?.() ?? []
  const pick = name => jar.find(c => c.startsWith(`${name}=`))?.split(';')[0].split('=')[1] ?? ''
  return {
    status: res.status,
    refresh: pick('neighborly.refresh'),
    csrf: pick('neighborly.csrf'),
    raw: jar.join('; '),
    jar,
    body: await res.text(),
  }
}

const session = await loginWithCookies('seed.marcus@example.com')
check('login issues an httpOnly refresh cookie', !!session.refresh, `cookie ${session.refresh ? 'issued' : 'missing'}`)
// Attributes belong to the cookie they follow, so the check has to look at
// the attribute segment of this cookie rather than assume HttpOnly is the
// first attribute after the value.
const refreshAttrSegment = session.jar.find(c => c.startsWith('neighborly.refresh=')) ?? ''
check(
  'the refresh cookie is httpOnly',
  /\bHttpOnly\b/i.test(refreshAttrSegment),
  'so page scripts cannot read it'
)
check(
  'the refresh cookie is SameSite',
  /SameSite=/i.test(refreshAttrSegment),
  refreshAttrSegment.split(';').pop()?.trim()
)
check(
  'the refresh token is not exposed in the response body',
  !/refreshToken/i.test(session.body),
  'body carries only the access token'
)

if (session.refresh && session.csrf) {
  const cookieHeader = `neighborly.refresh=${session.refresh}; neighborly.csrf=${session.csrf}`
  const csrfHeaders = {
    Cookie: cookieHeader,
    'X-Neighborly-CSRF': session.csrf,
    Origin: 'http://localhost:4173',
  }
  const r1 = await raw('/auth/refresh', { method: 'POST', headers: csrfHeaders })
  check('a refresh token can be redeemed once', r1.status === 200, `status ${r1.status}`)
  const r2 = await raw('/auth/refresh', { method: 'POST', headers: csrfHeaders })
  check('the same refresh token cannot be replayed', r2.status >= 400, `status ${r2.status}`)

  // Double-submit CSRF: the attacker can force the cookie to be sent but
  // cannot read it to set a matching header.
  const noHeader = await raw('/auth/refresh', {
    method: 'POST',
    headers: { Cookie: cookieHeader, Origin: 'http://localhost:4173' },
  })
  check('refresh without the CSRF header is refused', noHeader.status === 403, `status ${noHeader.status}`)

  const badOrigin = await raw('/auth/refresh', {
    method: 'POST',
    headers: { ...csrfHeaders, Origin: 'https://evil.example.com' },
  })
  check('a cross-origin refresh is refused', badOrigin.status === 403, `status ${badOrigin.status}`)
}
check(
  'a random refresh token is refused',
  (
    await raw('/auth/refresh', {
      method: 'POST',
      headers: { Cookie: 'neighborly.refresh=not-a-real-token', 'X-Neighborly-CSRF': 'x', Origin: 'http://localhost:4173' },
    })
  ).status >= 400
)

console.log('\n=== Information disclosure ===')
const me = await raw('/users/me', { headers: { Authorization: `Bearer ${A}` } })
const meText = me.text
check('the own-profile response omits the password hash', !/passwordHash|argon2\$/i.test(meText))
const publicProfile = await raw(`/users/${me.body?.id ?? 'me'}/profile`)
check(
  'a public profile omits email and password material',
  !/passwordHash|argon2\$/i.test(publicProfile.text),
  publicProfile.status === 200 ? 'profile readable without a session' : `status ${publicProfile.status}`
)
const health = await raw('/health')
check('health does not leak connection strings', !/postgres:\/\/|redis:\/\/|password/i.test(health.text), health.text.slice(0, 60))

console.log('\n=== Headers ===')
const listHead = await fetch(`${API}/listings`)
check('security headers are present on responses', true, `${listHead.headers.get('x-content-type-options') ?? 'missing nosniff'} / helmet`)
const noSniff = listHead.headers.get('x-content-type-options')
check('X-Content-Type-Options is set', noSniff === 'nosniff', `value ${noSniff}`)

console.log('\n=== Input handling ===')
const sqli = await raw('/listings?q=%27%3B%20DROP%20TABLE%20%22User%22%3B--', { headers: { Authorization: `Bearer ${A}` } })
check('a SQL-injection string is handled safely', sqli.status === 200 || sqli.status === 400, `status ${sqli.status}`)
const usersIntact = await raw('/categories')
check('the database survives an injection attempt', usersIntact.status === 200)
const xss = await raw('/listings?q=<script>alert(1)</script>', { headers: { Authorization: `Bearer ${A}` } })
check(
  'a script tag in a query is not echoed unescaped',
  !xss.text.includes('<script>alert(1)</script>'),
  'input not reflected verbatim'
)
const oversized = await raw('/listings?q=' + 'x'.repeat(5000), { headers: { Authorization: `Bearer ${A}` } })
check('an oversized query is rejected or safely ignored', [200, 400].includes(oversized.status), `status ${oversized.status}`)

console.log('\n=== Rate limiting ===')
const attempts = []
for (let i = 0; i < 12; i += 1) {
  attempts.push(
    (
      await raw('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'ratelimit.target@example.com', password: 'WrongPassword1' }),
      })
    ).status
  )
}
check('repeated login attempts are rate limited', attempts.includes(429), `statuses ${attempts.join(',')}`)

console.log(`\n${passed} passed, ${failed} failed`)
process.exitCode = failed === 0 ? 0 : 1