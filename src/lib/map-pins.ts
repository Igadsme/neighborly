/** Painted-map centroids. Pins never use listing or profile coordinates. */
export const PAINTED_NEIGHBORHOODS = [
  { name: "Inman Park", x: 55, y: 40 },
  { name: "Decatur", x: 72, y: 35 },
  { name: "Midtown", x: 42, y: 32 },
  { name: "Buckhead", x: 35, y: 18 },
  { name: "Grant Park", x: 58, y: 55 },
  { name: "East ATL", x: 68, y: 58 },
  { name: "Westside", x: 22, y: 42 },
] as const

const ALIASES: Record<string, string> = {
  "east atlanta": "East ATL",
  "east atlanta village": "East ATL",
}

function hash(value: string) {
  let h = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function centroid(neighborhood: string | null | undefined, city: string | null | undefined) {
  const raw = (neighborhood ?? "").trim().toLowerCase()
  const aliased = (ALIASES[raw] ?? raw).toLowerCase()
  const match = PAINTED_NEIGHBORHOODS.find((entry) => entry.name.toLowerCase() === aliased)
  if (match) return { x: match.x, y: match.y }
  const key = `${raw}|${(city ?? "").trim().toLowerCase()}`
  return {
    x: 15 + (hash(key) % 70),
    y: 15 + (hash(`${key}#y`) % 65),
  }
}

export function isPaintedNeighborhood(name: string | null | undefined) {
  const raw = (name ?? "").trim().toLowerCase()
  if (!raw) return false
  const aliased = (ALIASES[raw] ?? raw).toLowerCase()
  return PAINTED_NEIGHBORHOODS.some((entry) => entry.name.toLowerCase() === aliased)
}

/** Percent position on the painted map. Offset comes from the listing id, not from lat/long. */
export function pinPosition(listing: {
  id: string
  neighborhood?: string | null
  city?: string | null
}) {
  const base = centroid(listing.neighborhood, listing.city)
  const jitter = hash(listing.id)
  const dx = (jitter % 9) - 4
  const dy = ((jitter >>> 8) % 9) - 4
  return {
    x: clamp(base.x + dx, 8, 92),
    y: clamp(base.y + dy, 8, 92),
  }
}
