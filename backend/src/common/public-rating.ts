import { PrismaService } from '../prisma/prisma.service'

/**
 * Public rating on a housing or service card.
 *
 * `rating` is null when there is no published review, and it is never 0.
 * A stored `ServiceListing.rating` column is not a source: only published,
 * unhidden reviews of the owner are. `reviewCount` is 0 in that same case.
 */
export type PublicRating = {
  rating: number | null
  reviewCount: number
}

export const EMPTY_RATING: PublicRating = { rating: null, reviewCount: 0 }

export function toPublicRating(count: number, average: number | null): PublicRating {
  if (!Number.isFinite(count) || count <= 0) return EMPTY_RATING
  if (average == null || !Number.isFinite(average)) return { rating: null, reviewCount: count }
  const rounded = Math.round(average * 10) / 10
  if (rounded <= 0) return { rating: null, reviewCount: count }
  return { rating: rounded, reviewCount: count }
}

export async function ratingsForOwners(prisma: PrismaService, ownerIds: string[]): Promise<Map<string, PublicRating>> {
  const unique = [...new Set(ownerIds.filter(id => id.length > 0))]
  const summaries = new Map<string, PublicRating>()
  for (const id of unique) summaries.set(id, EMPTY_RATING)
  if (unique.length === 0) return summaries

  const rows = await prisma.review.groupBy({
    by: ['subjectId'],
    where: { subjectId: { in: unique }, status: 'PUBLISHED', hiddenAt: null },
    _avg: { rating: true },
    _count: { _all: true }
  })
  for (const row of rows) {
    summaries.set(row.subjectId, toPublicRating(row._count._all, row._avg.rating))
  }
  return summaries
}

export function publicRating(summaries: Map<string, PublicRating>, ownerId: string | undefined): PublicRating {
  if (!ownerId) return EMPTY_RATING
  return summaries.get(ownerId) ?? EMPTY_RATING
}
