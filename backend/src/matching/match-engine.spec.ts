import {
  DEFAULT_WEIGHTS,
  MatchCandidate,
  MatchRequest,
  boundingBox,
  buildPrefilter,
  matchWeights,
  rankCandidates,
  scoreCandidate,
  tokenize
} from './match-engine'

/**
 * The engine is pure, so these run without a database. They pin the two
 * properties the ranking must have: it is deterministic, and it explains
 * itself.
 */

const NOW = new Date('2026-10-01T12:00:00.000Z')

function request(overrides: Partial<MatchRequest> = {}): MatchRequest {
  return {
    id: 'req-1',
    title: 'Oak dining chair',
    description: 'Looking for a solid wood dining chair in good shape',
    categoryId: 'cat-furniture',
    budgetCents: 20000,
    minBudgetCents: null,
    budgetFlexible: true,
    neighborhood: 'Inman Park',
    city: 'Atlanta',
    latitude: 33.75,
    longitude: -84.35,
    radiusMiles: 10,
    keywords: null,
    createdAt: NOW,
    ...overrides
  }
}

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id: 'listing-1',
    categoryId: 'cat-furniture',
    title: 'Solid oak dining chair',
    description: 'Sturdy oak chair, good condition',
    priceCents: 12000,
    neighborhood: 'Inman Park',
    city: 'Atlanta',
    latitude: 33.76,
    longitude: -84.35,
    createdAt: NOW,
    ...overrides
  }
}

describe('match engine tokenizing', () => {
  it('lowercases, drops short tokens, and removes stop words', () => {
    expect(tokenize('Oak Dining Chair, a & the')).toEqual(['oak', 'dining', 'chair'])
  })

  it('de-duplicates so a repeated word does not inflate a score', () => {
    expect(tokenize('chair chair chair')).toEqual(['chair'])
  })

  it('handles null and empty input', () => {
    expect(tokenize(null)).toEqual([])
    expect(tokenize(undefined)).toEqual([])
    expect(tokenize('')).toEqual([])
  })
})

describe('match engine scoring', () => {
  it('refuses a candidate from a different category outright', () => {
    const result = scoreCandidate(request(), candidate({ categoryId: 'cat-electronics' }), DEFAULT_WEIGHTS, NOW)
    expect(result).toBeNull()
  })

  it('explains the signals that produced the score', () => {
    const result = scoreCandidate(request(), candidate(), DEFAULT_WEIGHTS, NOW)
    expect(result).not.toBeNull()
    expect(result!.reasons.join(' ')).toMatch(/budget/i)
    expect(result!.reasons.join(' ')).toMatch(/keyword/i)
    expect(result!.reasons.join(' ')).toMatch(/away/i)
    expect(result!.score).toBeGreaterThan(0)
    expect(result!.score).toBeLessThanOrEqual(100)
  })

  it('scores a listing in budget above one at the budget ceiling', () => {
    const cheap = scoreCandidate(request(), candidate({ priceCents: 5000 }), DEFAULT_WEIGHTS, NOW)!
    const dear = scoreCandidate(request(), candidate({ priceCents: 19000 }), DEFAULT_WEIGHTS, NOW)!
    expect(cheap.score).toBeGreaterThan(dear.score)
  })

  it('rejects a listing outside a non-flexible budget', () => {
    const strict = request({ budgetCents: 10000, budgetFlexible: false })
    expect(scoreCandidate(strict, candidate({ priceCents: 15000 }), DEFAULT_WEIGHTS, NOW)).toBeNull()
  })

  it('accepts a listing above budget when the requester is flexible', () => {
    const flexible = request({ budgetCents: 10000, budgetFlexible: true, minBudgetCents: 5000 })
    const result = scoreCandidate(flexible, candidate({ priceCents: 15000 }), DEFAULT_WEIGHTS, NOW)
    expect(result).not.toBeNull()
    expect(result!.reasons.join(' ')).toMatch(/flexible/i)
  })

  it('rejects a listing beyond the stated radius', () => {
    const far = candidate({ latitude: 34.5, longitude: -84.35 })
    expect(scoreCandidate(request(), far, DEFAULT_WEIGHTS, NOW)).toBeNull()
  })

  it('scores a near listing above a far one inside the radius', () => {
    // 33.83 is roughly six miles out, still inside the ten mile radius.
    const near = scoreCandidate(request(), candidate({ latitude: 33.76 }), DEFAULT_WEIGHTS, NOW)!
    const far = scoreCandidate(request(), candidate({ latitude: 33.83 }), DEFAULT_WEIGHTS, NOW)!
    expect(near.score).toBeGreaterThan(far.score)
  })

  it('prefers a fresh listing over an old one with the same other signals', () => {
    const fresh = scoreCandidate(request(), candidate({ createdAt: NOW }), DEFAULT_WEIGHTS, NOW)!
    const stale = scoreCandidate(
      request(),
      candidate({ createdAt: new Date('2025-01-01T00:00:00.000Z') }),
      DEFAULT_WEIGHTS,
      NOW
    )!
    expect(fresh.score).toBeGreaterThan(stale.score)
  })

  it('handles a request with no budget stated without disqualifying anything', () => {
    const noBudget = request({ budgetCents: null, minBudgetCents: null })
    expect(scoreCandidate(noBudget, candidate(), DEFAULT_WEIGHTS, NOW)).not.toBeNull()
  })

  it('handles a candidate with no coordinates', () => {
    const noCoords = candidate({ latitude: null, longitude: null })
    expect(scoreCandidate(request(), noCoords, DEFAULT_WEIGHTS, NOW)).not.toBeNull()
  })

  it('is deterministic: the same inputs give the same output', () => {
    const first = scoreCandidate(request(), candidate(), DEFAULT_WEIGHTS, NOW)
    const second = scoreCandidate(request(), candidate(), DEFAULT_WEIGHTS, NOW)
    expect(first).toEqual(second)
  })
})

describe('match engine ranking', () => {
  it('orders by score and breaks ties deterministically', () => {
    const results = rankCandidates(
      request(),
      [
        candidate({ id: 'b', priceCents: 5000 }),
        candidate({ id: 'a', priceCents: 5000 }),
        candidate({ id: 'c', priceCents: 500 })
      ],
      DEFAULT_WEIGHTS,
      NOW
    )
    expect(results[0].listingId).toBe('c')
    // a and b tie, so the id ordering decides rather than input order.
    const tied = results.filter(result => ['a', 'b'].includes(result.listingId))
    expect(tied.map(result => result.listingId)).toEqual(['a', 'b'])
  })

  it('produces the same order when the candidates are shuffled', () => {
    const candidates = [
      candidate({ id: 'a', priceCents: 1000 }),
      candidate({ id: 'b', priceCents: 8000 }),
      candidate({ id: 'c', priceCents: 15000 }),
      candidate({ id: 'd', categoryId: 'other' })
    ]
    const forward = rankCandidates(request(), candidates, DEFAULT_WEIGHTS, NOW).map(r => r.listingId)
    const reversed = rankCandidates(request(), [...candidates].reverse(), DEFAULT_WEIGHTS, NOW).map(r => r.listingId)
    expect(reversed).toEqual(forward)
  })

  it('drops candidates that fail a gate instead of scoring them', () => {
    const results = rankCandidates(
      request(),
      [
        candidate({ id: 'wrong-category', categoryId: 'other' }),
        candidate({ id: 'too-far', latitude: 35 }),
        candidate({ id: 'ok' })
      ],
      DEFAULT_WEIGHTS,
      NOW
    )
    expect(results.map(result => result.listingId)).toEqual(['ok'])
  })

  it('returns an empty ranking when nothing qualifies', () => {
    expect(rankCandidates(request(), [], DEFAULT_WEIGHTS, NOW)).toEqual([])
    expect(rankCandidates(request(), [candidate({ categoryId: 'other' })], DEFAULT_WEIGHTS, NOW)).toEqual([])
  })
})

describe('match engine configuration', () => {
  it('uses the documented defaults when nothing is configured', () => {
    expect(matchWeights({})).toEqual(DEFAULT_WEIGHTS)
  })

  it('reads overrides from the environment', () => {
    const weights = matchWeights({ MATCH_WEIGHT_CATEGORY: '80', MATCH_WEIGHT_KEYWORD: '5' })
    expect(weights.category).toBe(80)
    expect(weights.keyword).toBe(5)
    expect(weights.budget).toBe(DEFAULT_WEIGHTS.budget)
  })

  it('ignores a negative or non-numeric override rather than corrupting the model', () => {
    expect(matchWeights({ MATCH_WEIGHT_BUDGET: '-5' }).budget).toBe(DEFAULT_WEIGHTS.budget)
    expect(matchWeights({ MATCH_WEIGHT_BUDGET: 'abc' }).budget).toBe(DEFAULT_WEIGHTS.budget)
  })

  it('lets a reweighted model change the ranking', () => {
    const candidates = [
      candidate({ id: 'near-far', latitude: 33.9 }),
      candidate({ id: 'close-cheap', latitude: 33.751, priceCents: 5000 })
    ]
    const distanceHeavy = rankCandidates(request(), candidates, matchWeights({ MATCH_WEIGHT_DISTANCE: '90' }), NOW)
    const budgetHeavy = rankCandidates(request(), candidates, matchWeights({ MATCH_WEIGHT_BUDGET: '90' }), NOW)
    expect(distanceHeavy[0].listingId).toBe('close-cheap')
    expect(budgetHeavy[0].listingId).toBe('close-cheap')
  })
})

describe('match engine prefilter', () => {
  it('constrains the query to the request category and budget', () => {
    const prefilter = buildPrefilter(request())
    expect(prefilter.categoryIds).toEqual(['cat-furniture'])
    expect(prefilter.maxPriceCents).toBe(20000)
    // Flexible with no stated floor: no lower bound at all.
    expect(prefilter.minPriceCents).toBeNull()
  })

  it('uses the minimum as the floor only when one is stated', () => {
    const prefilter = buildPrefilter(request({ minBudgetCents: 5000 }))
    expect(prefilter.minPriceCents).toBe(5000)
  })

  it('produces a bounding box only when the requester has coordinates', () => {
    expect(buildPrefilter(request()).boundingBox).toBeDefined()
    expect(buildPrefilter(request({ latitude: null, longitude: null })).boundingBox).toBeUndefined()
  })

  it('builds a box that contains the origin and grows with the radius', () => {
    const tight = boundingBox(33.75, -84.35, 1)
    const wide = boundingBox(33.75, -84.35, 10)
    expect(tight.minLat).toBeLessThan(33.75)
    expect(tight.maxLat).toBeGreaterThan(33.75)
    expect(wide.minLat).toBeLessThan(tight.minLat)
    expect(wide.maxLat).toBeGreaterThan(tight.maxLat)
  })

  it('caps the candidate count so the query is bounded', () => {
    expect(buildPrefilter(request(), 250).limit).toBe(250)
  })
})