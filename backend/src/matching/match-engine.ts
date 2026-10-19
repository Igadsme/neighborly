/**
 * Deterministic request-to-listing matching.
 *
 * This is a transparent weighted model, not a model that learned anything.
 * Each signal contributes a bounded score, the weights are configuration,
 * and every contributing signal is returned as a human-readable reason so
 * the UI can explain a ranking instead of showing a bare number.
 *
 * Two properties matter more than cleverness:
 *
 * - **Deterministic.** The same inputs always produce the same order. Ties
 *   are broken by score, then by a stable key, never by chance.
 * - **Explainable.** A reviewer can read the weights and predict the output.
 */

export interface MatchWeights {
  category: number
  keyword: number
  budget: number
  distance: number
  freshness: number
}

export const DEFAULT_WEIGHTS: MatchWeights = {
  category: 40,
  keyword: 25,
  budget: 20,
  distance: 15,
  freshness: 5
}

/** Environment override, so weights can be tuned without a deploy. */
export function matchWeights(env: NodeJS.ProcessEnv = process.env): MatchWeights {
  const read = (name: string, fallback: number) => {
    const parsed = Number(env[name])
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
  }
  return {
    category: read('MATCH_WEIGHT_CATEGORY', DEFAULT_WEIGHTS.category),
    keyword: read('MATCH_WEIGHT_KEYWORD', DEFAULT_WEIGHTS.keyword),
    budget: read('MATCH_WEIGHT_BUDGET', DEFAULT_WEIGHTS.budget),
    distance: read('MATCH_WEIGHT_DISTANCE', DEFAULT_WEIGHTS.distance),
    freshness: read('MATCH_WEIGHT_FRESHNESS', DEFAULT_WEIGHTS.freshness)
  }
}

export interface MatchRequest {
  id: string
  title: string
  description: string
  categoryId: string
  budgetCents: number | null
  minBudgetCents: number | null
  budgetFlexible: boolean
  neighborhood: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  radiusMiles: number
  keywords: string | null
  createdAt: Date
}

export interface MatchCandidate {
  id: string
  categoryId: string
  title: string
  description: string
  priceCents: number | null
  neighborhood: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  createdAt: Date
}

export interface MatchResult {
  listingId: string
  /** 0-100, rounded to two decimals. */
  score: number
  reasons: string[]
}

const EARTH_RADIUS_MILES = 3958.8
const DEG_TO_RAD = Math.PI / 180

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is',
  'it', 'need', 'looking', 'of', 'on', 'or', 'some', 'that', 'the', 'to', 'with', 'within'
])

/** Lowercased, de-duplicated tokens of at least two characters. */
export function tokenize(text: string | null | undefined): string[] {
  if (!text) return []
  const seen = new Set<string>()
  for (const token of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (token.length < 2 || STOP_WORDS.has(token)) continue
    seen.add(token)
  }
  return [...seen]
}

function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (bLat - aLat) * DEG_TO_RAD
  const dLng = (bLng - aLng) * DEG_TO_RAD
  const lat1 = aLat * DEG_TO_RAD
  const lat2 = bLat * DEG_TO_RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Database-level prefilter. Ranking runs only on candidates this can return,
 * so the expensive part of the engine never sees the whole table.
 */
export interface MatchPrefilter {
  categoryIds?: string[]
  minPriceCents?: number | null
  maxPriceCents?: number | null
  /** Bounding box for the radius, so the query is an index range scan. */
  boundingBox?: { minLat: number; maxLat: number; minLng: number; maxLng: number }
  limit: number
}

export function buildPrefilter(request: MatchRequest, limit = 200): MatchPrefilter {
  const box =
    request.latitude !== null && request.longitude !== null
      ? boundingBox(request.latitude, request.longitude, request.radiusMiles)
      : undefined

  return {
    categoryIds: [request.categoryId],
    minPriceCents: request.budgetFlexible ? request.minBudgetCents : request.budgetCents,
    maxPriceCents: request.budgetCents,
    boundingBox: box,
    limit
  }
}

export function boundingBox(lat: number, lng: number, radiusMiles: number) {
  const latDelta = radiusMiles / 69.0
  const lngDelta = radiusMiles / (Math.cos(lat * DEG_TO_RAD) || 0.01)
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta
  }
}

/**
 * Scores one candidate. Pure and synchronous, which is what makes the whole
 * engine unit-testable without a database.
 */
export function scoreCandidate(
  request: MatchRequest,
  candidate: MatchCandidate,
  weights: MatchWeights = DEFAULT_WEIGHTS,
  now: Date = new Date()
): MatchResult | null {
  const reasons: string[] = []

  // Category is a gate, not a weight: a different category is never a match,
  // and scoring it would let a strong keyword hit leak an irrelevant item.
  if (candidate.categoryId !== request.categoryId) return null

  const budget = budgetSignal(request, candidate)
  if (budget === null) return null
  if (budget.reason) reasons.push(budget.reason)

  const keyword = keywordSignal(request, candidate)
  if (keyword.reason) reasons.push(keyword.reason)

  const distance = distanceSignal(request, candidate)
  if (distance === null) return null
  if (distance.reason) reasons.push(distance.reason)

  const freshness = freshnessSignal(candidate, now)

  const raw =
    weights.category +
    keyword.fraction * weights.keyword +
    budget.fraction * weights.budget +
    distance.fraction * weights.distance +
    freshness * weights.freshness

  // Normalize to 0-100 against the maximum the weights allow.
  const maxRaw =
    weights.category +
    weights.keyword +
    weights.budget +
    weights.distance +
    weights.freshness
  const score = maxRaw === 0 ? 0 : Math.round(Math.min(100, (raw / maxRaw) * 100) * 100) / 100

  return { listingId: candidate.id, score, reasons }
}

function budgetSignal(request: MatchRequest, candidate: MatchCandidate): { fraction: number; reason?: string } | null {
  const price = candidate.priceCents
  if (request.budgetCents === null && request.minBudgetCents === null) {
    // No budget stated: the signal neither helps nor disqualifies.
    return { fraction: 0.5 }
  }
  if (price === null) {
    // Price is negotiable and the request is flexible, so this is still a
    // candidate rather than a rejection.
    return request.budgetFlexible ? { fraction: 0.5, reason: 'Price is negotiable' } : { fraction: 0.5 }
  }
  if (request.budgetCents !== null && price <= request.budgetCents) {
    // Cheaper is better for the requester, so the fraction falls as the price
    // approaches the ceiling. A price of zero still scores well rather than
    // saturating, since an implausibly cheap item is not a match signal.
    const shareOfBudget =
      request.budgetCents === 0 ? 0 : Math.min(1, Math.max(0, price / request.budgetCents))
    return { fraction: 1 - 0.4 * shareOfBudget, reason: `Within budget at ${formatCents(price)}` }
  }
  if (request.budgetFlexible && request.minBudgetCents !== null && price >= request.minBudgetCents) {
    return { fraction: 0.4, reason: `Above budget but flexible from ${formatCents(request.minBudgetCents)}` }
  }
  // Outside a non-flexible budget: not a candidate at all.
  return null
}

function keywordSignal(request: MatchRequest, candidate: MatchCandidate): { fraction: number; reason?: string } {
  const want = new Set([
    ...tokenize(request.title),
    ...tokenize(request.keywords),
    // Description tokens are included but weighted less by repetition below.
    ...tokenize(request.description)
  ])
  if (want.size === 0) return { fraction: 0.4 }

  const have = new Set([...tokenize(candidate.title), ...tokenize(candidate.description)])
  let hits = 0
  for (const token of want) if (have.has(token)) hits += 1
  const fraction = hits / want.size
  if (hits === 0) return { fraction: 0 }
  return { fraction, reason: `${hits} keyword${hits === 1 ? '' : 's'} in common` }
}

function distanceSignal(
  request: MatchRequest,
  candidate: MatchCandidate
): { fraction: number; reason?: string } | null {
  if (request.latitude === null || request.longitude === null) {
    // Without an origin there is no distance gate; a matching neighborhood or
    // city is still a useful hint.
    if (request.neighborhood && candidate.neighborhood) {
      const same = request.neighborhood.toLowerCase() === candidate.neighborhood.toLowerCase()
      return { fraction: same ? 0.8 : 0.3, reason: same ? `Also in ${request.neighborhood}` : undefined }
    }
    return { fraction: 0.4 }
  }
  if (candidate.latitude === null || candidate.longitude === null) return { fraction: 0.4 }

  const miles = haversineMiles(request.latitude, request.longitude, candidate.latitude, candidate.longitude)
  // Beyond the requester's stated radius the listing is not a candidate.
  if (miles > request.radiusMiles) return null
  const fraction = Math.max(0, 1 - miles / Math.max(1, request.radiusMiles))
  return {
    fraction,
    reason: `${formatMiles(miles)} away`
  }
}

function freshnessSignal(candidate: MatchCandidate, now: Date): number {
  const ageDays = (now.getTime() - candidate.createdAt.getTime()) / 86_400_000
  if (ageDays <= 7) return 1
  if (ageDays <= 30) return 0.7
  if (ageDays <= 90) return 0.4
  return 0.1
}

/**
 * Ranks candidates. Sorting is by score then by listing id, so equal scores
 * always come back in the same order.
 */
export function rankCandidates(
  request: MatchRequest,
  candidates: MatchCandidate[],
  weights: MatchWeights = DEFAULT_WEIGHTS,
  now: Date = new Date()
): MatchResult[] {
  return candidates
    .map(candidate => scoreCandidate(request, candidate, weights, now))
    .filter((result): result is MatchResult => result !== null)
    .sort((a, b) => b.score - a.score || a.listingId.localeCompare(b.listingId))
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`
}

export function formatMiles(miles: number): string {
  if (miles < 0.1) return '< 0.1 mi'
  return `${miles.toFixed(1)} mi`
}