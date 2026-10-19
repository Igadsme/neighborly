const baseUrl = process.env.API_URL ?? 'http://localhost:3000/api/v1'
const password = 'NeighborlySecurity2026!'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
async function call(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  return { response, payload: await response.json().catch(() => null) }
}

async function main() {
  const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const registration = await call('/auth/register', { method: 'POST', body: { email: `security-${id}@neighborly.test`, password, firstName: 'Security', lastName: 'Test', neighborhood: 'QA', city: 'New York', state: 'NY' } })
  assert(
    registration.response.ok && registration.payload?.accessToken,
    `registration did not issue an access token (status ${registration.response.status}: ${JSON.stringify(registration.payload)})`
  )
  const token = registration.payload.accessToken

  const missingAuth = await call('/users/me')
  assert(missingAuth.response.status === 401, 'protected endpoint accepted a missing token')
  const forged = await call('/users/me', { token: 'not-a-jwt' })
  assert(forged.response.status === 401, 'protected endpoint accepted a forged token')
  const moderatorEscalation = await call('/moderation/reports', { token })
  assert(moderatorEscalation.response.status === 403, 'regular user reached moderator endpoint')

  const rateLimitRequests = await Promise.all(Array.from({ length: 12 }, () => call('/auth/login', { method: 'POST', body: { email: `missing-${id}@neighborly.test`, password } })))
  assert(rateLimitRequests.some(({ response }) => response.status === 429), 'auth rate limit did not engage')
  console.log('Neighborly security smoke test passed: missing/forged auth, moderator escalation, and auth rate limiting.')
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
