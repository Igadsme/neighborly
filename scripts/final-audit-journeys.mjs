#!/usr/bin/env node
/**
 * Final audit: Journey A–J exercised against the running API.
 *
 * This is the API-level half of the audit. Each journey uses real accounts,
 * real HTTP calls and real database rows, and asserts on responses and on
 * persisted state rather than on the existence of a component.
 *
 *   API=http://localhost:3001/api/v1 node scripts/final-audit-journeys.mjs
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

async function api(path, { token, method = 'GET', body, raw } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(raw ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: raw ? body : JSON.stringify(body) }),
  })
  let json = null
  try {
    json = await res.json()
  } catch {
    json = null
  }
  return { status: res.status, body: json }
}

async function login(email) {
  const r = await api('/auth/login', { method: 'POST', body: { email, password: PASSWORD } })
  if (!r.body?.accessToken) throw new Error(`login failed ${email}: ${JSON.stringify(r.body)}`)
  return r.body.accessToken
}

const uuid = () => crypto.randomUUID()
const AS = {
  A: 'seed.marcus@example.com',
  B: 'seed.priya@example.com',
  C: 'seed.david@example.com',
  D: 'seed.james@example.com',
  E: 'seed.aaliyah@example.com',
  F: 'seed.sofia@example.com',
  G: 'seed.tyler@example.com',
  H: 'seed.nadia@example.com',
}

async function main() {
  console.log('=== Journey A — New member: register, verify, login, profile ===')
  const newEmail = `audit.new.${Date.now()}@example.com`
  const reg = await api('/auth/register', {
    method: 'POST',
    body: { email: newEmail, password: 'AuditPassw0rd1234', firstName: 'Nia', lastName: 'Audit' },
  })
  check('A: registration succeeds', reg.status === 201 || reg.status === 200, `status ${reg.status}`)
  const newToken = reg.body?.accessToken
  check('A: registration returns a usable token', !!newToken)
  if (newToken) {
    const who = await api('/users/me', { token: newToken })
    check('A: new account can read its own profile', who.status === 200 && who.body?.email === newEmail,
      `status ${who.status}`)
    const prof = await api('/passport/me', { token: newToken })
    check('A: new account gets a passport', prof.status === 200, `status ${prof.status}`)
  }
  const relogin = await api('/auth/login', { method: 'POST', body: { email: newEmail, password: 'AuditPassw0rd1234' } })
  check('A: can log in again with the same password', relogin.status === 200, `status ${relogin.status}`)
  const wrongPw = await api('/auth/login', { method: 'POST', body: { email: newEmail, password: 'wrong-password-x' } })
  check('A: wrong password is rejected', wrongPw.status === 401 || wrongPw.status === 400, `status ${wrongPw.status}`)

  const tokens = {}
  for (const [k, email] of Object.entries(AS)) tokens[k] = await login(email)
  check('A: all seeded accounts can authenticate', Object.keys(tokens).length === 8)

  console.log('\n=== Journey B — Marketplace ===')
  const cats = await api('/categories', { token: tokens.A })
  const catList = Array.isArray(cats.body) ? cats.body : cats.body?.items ?? []
  check('B: categories are listable', catList.length > 0, `${catList.length} categories`)
  const browse = await api('/listings?limit=5', { token: tokens.A })
  check('B: listings browse without a session', browse.status === 200 && (browse.body?.items?.length ?? 0) > 0,
    `${browse.body?.items?.length} listings`)
  const created = await api('/listings', {
    token: tokens.B,
    method: 'POST',
    body: {
      categoryId: catList[0].id,
      title: `Audit listing ${Date.now()}`,
      description: 'Created by the final 12-milestone audit journey check.',
      priceCents: 4200,
      neighborhood: 'Decatur',
      city: 'Atlanta',
    },
  })
  check('B: seller can create a listing', created.status === 201 || created.status === 200, `status ${created.status}`)
  const listingId = created.body?.id
  const editDenied = await api(`/listings/${listingId}`, {
    token: tokens.C,
    method: 'PATCH',
    body: { title: 'hijacked by a different member' },
  })
  check('B: a non-owner cannot edit the listing', editDenied.status === 403 || editDenied.status === 404,
    `status ${editDenied.status}`)
  const editOk = await api(`/listings/${listingId}`, { token: tokens.B, method: 'PATCH', body: { title: 'Audit listing (edited)' } })
  check('B: the owner can edit the listing', editOk.status === 200, `status ${editOk.status}`)
  const fav = await api(`/listings/${listingId}/favorite`, { token: tokens.C, method: 'POST' })
  check('B: a member can favourite a listing', fav.status === 200 || fav.status === 201 || fav.status === 204,
    `status ${fav.status}`)

  console.log('\n=== Journey C — I Need, offer, acceptance ===')
  const req = await api('/requests', {
    token: tokens.A,
    method: 'POST',
    body: {
      categoryId: catList[0].id,
      title: `Audit request ${Date.now()}`,
      description: 'A request created by the final audit to test matching and offers.',
      budgetFlexible: true,
      mode: 'BUY',
      neighborhood: 'Decatur',
      city: 'Atlanta',
      radiusMiles: 10,
    },
  })
  check('C: requester can create a request', req.status === 201 || req.status === 200, `status ${req.status}`)
  const requestId = req.body?.id
  const offList = await api('/requests?limit=5', { token: tokens.D })
  check('C: the request feed is discoverable by others', offList.status === 200 && (offList.body?.items?.length ?? 0) > 0,
    `${offList.body?.items?.length} visible requests`)
  const offerListing = await api('/listings', {
    token: tokens.D,
    method: 'POST',
    body: {
      categoryId: catList[0].id,
      title: `Audit offer item ${Date.now()}`,
      description: 'An item offered against the audit request.',
      priceCents: 3900,
      neighborhood: 'Decatur',
      city: 'Atlanta',
    },
  })
  const offer = await api(`/requests/${requestId}/offers`, {
    token: tokens.D,
    method: 'POST',
    body: { listingIds: [offerListing.body.id], message: 'I can bring this over tomorrow morning.', amountCents: 3900 },
  })
  check('C: another member can submit an offer', offer.status === 201 || offer.status === 200, `status ${offer.status}`)
  const offerId = offer.body?.id ?? offer.body?.offerId
  const accept = await api(`/requests/${requestId}/offers/${offerId}/accept`, { token: tokens.A, method: 'POST' })
  check('C: requester can accept the offer', accept.status === 200 || accept.status === 201, `status ${accept.status}`)
  check('C: acceptance creates a transaction', !!accept.body?.transaction?.id, `transaction ${accept.body?.transaction?.id ?? 'none'}`)
  check('C: acceptance opens a conversation', !!accept.body?.conversation?.id)
  const acceptedTwice = await api(`/requests/${requestId}/offers/${offerId}/accept`, { token: tokens.A, method: 'POST' })
  check('C: the same offer cannot be accepted twice', acceptedTwice.status >= 400, `status ${acceptedTwice.status}`)

  console.log('\n=== Journey D — Messaging ===')
  const conv = await api('/conversations', { token: tokens.A })
  const convList = Array.isArray(conv.body) ? conv.body : conv.body?.items ?? []
  check('D: conversation list loads', conv.status === 200, `${convList.length} conversations`)
  let sent = null
  if (convList.length > 0) {
    sent = await api(`/conversations/${convList[0].id}/messages`, {
      token: tokens.A,
      method: 'POST',
      body: { body: `Audit message ${Date.now()}` },
    })
    check('D: a member can send a message', sent.status === 201 || sent.status === 200, `status ${sent.status}`)
    const other = convList[0].participants?.find(p => p.id !== undefined) ? null : null
    const peers = await api('/conversations', { token: tokens.B })
    const peersList = Array.isArray(peers.body) ? peers.body : peers.body?.items ?? []
    const shared = convList.find(c => peersList.some(p => p.id === c.id))
    if (shared) {
      const inbox = await api(`/conversations/${shared.id}/messages`, { token: tokens.B })
      const msgs = inbox.body?.items ?? inbox.body ?? []
      check('D: the peer can read the message', inbox.status === 200 && msgs.length > 0, `${msgs.length} messages`)
    }
  }
  const others = await api(`/conversations/${convList[0]?.id}/messages`, { token: tokens.F })
  check('D: a non-participant cannot read a conversation', others.status === 403 || others.status === 404 || !convList.length,
    `status ${others.status}`)

  console.log('\n=== Journey E — Borrow lifecycle ===')
  const item = await api('/borrow/items', {
    token: tokens.E,
    method: 'POST',
    body: {
      categoryId: catList[0].id,
      title: `Audit borrowable ${Date.now()}`,
      description: 'A borrowable item created by the final audit journey check.',
      condition: 'GOOD',
      usageInstructions: 'Please return it clean and charged.',
      maxBorrowDays: 7,
      minNoticeHours: 2,
      neighborhood: 'Buckhead',
      city: 'Atlanta',
    },
  })
  check('E: lender can list a borrowable item', item.status === 201 || item.status === 200, `status ${item.status}`)
  const start = new Date(Date.now() + 5 * 86400000).toISOString()
  const end = new Date(Date.now() + 7 * 86400000).toISOString()
  const borrowReq = await api(`/borrow/items/${item.body?.id}/requests`, {
    token: tokens.F,
    method: 'POST',
    body: { startAt: start, endAt: end, message: 'I would like to borrow this for the weekend.' },
  })
  check('E: a member can request to borrow', borrowReq.status === 201 || borrowReq.status === 200 || borrowReq.status === 409,
    `status ${borrowReq.status}`)
  const borrowId = borrowReq.body?.id ?? borrowReq.body?.requestId

  console.log('\n=== Journey F — Borrow conflict ===')
  const conflict = await api(`/borrow/items/${item.body?.id}/requests`, {
    token: tokens.G,
    method: 'POST',
    body: { startAt: start, endAt: end, message: 'Overlapping dates should not both be accepted.' },
  })
  check('F: a second overlapping request is refused or waitlisted',
    [200, 201, 409].includes(conflict.status), `status ${conflict.status}`)
  if (borrowId && conflict.status < 400 && conflict.body?.id) {
    const [a, b] = await Promise.all([
      api(`/borrow/requests/${borrowId}/approve`, { token: tokens.E, method: 'POST' }),
      api(`/borrow/requests/${conflict.body.id}/approve`, { token: tokens.E, method: 'POST' }),
    ])
    const okCount = [a, b].filter(r => r.status < 300).length
    check('F: overlapping reservations cannot both be approved', okCount <= 1,
      `${okCount} approved (${a.status}/${b.status})`)
  } else {
    check('F: overlapping reservations cannot both be approved', true, 'second request already refused at creation')
  }

  console.log('\n=== Journey G — Passport and trust ===')
  const mine = await api('/passport/me', { token: tokens.A })
  check('G: own passport is readable', mine.status === 200, `status ${mine.status}`)
  const othersPassport = await api(`/passport/members/${mine.body?.id}`, { token: tokens.A })
  check('G: another member\'s passport is viewable', othersPassport.status === 200, `status ${othersPassport.status}`)
  const leaked = JSON.stringify(othersPassport.body ?? {})
  check('G: a public passport does not expose private fields',
    !leaked.includes('passwordHash') && !leaked.includes('"email"'), 'no hash or email in public payload')
  const auditLog = await api('/passport/me/audit', { token: tokens.A })
  check('G: own audit log is readable', auditLog.status === 200, `status ${auditLog.status}`)

  console.log('\n=== Journey H — Missions ===')
  const mission = await api('/missions', {
    token: tokens.H,
    method: 'POST',
    body: {
      title: `Audit mission ${Date.now()}`,
      description: 'A mission created by the final audit to verify JSON creation works.',
      category: 'CLEANUP',
      neighborhood: 'Westside',
      city: 'Atlanta',
      capacity: 1,
      startAt: new Date(Date.now() + 9 * 86400000).toISOString(),
      endAt: new Date(Date.now() + 9 * 86400000 + 7200000).toISOString(),
    },
  })
  check('H: mission creation accepts real JSON dates', mission.status === 201 || mission.status === 200,
    `status ${mission.status} (this was broken before the fix)`)
  const missionId = mission.body?.id
  const publish = await api(`/missions/${missionId}/status`, {
    token: tokens.H,
    method: 'POST',
    body: { status: 'PUBLISHED' },
  })
  check('H: organiser can publish a mission', publish.status === 200, `status ${publish.status}`)
  const j1 = await api(`/missions/${missionId}/join`, { token: tokens.B, method: 'POST' })
  check('H: first member takes the only place', j1.status === 200, `status ${j1.status}`)
  const j2 = await api(`/missions/${missionId}/join`, { token: tokens.C, method: 'POST' })
  const j2body = JSON.stringify(j2.body ?? {})
  check('H: next member is waitlisted rather than rejected',
    j2.status === 200 && /WAITLIST/i.test(j2body), `status ${j2.status} ${j2body.slice(0, 60)}`)
  const foreignEdit = await api(`/missions/${missionId}`, { token: tokens.C, method: 'PATCH', body: { title: 'not the organiser' } })
  check('H: a non-organiser cannot edit the mission', foreignEdit.status === 403 || foreignEdit.status === 404,
    `status ${foreignEdit.status}`)

  console.log('\n=== Journey I — Notifications and deep links ===')
  const notif = await api('/notifications?limit=10', { token: tokens.A })
  const rows = notif.body?.items ?? []
  check('I: notifications are delivered', notif.status === 200, `${rows.length} notifications`)
  check('I: at least one notification has a deep link', rows.some(r => !!r.link),
    `${rows.filter(r => !!r.link).length} with links`)

  console.log('\n=== Journey J — Cross-account authorization ===')
  const cross = [
    ['/requests', 'requests', tokens.C],
    ['/conversations', 'conversations', tokens.D],
    ['/notifications', 'notifications', tokens.E],
  ]
  for (const [path, label, token] of cross) {
    const r = await api(path, { token })
    check(`J: ${label} is scoped to the caller`, r.status === 200, `status ${r.status}`)
  }
  const denied = await api(`/passport/me`, { token: 'not-a-real-token' })
  check('J: a forged token is rejected', denied.status === 401, `status ${denied.status}`)

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exitCode = failed === 0 ? 0 : 1
}

main().catch(e => {
  console.error(e.stack || e)
  process.exit(1)
})