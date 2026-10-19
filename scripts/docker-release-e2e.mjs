#!/usr/bin/env node
/**
 * Local Docker release-gate API loop.
 * Talks to a running Neighborly API. Does not print access tokens.
 * Stops at the first unexpected HTTP failure and writes a JSON report.
 *
 * Usage (API already listening):
 *   node scripts/docker-release-e2e.mjs
 *   API_BASE=http://localhost:3000/api/v1 node scripts/docker-release-e2e.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const BASE = process.env.API_BASE ?? 'http://localhost:3000/api/v1'
const SEED_PASSWORD = 'neighborly-local-seed'
const REPORT_PATH = resolve(
  process.env.E2E_REPORT ?? 'artifacts/docker-release-verification/e2e-report.json'
)

const steps = []
let failed = false

function redact(value) {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [key, child] of Object.entries(value)) {
      if (/token|password|authorization|secret/i.test(key)) {
        out[key] = '[redacted]'
      } else {
        out[key] = redact(child)
      }
    }
    return out
  }
  return value
}

async function call(step, method, path, { token, body, expectStatus, fatal = true } = {}) {
  const started = new Date().toISOString()
  let status = 0
  let parsed = null
  let error = null
  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
    status = response.status
    const text = await response.text()
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      parsed = text
    }
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause)
  }

  const expected = expectStatus ?? [200, 201]
  const ok = error === null && expected.includes(status)
  const record = {
    step,
    method,
    path,
    status,
    ok,
    expectStatus: expected,
    started,
    body: redact(parsed),
    ...(error ? { error } : {})
  }
  steps.push(record)
  console.log(JSON.stringify({ step, method, path, status, ok, expectStatus: expected }))
  if (!ok && (fatal || error)) {
    failed = true
    console.error(JSON.stringify({ step, status, error, body: record.body }))
  }
  return { ok, status, json: parsed, record }
}

async function writeReport() {
  await mkdir(dirname(REPORT_PATH), { recursive: true })
  const report = {
    apiBase: BASE,
    finishedAt: new Date().toISOString(),
    failed,
    steps
  }
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`report ${REPORT_PATH}`)
}

async function loginOrRegister(label, email, profile, { fatalOnRegister = true } = {}) {
  const login = await call(`login-${label}`, 'POST', '/auth/login', {
    fatal: false,
    body: { email, password: SEED_PASSWORD }
  })
  if (login.ok && login.json?.accessToken && login.json?.user?.id) {
    return { token: login.json.accessToken, user: login.json.user, how: 'login' }
  }
  if (failed) return null
  const registered = await call(`register-${label}`, 'POST', '/auth/register', {
    fatal: fatalOnRegister,
    body: {
      email,
      password: SEED_PASSWORD,
      firstName: profile.firstName,
      lastName: profile.lastName,
      neighborhood: 'Decatur',
      city: 'Atlanta',
      state: 'GA'
    }
  })
  if (!registered.ok || !registered.json?.accessToken || !registered.json?.user?.id) return null
  return { token: registered.json.accessToken, user: registered.json.user, how: 'register' }
}

async function main() {
  const health = await call('health', 'GET', '/health')
  if (!health.ok) return
  const ready = await call('ready', 'GET', '/ready')
  if (!ready.ok) return

  const stamp = Date.now()
  const requesterEmail = process.env.E2E_USER_A ?? 'seed.marcus@example.com'
  const offererEmail = process.env.E2E_USER_B ?? 'seed.priya@example.com'
  let userA = await loginOrRegister(
    'requester',
    requesterEmail,
    { firstName: 'Marcus', lastName: 'Johnson' },
    { fatalOnRegister: false }
  )
  if (!userA && !failed) {
    userA = await loginOrRegister('requester-fresh', `docker-gate-a-${stamp}@example.com`, {
      firstName: 'Gate',
      lastName: 'Requester'
    })
  }
  if (!userA) return

  let userB = await loginOrRegister(
    'offerer',
    offererEmail,
    { firstName: 'Priya', lastName: 'Patel' },
    { fatalOnRegister: false }
  )
  if (!userB && !failed) {
    userB = await loginOrRegister('offerer-fresh', `docker-gate-b-${stamp}@example.com`, {
      firstName: 'Gate',
      lastName: 'Offerer'
    })
  }
  if (!userB) return

  steps.push({
    step: 'actors',
    ok: true,
    requester: { id: userA.user.id, email: userA.user.email, how: userA.how },
    offerer: { id: userB.user.id, email: userB.user.email, how: userB.how }
  })

  const categories = await call('list-categories', 'GET', '/categories')
  if (!categories.ok) return
  const category = Array.isArray(categories.json) ? categories.json[0] : null
  if (!category?.id) {
    failed = true
    steps.push({ step: 'pick-category', ok: false, error: 'No category id in GET /categories' })
    return
  }
  steps.push({
    step: 'pick-category',
    ok: true,
    categoryId: category.id,
    categoryName: category.name
  })

  const created = await call('publish-request', 'POST', '/requests', {
    token: userA.token,
    expectStatus: [201, 200],
    body: {
      categoryId: category.id,
      title: `Docker gate need ${stamp}`,
      description: 'Local Docker verification request. Not a production listing.',
      mode: 'BUY',
      budgetCents: 2500
    }
  })
  if (!created.ok) return
  const requestId = created.json?.id
  if (!requestId) {
    failed = true
    steps.push({ step: 'publish-request-id', ok: false, error: 'Response had no request id' })
    return
  }

  const offer = await call('create-offer', 'POST', `/requests/${requestId}/offers`, {
    token: userB.token,
    expectStatus: [201, 200],
    body: {
      amountCents: 2000,
      message: 'I can take this on this week.'
    }
  })
  if (!offer.ok) return
  const offerId = offer.json?.id
  if (!offerId) {
    failed = true
    steps.push({ step: 'create-offer-id', ok: false, error: 'Response had no offer id' })
    return
  }

  const accepted = await call(
    'accept-offer',
    'POST',
    `/requests/${requestId}/offers/${offerId}/accept`,
    { token: userA.token, expectStatus: [200, 201] }
  )
  if (!accepted.ok) return
  const conversationId = accepted.json?.conversation?.id
  const transactionId = accepted.json?.transaction?.id
  const transactionStatus = accepted.json?.transaction?.status
  if (!conversationId || !transactionId) {
    failed = true
    steps.push({
      step: 'accept-ids',
      ok: false,
      error: 'Accept response missing conversation id or transaction id',
      body: redact(accepted.json)
    })
    return
  }
  steps.push({
    step: 'accept-ids',
    ok: transactionStatus === 'ACCEPTED',
    requestId,
    offerId,
    conversationId,
    transactionId,
    transactionStatus
  })
  if (transactionStatus !== 'ACCEPTED') {
    failed = true
    return
  }

  const fromA = await call('message-requester', 'POST', `/conversations/${conversationId}/messages`, {
    token: userA.token,
    expectStatus: [200, 201],
    body: { body: 'Thanks, I accept. When can you start?' }
  })
  if (!fromA.ok) return
  const fromB = await call('message-offerer', 'POST', `/conversations/${conversationId}/messages`, {
    token: userB.token,
    expectStatus: [200, 201],
    body: { body: 'I can start tomorrow morning.' }
  })
  if (!fromB.ok) return

  const skipped = await call(
    'reject-direct-completed',
    'PATCH',
    `/transactions/${transactionId}/status`,
    {
      token: userA.token,
      expectStatus: [400],
      body: { status: 'COMPLETED' }
    }
  )
  if (!skipped.ok) return

  for (const status of ['SCHEDULED', 'IN_PROGRESS', 'COMPLETED']) {
    const hop = await call(
      `status-${status.toLowerCase()}`,
      'PATCH',
      `/transactions/${transactionId}/status`,
      {
        token: userA.token,
        expectStatus: [200],
        body: { status }
      }
    )
    if (!hop.ok) return
    if (hop.json?.status !== status) {
      failed = true
      steps.push({
        step: `status-${status.toLowerCase()}-body`,
        ok: false,
        error: `Expected status ${status}`,
        body: redact(hop.json)
      })
      return
    }
  }

  const review = await call('submit-review', 'POST', '/reviews', {
    token: userA.token,
    expectStatus: [200, 201],
    body: {
      transactionId,
      subjectId: userB.user.id,
      rating: 5,
      body: 'Docker gate review. Local fixture only.'
    }
  })
  if (!review.ok) return
  steps.push({
    step: 'loop-complete',
    ok: true,
    requestId,
    offerId,
    conversationId,
    transactionId,
    reviewId: review.json?.id ?? null,
    messageIds: [fromA.json?.id ?? null, fromB.json?.id ?? null]
  })
}

try {
  await main()
} catch (cause) {
  failed = true
  steps.push({
    step: 'uncaught',
    ok: false,
    error: cause instanceof Error ? cause.message : String(cause)
  })
} finally {
  await writeReport()
}

process.exit(failed ? 1 : 0)
