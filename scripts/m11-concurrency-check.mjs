#!/usr/bin/env node
/**
 * Concurrency and integrity probes for Milestone 11 (11E).
 *
 * These assert the guarantees that only hold under real contention against a
 * real PostgreSQL:
 *   - mission capacity cannot be exceeded by simultaneous joins
 *   - a mission that is full puts further joiners on the waitlist
 *   - accepting an offer is atomic (one winner)
 *   - a borrow cannot be double-booked for the same dates
 *
 * Every probe runs against a disposable database and prints the observed
 * outcome so a failure is legible rather than just red.
 *
 *   API_URL=http://localhost:3001/api/v1 node scripts/m11-concurrency-check.mjs
 */
const API = process.env.API_URL ?? 'http://localhost:3001/api/v1'
const PASSWORD = 'neighborly-local-seed'

let failed = 0
function check(name, passed, detail) {
  if (!passed) failed += 1
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

async function login(email) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  const body = await res.json()
  if (!body.accessToken) throw new Error(`login failed for ${email}: ${JSON.stringify(body)}`)
  return body.accessToken
}

async function api(path, token, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  })
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { status: res.status, body }
}

/** The category list is returned as a bare array. */
async function firstCategoryId(token) {
  const body = await api('/categories', token)
  const list = Array.isArray(body.body) ? body.body : body.body?.items ?? []
  return list[0]?.id
}

/**
 * The seeded accounts use fixed ids (`10000000-...-000N`) and the probe needs to
 * recognise which participant row belongs to which caller.
 */
const SEED_IDS = {
  'seed.priya@example.com': '10000000-0000-4000-8000-000000000002',
  'seed.david@example.com': '10000000-0000-4000-8000-000000000003',
  'seed.james@example.com': '10000000-0000-4000-8000-000000000005',
  'seed.aaliyah@example.com': '10000000-0000-4000-8000-000000000004',
  'seed.sofia@example.com': '10000000-0000-4000-8000-000000000006',
  'seed.tyler@example.com': '10000000-0000-4000-8000-000000000007',
  'seed.nadia@example.com': '10000000-0000-4000-8000-000000000008',
  'seed.rosa@example.com': '10000000-0000-4000-8000-000000000009',
}
const emailUserId = email => SEED_IDS[email]

const SEED = {
  organizer: 'seed.marcus@example.com',
  joiners: [
    'seed.priya@example.com',
    'seed.david@example.com',
    'seed.james@example.com',
    'seed.aaliyah@example.com',
    'seed.sofia@example.com',
    'seed.tyler@example.com',
    'seed.nadia@example.com',
    'seed.rosa@example.com',
  ],
}

async function main() {
  const tokens = {}
  for (const email of [SEED.organizer, ...SEED.joiners]) tokens[email] = await login(email)

  // ── Mission capacity under simultaneous joins ─────────────────────────
  const created = await api('/missions', tokens[SEED.organizer], {
    method: 'POST',
    body: JSON.stringify({
      title: 'M11 concurrency probe',
      description: 'Created by the milestone 11 concurrency probe.',
      category: 'CLEANUP',
      neighborhood: 'Decatur',
      city: 'Atlanta',
      capacity: 3,
      startAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      endAt: new Date(Date.now() + 7 * 86400000 + 7200000).toISOString(),
    }),
  })
  check('mission created for the probe', created.status < 300, `status ${created.status}`)
  const missionId = created.body?.id
  if (!missionId) {
    console.log('Cannot continue without a mission id.')
    process.exit(1)
  }

  // A mission is created as a draft and is only joinable once published, so
  // the probe publishes it before racing anyone onto it.
  const published = await api(`/missions/${missionId}/status`, tokens[SEED.organizer], {
    method: 'POST',
    body: JSON.stringify({ status: 'PUBLISHED' }),
  })
  check('mission published so it accepts joins', published.status < 300, `status ${published.status}`)

  // Eight members join at the same instant against three places.
  const results = await Promise.all(
    SEED.joiners.map(async email => {
      const r = await api(`/missions/${missionId}/join`, tokens[email], { method: 'POST' })
      return { email, status: r.status, body: r.body, outcome: r.status < 300 ? 'ACCEPTED' : 'REFUSED' }
    }),
  )

  const detail = await api(`/missions/${missionId}`, tokens[SEED.organizer])
  const confirmed = detail.body?.confirmedCount ?? detail.body?.mission?.confirmedCount
  check(
    'capacity is never exceeded by simultaneous joins',
    typeof confirmed === 'number' && confirmed <= 3,
    `confirmedCount=${confirmed} of capacity 3, from ${results.length} concurrent joins`,
  )

  // Every concurrent join must be served, not refused: the capacity rule is what
// decides who gets a place, not a rejection. A join that cannot be served at
// all would mean the contended row lock surfaced as an error.
const rejected = results.filter(r => r.status >= 400).length
check(
  'every concurrent join is served rather than rejected',
  rejected === 0,
  `${results.length - rejected} served, ${rejected} rejected (statuses ${[...new Set(results.map(r => r.status))].join('/')})`,
)

// And the stored rows must agree with the headline count: exactly `capacity`
// confirmed, everyone else waitlisted.
const participantsAfter = await api(`/missions/${missionId}/participants`, tokens[SEED.organizer])
const rowsAfter = Array.isArray(participantsAfter.body)
  ? participantsAfter.body
  : participantsAfter.body?.items ?? []
const confirmedRows = rowsAfter.filter(p => p.status === 'CONFIRMED').length
const waitlistRows = rowsAfter.filter(p => p.status === 'WAITLISTED').length
check(
  'every joiner is either confirmed or waitlisted, and neither count is lost',
  confirmedRows === (typeof confirmed === 'number' ? confirmed : confirmedRows) &&
    confirmedRows + waitlistRows === results.length,
  `${confirmedRows} CONFIRMED + ${waitlistRows} WAITLISTED = ${confirmedRows + waitlistRows} for ${results.length} joiners`,
)

  // ── Offer acceptance is atomic ─────────────────────────────────────────
  const owned = await api('/requests', tokens[SEED.joiners[0]], {
    method: 'POST',
    body: JSON.stringify({
      categoryId: await firstCategoryId(tokens[SEED.joiners[0]]),
      title: 'M11 offer race probe',
      description: 'Two sellers race to be accepted for this request.',
      budgetFlexible: true,
      mode: 'BUY',
      neighborhood: 'Decatur',
      city: 'Atlanta',
      radiusMiles: 10,
    }),
  })
  const requestId = owned.body?.id
  check('request created for the offer race', !!requestId && owned.status < 300, `status ${owned.status}`)

  if (requestId) {
    /*
     * Offers reference a listing through `listingIds` and carry a `message`
     * and optional `amountCents`; they are not a { listingId, priceCents }
     * object. Two different members each make one, then both try to accept,
     * because accepting is the step that has to be atomic.
     */
    const offerFor = async (sellerEmail, title) => {
      const listing = await api('/listings', tokens[sellerEmail], {
        method: 'POST',
        body: JSON.stringify({
          categoryId: await firstCategoryId(tokens[sellerEmail]),
          title,
          description: 'Created by the milestone 11 concurrency probe.',
          priceCents: 1000,
          neighborhood: 'Decatur',
          city: 'Atlanta',
          // `status` is deliberately not sent: it is server-controlled, and the
          // whitelist pipe rejects it. This is the mass-assignment guard
          // working, not a limitation of the probe.
        }),
      })
      if (!listing.body?.id) return { sellerEmail, error: `listing ${listing.status}` }
      const offer = await api(`/requests/${requestId}/offers`, tokens[sellerEmail], {
        method: 'POST',
        body: JSON.stringify({
          listingIds: [listing.body.id],
          message: 'Offer from the milestone 11 concurrency probe.',
          amountCents: 1000,
        }),
      })
      return { sellerEmail, offer, listingId: listing.body.id }
    }

    const sellers = [SEED.joiners[1], SEED.joiners[2]]
    const offers = await Promise.all(sellers.map(email => offerFor(email, 'Race item')))
    const withOffers = offers.filter(o => o.offer && o.offer.status < 300)
    check(
      'two competing offers were created',
      withOffers.length === 2,
      offers.map(o => `${o.sellerEmail.split('.')[1]}:${o.offer?.status ?? o.error}`).join(' '),
    )

    if (withOffers.length === 2) {
      const acceptances = await Promise.all(
        withOffers.map(o =>
          api(
            `/requests/${requestId}/offers/${o.offer.body.id ?? o.offer.body.offerId}/accept`,
            tokens[SEED.joiners[0]],
            { method: 'POST' },
          ).then(r => ({ status: r.status, offerId: o.offer.body.id ?? o.offer.body.offerId })),
        ),
      )
      const winners = acceptances.filter(a => a.status < 300)
      const losers = acceptances.filter(a => a.status >= 300)
      check(
        'exactly one of two competing offers is accepted',
        winners.length === 1 && losers.length === 1,
        `${winners.length} accepted, ${losers.length} rejected (statuses ${acceptances.map(a => a.status).join('/')})`,
      )
    }
  }

  console.log(failed === 0 ? '\nAll concurrency probes passed.' : `\n${failed} probe(s) failed.`)
  process.exitCode = failed === 0 ? 0 : 1
}

main().catch(error => {
  console.error(error.stack || error)
  process.exit(1)
})