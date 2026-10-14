import { Injectable, Logger } from '@nestjs/common'
import { audit } from '../common/logger'
import { PrismaService } from '../prisma/prisma.service'
/** Local namespace for alert keys; not a domain event type. */
const alertKey = (parts: string[]) => ['saved-search-alert', ...parts].join(':')
import { NotificationWorker } from './notification-worker'

/**
 * Saved-search alerts.
 *
 * A new or updated listing is matched against each member's persisted saved
 * searches. This is the deferred Milestone 4 work; the criteria were already
 * stored, and this is the piece that acts on them.
 *
 * Two properties make it safe to re-run:
 *
 * - **Bounded.** Only listings newer than a watermark are evaluated, so a
 *   re-run does not scan the whole table.
 * - **Idempotent.** `SavedSearchAlert.dedupeKey` is unique per
 *   (saved search, listing), so the same listing can never alert the same
 *   member twice even if it is processed again.
 */
@Injectable()
export class SavedSearchAlertWorker {
  private readonly logger = new Logger(SavedSearchAlertWorker.name)
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationWorker
  ) {}

  /**
   * @param sinceOnly evaluate listings created at or after this instant. The
   *   caller passes a watermark so a retry resumes rather than rescans.
   */
  async run(options: { listingId?: string; since?: Date; limit?: number } = {}): Promise<number> {
    if (this.running) return 0
    this.running = true
    try {
      const listings = await this.prisma.listing.findMany({
        where: {
          // Only genuinely available listings can produce an alert.
          status: 'PUBLISHED',
          deletedAt: null,
          ...(options.listingId ? { id: options.listingId } : {}),
          ...(options.since ? { createdAt: { gte: options.since } } : {})
        },
        select: {
          id: true,
          title: true,
          priceCents: true,
          createdAt: true,
          neighborhood: true,
          categoryId: true,
          sellerId: true
        },
        orderBy: { createdAt: 'asc' },
        take: options.limit ?? 200
      })
      if (listings.length === 0) return 0

      // One query for every candidate search, rather than one per listing.
      const searches = await this.prisma.savedSearch.findMany({
        where: { user: { deletedAt: null, status: 'ACTIVE' } },
        select: { id: true, userId: true, query: true, filters: true }
      })
      if (searches.length === 0) return 0

      let created = 0
      for (const listing of listings) {
        for (const search of searches) {
          // Never alert a member about their own listing.
          if (search.userId === listing.sellerId) continue
          const filters = (search.filters ?? {}) as Record<string, unknown>
          if (!this.matches(search.query, listing, filters)) continue
          if (await this.alert(search.userId, search.id, listing)) created += 1
        }
      }
      audit('saved_search.alerts_run', { listings: listings.length, searches: searches.length, created })
      return created
    } finally {
      this.running = false
    }
  }

  /** Same rules the request feed uses, so an alert matches what a search would return. */
  matches(
    query: string,
    listing: { title: string; priceCents: number | null; neighborhood: string | null; categoryId: string },
    filters: Record<string, unknown>
  ): boolean {
    const needle = query.trim().toLowerCase()
    const haystack = `${listing.title}`.toLowerCase()
    // Every term must appear, so extra words narrow rather than widen.
    if (needle && !needle.split(/\s+/).every(term => haystack.includes(term))) return false

    if (typeof filters.categoryId === 'string' && filters.categoryId && filters.categoryId !== listing.categoryId) {
      return false
    }
    if (
      typeof filters.neighborhood === 'string' &&
      filters.neighborhood &&
      String(filters.neighborhood).toLowerCase() !== (listing.neighborhood ?? '').toLowerCase()
    ) {
      return false
    }
    const min = typeof filters.minPriceCents === 'number' ? filters.minPriceCents : null
    const max = typeof filters.maxPriceCents === 'number' ? filters.maxPriceCents : null
    if (min !== null && (listing.priceCents === null || listing.priceCents < min)) return false
    if (max !== null && (listing.priceCents === null || listing.priceCents > max)) return false
    return true
  }

  /** One alert per (search, listing), enforced by the unique index. */
  private async alert(userId: string, savedSearchId: string, listing: { id: string; title: string }) {
    const key = alertKey([savedSearchId, listing.id])
    try {
      await this.prisma.savedSearchAlert.create({
        data: { userId, savedSearchId, listingId: listing.id, dedupeKey: key }
      })
    } catch (error) {
      if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002') {
        return false
      }
      this.logger.error('saved-search alert failed', error as Error)
      return false
    }

    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId },
      select: { savedSearches: true }
    })
    if (preference && preference.savedSearches === false) return true

    await this.notifications.notify({
      userId,
      type: 'saved_search_match',
      title: `New listing matches "${listing.title}"`,
      body: 'A saved search just found something.',
      link: `/listings/${listing.id}`,
      dedupe: [key]
    })
    return true
  }
}
