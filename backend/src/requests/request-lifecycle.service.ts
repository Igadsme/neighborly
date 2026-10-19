import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, RequestStatus } from '@prisma/client'
import { audit } from '../common/logger'
import { activeAccountWhere } from '../common/active-account'
import { assertGeoQuery, ilikeContains, orderByIds, pageWithinRadius } from '../common/geo-search'
import { publicUserSelect } from '../common/public-user.select'
import { sanitizeOptional, sanitizeText } from '../common/text'
import { DOMAIN_EVENTS } from '../events/domain-events'
import { OutboxWriter } from '../events/outbox-writer'
import {
  MatchCandidate,
  MatchRequest,
  buildPrefilter,
  matchWeights,
  rankCandidates
} from '../matching/match-engine'
import { PrismaService } from '../prisma/prisma.service'
import { canTransition, isExpired } from './request-state'
import { SaveRequestDraftDto } from './dto'

/**
 * Coordinates are never returned to anyone but the requester. Public
 * projections expose a coarse location and a distance, matching the listing
 * rule established in Milestone 4.
 */
const publicRequestSelect = {
  id: true,
  categoryId: true,
  title: true,
  description: true,
  budgetCents: true,
  minBudgetCents: true,
  budgetFlexible: true,
  requirements: true,
  neighborhood: true,
  city: true,
  radiusMiles: true,
  deadline: true,
  urgency: true,
  mode: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  statusChangedAt: true,
  fulfilledAt: true,
  category: true,
  requester: { select: publicUserSelect }
} satisfies Prisma.NeedRequestSelect

/** Extras the requester alone may see. */
const ownerOnlyFields = {
  requesterId: true,
  latitude: true,
  longitude: true
} satisfies Prisma.NeedRequestSelect

@Injectable()
export class RequestLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxWriter
  ) {}

  // ----------------------------------------------------------------- discovery

  /**
   * Public feed with server-side filtering, sorting, and pagination.
   * Returns an envelope so the client can paginate without a second count.
   */
  async list(query: {
    query?: string
    categoryId?: string
    status?: RequestStatus
    mode?: string
    urgency?: string
    minBudgetCents?: number
    maxBudgetCents?: number
    city?: string
    neighborhood?: string
    latitude?: number
    longitude?: number
    radiusMiles?: number
    openOnly?: boolean
    sort?: string
    limit?: number
    offset?: number
  }) {
    const origin = assertGeoQuery(query)
    const limit = clamp(query.limit)
    const offset = query.offset ?? 0
    if (origin) {
      const page = await pageWithinRadius(this.prisma, 'NeedRequest', origin, this.radiusExtra(query), limit, offset)
      if (page.ids.length === 0) return { items: [], total: page.total, limit, offset }
      const rows = await this.prisma.needRequest.findMany({
        where: { id: { in: page.ids } },
        select: { ...publicRequestSelect, latitude: true, longitude: true }
      })
      return {
        items: orderByIds(rows, page.ids).map(row => this.decorate(row)),
        total: page.total,
        limit,
        offset
      }
    }
    const where = this.publicWhere(query)

    const [rows, total] = await Promise.all([
      this.prisma.needRequest.findMany({
        where,
        select: { ...publicRequestSelect, latitude: true, longitude: true },
        orderBy: this.orderBy(query.sort, query.query),
        take: limit,
        skip: offset
      }),
      this.prisma.needRequest.count({ where })
    ])

    return {
      items: rows.map(row => this.decorate(row)),
      total,
      limit,
      offset
    }
  }

  /** Public read. Drafts are never visible here, to anyone. */
  async get(id: string, viewerId?: string) {
    const row = await this.prisma.needRequest.findFirst({
      where: {
        id,
        deletedAt: null,
        status: { notIn: [RequestStatus.DRAFT, RequestStatus.CANCELLED] },
        requester: activeAccountWhere
      },
      select: { ...publicRequestSelect, ...ownerOnlyFields }
    })
    if (!row) throw new NotFoundException('Request not found')
    return this.decorate(row, viewerId)
  }

  /** Owner read: includes drafts and the requester's own coordinates. */
  async getForOwner(userId: string, id: string) {
    const row = await this.prisma.needRequest.findFirst({
      where: { id, requesterId: userId, deletedAt: null },
      select: { ...publicRequestSelect, ...ownerOnlyFields, offers: { select: { id: true, status: true } } }
    })
    if (!row) throw new NotFoundException('Request not found')
    return this.decorate(row, userId)
  }

  async listMine(userId: string, query: { status?: RequestStatus; limit?: number; offset?: number }) {
    return this.prisma.needRequest.findMany({
      where: {
        requesterId: userId,
        deletedAt: null,
        ...(query.status ? { status: query.status } : { status: { not: RequestStatus.CANCELLED } })
      },
      select: { ...publicRequestSelect, ...ownerOnlyFields, offers: { select: { id: true, status: true } } },
      orderBy: { updatedAt: 'desc' },
      take: clamp(query.limit),
      skip: query.offset ?? 0
    })
  }

  async statusHistory(userId: string, id: string) {
    await this.assertOwner(userId, id)
    return this.prisma.requestStatusEvent.findMany({
      where: { requestId: id },
      orderBy: { createdAt: 'asc' },
      select: { fromStatus: true, toStatus: true, note: true, createdAt: true }
    })
  }

  // ----------------------------------------------------------------- lifecycle

  async create(requesterId: string, input: Record<string, unknown> | object, publish = true) {
    const status = publish ? RequestStatus.PUBLISHED : RequestStatus.DRAFT
    const data = this.buildData(input as Record<string, unknown>)
    await this.ensureDraftCategory()

    const request = await this.prisma.$transaction(async tx => {
      const created = await tx.needRequest.create({
        // `data` is built by buildData and always carries the required
        // columns for a create; the cast keeps that fact in one place.
        data: { ...data, requesterId, status, statusChangedAt: new Date() } as Prisma.NeedRequestUncheckedCreateInput,
        select: { ...publicRequestSelect, ...ownerOnlyFields }
      })
      await tx.requestStatusEvent.create({
        data: { requestId: created.id, toStatus: status, actorId: requesterId }
      })
      if (publish) {
        await this.outbox.record(
          DOMAIN_EVENTS.requestCreated,
          {
            requestId: created.id,
            requesterId,
            categoryId: created.categoryId,
            title: created.title
          },
          { actorId: requesterId, dedupe: [created.id] },
          tx
        )
      }
      return created
    })

    audit('request.create', { requesterId, requestId: request.id, status })
    return this.decorate(request, requesterId)
  }

  /**
   * Creates a draft in one call, for the wizard's first step.
   *
   * `title` and `description` are non-null columns, so a wizard that has not
   * typed anything yet gets placeholder copy. That is safe precisely because
   * a draft is private and the publish path re-validates both fields: the
   * placeholder never reaches a public row.
   */
  saveDraft(requesterId: string, input: SaveRequestDraftDto) {
    return this.create(
      requesterId,
      {
        title: 'Untitled draft',
        description: 'Draft description pending.',
        ...input,
        mode: input.mode ?? 'BUY',
        categoryId: input.categoryId ?? DRAFT_CATEGORY
      },
      false
    )
  }

  /**
   * Updates a request. A published request keeps its status, so editing
   * never silently re-opens or closes it; expiry is re-evaluated separately
   * by `transition`.
   */
  async update(userId: string, id: string, input: object) {
    const existing = await this.assertOwner(userId, id)
    if (existing.status === RequestStatus.CANCELLED || existing.status === RequestStatus.FULFILLED) {
      throw new BadRequestException(`A ${existing.status.toLowerCase()} request can no longer be edited`)
    }
    const data = this.buildData(input as Record<string, unknown>, { partial: true })

    const updated = await this.prisma.$transaction(async tx => {
      const row = await tx.needRequest.update({
        where: { id },
        data,
        select: { ...publicRequestSelect, ...ownerOnlyFields }
      })
      await this.outbox.record(
        DOMAIN_EVENTS.requestUpdated,
        { requestId: id, requesterId: userId },
        { actorId: userId },
        tx
      )
      return row
    })
    audit('request.update', { userId, requestId: id })
    return this.decorate(updated, userId)
  }

  /**
   * The single place a request's status changes. The state machine decides
   * whether the move is legal, the write is conditional so two concurrent
   * transitions cannot both win, and the history row and outbox event are
   * written in the same transaction.
   */
  async transition(userId: string, id: string, to: RequestStatus, note?: string) {
    const existing = await this.assertOwner(userId, id)
    if (existing.status === to) return this.decorate(existing, userId)

    if (!canTransition(existing.status, to)) {
      throw new BadRequestException(`Invalid request transition: ${existing.status} -> ${to}`)
    }

    const now = new Date()
    const result = await this.prisma.$transaction(async tx => {
      // Conditional write keyed on the observed status: a concurrent
      // transition that already committed makes this a no-op, so a stale
      // request can never overwrite a newer state.
      const claimed = await tx.needRequest.updateMany({
        where: { id, status: existing.status },
        data: {
          status: to,
          statusChangedAt: now,
          updatedAt: now,
          ...(to === RequestStatus.FULFILLED ? { fulfilledAt: now } : {})
        }
      })
      if (claimed.count === 0) {
        throw new BadRequestException(
          `Request state changed: expected ${existing.status}. Reload and try again.`
        )
      }

      await tx.requestStatusEvent.create({
        data: { requestId: id, fromStatus: existing.status, toStatus: to, actorId: userId, note }
      })

      const row = await tx.needRequest.update({
        where: { id },
        data: {
          // A published request that lost its deadline closes on the same
          // transition, rather than lingering as an unfillable request.
          ...(to === RequestStatus.FULFILLED ? { fulfilledAt: now } : {})
        },
        select: { ...publicRequestSelect, ...ownerOnlyFields }
      })

      await this.outbox.record(
        to === RequestStatus.FULFILLED ? DOMAIN_EVENTS.requestFulfilled : DOMAIN_EVENTS.requestStatusChanged,
        { requestId: id, requesterId: userId, from: existing.status, to },
        { actorId: userId, dedupe: [id, existing.status, to] },
        tx
      )
      return row
    })

    audit('request.transition', { userId, requestId: id, from: existing.status, to })
    return this.decorate(result, userId)
  }

  /**
   * Closes a published request whose deadline has passed. Called lazily on
   * read and from the transition endpoint; safe to run repeatedly because
   * the write is conditional.
   */
  async expireIfPastDeadline(id: string) {
    const row = await this.prisma.needRequest.findUnique({ where: { id }, select: { status: true, deadline: true } })
    if (!row || !isExpired(row)) return
    await this.prisma.$transaction(async tx => {
      const claimed = await tx.needRequest.updateMany({
        where: { id, status: row.status },
        data: { status: RequestStatus.EXPIRED, statusChangedAt: new Date(), updatedAt: new Date() }
      })
      if (claimed.count === 0) return
      await tx.requestStatusEvent.create({
        data: { requestId: id, fromStatus: row.status, toStatus: RequestStatus.EXPIRED }
      })
    })
  }

  // ----------------------------------------------------------------- matching

  /**
   * Ranked matches for a request the caller owns. Candidates are
   * prefiltered in SQL, then scored in memory, then persisted so the
   * ranking is reproducible and explainable.
   */
  async matches(userId: string, requestId: string, limit = 20) {
    const request = await this.assertOwner(userId, requestId)
    const engineRequest = this.toEngineRequest(request)
    const prefilter = buildPrefilter(engineRequest, 300)

    const candidates = await this.prisma.listing.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        seller: activeAccountWhere,
        // The requester is never shown their own items as a match.
        sellerId: { not: userId },
        categoryId: { in: prefilter.categoryIds ?? [request.categoryId] },
        ...(prefilter.minPriceCents != null || prefilter.maxPriceCents != null
          ? {
              priceCents: {
                ...(prefilter.minPriceCents != null ? { gte: prefilter.minPriceCents } : {}),
                ...(prefilter.maxPriceCents != null ? { lte: prefilter.maxPriceCents } : {})
              }
            }
          : {}),
        ...(prefilter.boundingBox
          ? {
              latitude: { gte: prefilter.boundingBox.minLat, lte: prefilter.boundingBox.maxLat },
              longitude: { gte: prefilter.boundingBox.minLng, lte: prefilter.boundingBox.maxLng }
            }
          : {}),
        // A blocked member's listings are not a match for anyone.
        ...(await this.blockedSellerFilter(userId))
      },
      select: {
        id: true,
        categoryId: true,
        title: true,
        description: true,
        priceCents: true,
        neighborhood: true,
        city: true,
        latitude: true,
        longitude: true,
        createdAt: true
      },
      take: prefilter.limit
    })

    const ranked = rankCandidates(
      engineRequest,
      candidates as MatchCandidate[],
      matchWeights()
    ).slice(0, Math.min(limit, 100))

    // Persist the ranking so a reload shows the same order and the reasons
    // are available to the client without recomputing.
    await this.prisma.$transaction(async tx => {
      await tx.requestMatch.deleteMany({ where: { requestId } })
      if (ranked.length === 0) return
      await tx.requestMatch.createMany({
        data: ranked.map((match, index) => ({
          requestId,
          listingId: match.listingId,
          // Prisma.Decimal from a number keeps the column type exact.
          score: new Prisma.Decimal(match.score),
          reasons: match.reasons as unknown as Prisma.InputJsonValue,
          rank: index + 1
        }))
      })
    })

    return this.attachListings(ranked)
  }

  // ------------------------------------------------------------------- helpers

  private async assertOwner(userId: string, id: string) {
    const request = await this.prisma.needRequest.findFirst({
      where: { id, requesterId: userId, deletedAt: null },
      select: { ...publicRequestSelect, ...ownerOnlyFields }
    })
    if (!request) throw new NotFoundException('Request not found')
    return request
  }

  /**
   * A wizard may create a draft before a category is chosen, but the column
   * is a required foreign key, so the placeholder row is created on demand.
   */
  private async ensureDraftCategory() {
    await this.prisma.category.upsert({
      where: { id: DRAFT_CATEGORY },
      update: {},
      create: { id: DRAFT_CATEGORY, name: 'Unsorted draft', slug: 'unsorted-draft' }
    })
  }

  private buildData(input: Record<string, unknown>, options: { partial?: boolean } = {}) {
    const partial = options.partial ?? false
    const text = (value: unknown) => sanitizeText(String(value), partial ? 5000 : 140)
    const data: Record<string, unknown> = {}

    if (input.categoryId !== undefined) data.categoryId = input.categoryId
    if (input.title !== undefined) data.title = text(input.title)
    if (input.description !== undefined) data.description = sanitizeText(String(input.description), 5000)
    if (input.budgetCents !== undefined) data.budgetCents = input.budgetCents
    if (input.minBudgetCents !== undefined) data.minBudgetCents = input.minBudgetCents
    if (input.budgetFlexible !== undefined) data.budgetFlexible = input.budgetFlexible
    if (input.requirements !== undefined) data.requirements = input.requirements as Prisma.InputJsonValue
    if (input.latitude !== undefined) data.latitude = input.latitude
    if (input.longitude !== undefined) data.longitude = input.longitude
    if (input.neighborhood !== undefined) data.neighborhood = sanitizeOptional(String(input.neighborhood), 80)
    if (input.city !== undefined) data.city = sanitizeOptional(String(input.city), 80)
    if (input.radiusMiles !== undefined) data.radiusMiles = input.radiusMiles
    if (input.deadline !== undefined) data.deadline = input.deadline ? new Date(String(input.deadline)) : null
    if (input.urgency !== undefined) data.urgency = sanitizeOptional(String(input.urgency), 80)
    if (input.mode !== undefined) data.mode = input.mode
    return data
  }

  private publicWhere(query: {
    query?: string
    categoryId?: string
    status?: RequestStatus
    mode?: string
    urgency?: string
    minBudgetCents?: number
    maxBudgetCents?: number
    city?: string
    neighborhood?: string
    latitude?: number
    longitude?: number
    radiusMiles?: number
    openOnly?: boolean
  }): Prisma.NeedRequestWhereInput {
    const search = query.query?.trim()
    return {
      // A draft is never public; anything the caller explicitly asks for is
      // still intersected with the publishable set.
      status: query.status && query.status !== RequestStatus.DRAFT ? query.status : RequestStatus.PUBLISHED,
      deletedAt: null,
      requester: activeAccountWhere,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.mode ? { mode: query.mode as Prisma.EnumExchangeModeFilter } : {}),
      ...(query.urgency ? { urgency: query.urgency } : {}),
      ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
      ...(query.neighborhood ? { neighborhood: { equals: query.neighborhood, mode: 'insensitive' } } : {}),
      ...(query.minBudgetCents !== undefined || query.maxBudgetCents !== undefined
        ? {
            budgetCents: {
              ...(query.minBudgetCents !== undefined ? { gte: query.minBudgetCents } : {}),
              ...(query.maxBudgetCents !== undefined ? { lte: query.maxBudgetCents } : {})
            }
          }
        : {}),
      ...(query.openOnly ? { OR: [{ deadline: null }, { deadline: { gte: new Date() } }] } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { neighborhood: { contains: search, mode: 'insensitive' } }
            ]
          }
        : {})
    }
  }

  private radiusExtra(query: {
    status?: RequestStatus
    categoryId?: string
    mode?: string
    urgency?: string
    minBudgetCents?: number
    maxBudgetCents?: number
    city?: string
    neighborhood?: string
    openOnly?: boolean
    query?: string
  }): Prisma.Sql {
    const status = query.status && query.status !== RequestStatus.DRAFT ? query.status : RequestStatus.PUBLISHED
    const parts: Prisma.Sql[] = [Prisma.sql`row.status::text = ${status}`]
    if (query.categoryId) parts.push(Prisma.sql`row."categoryId" = CAST(${query.categoryId} AS uuid)`)
    if (query.mode) parts.push(Prisma.sql`row.mode::text = ${query.mode}`)
    if (query.urgency) parts.push(Prisma.sql`row.urgency = ${query.urgency}`)
    if (query.city) parts.push(Prisma.sql`LOWER(row.city) = LOWER(${query.city})`)
    if (query.neighborhood) parts.push(Prisma.sql`LOWER(row.neighborhood) = LOWER(${query.neighborhood})`)
    if (query.minBudgetCents !== undefined) parts.push(Prisma.sql`row."budgetCents" >= ${query.minBudgetCents}`)
    if (query.maxBudgetCents !== undefined) parts.push(Prisma.sql`row."budgetCents" <= ${query.maxBudgetCents}`)
    if (query.openOnly) parts.push(Prisma.sql`(row.deadline IS NULL OR row.deadline >= ${new Date()})`)
    const search = query.query?.trim()
    if (search) {
      parts.push(Prisma.sql`(
        ${ilikeContains('row.title', search)}
        OR ${ilikeContains('row.description', search)}
        OR ${ilikeContains('row.neighborhood', search)}
      )`)
    }
    return Prisma.join(parts, ' AND ')
  }

  private orderBy(sort: string | undefined, search?: string): Prisma.NeedRequestOrderByWithRelationInput[] {
    switch (sort) {
      case 'oldest':
        return [{ createdAt: 'asc' as const }, { id: 'asc' as const }]
      case 'deadline':
        // Requests with no deadline sort last rather than as year zero.
        return [
          { deadline: { sort: 'asc' as const, nulls: 'last' as const } },
          { id: 'asc' as const }
        ]
      case 'budget_asc':
        return [
          { budgetCents: { sort: 'asc' as const, nulls: 'last' as const } },
          { id: 'asc' as const }
        ]
      case 'budget_desc':
        return [
          { budgetCents: { sort: 'desc' as const, nulls: 'last' as const } },
          { id: 'asc' as const }
        ]
      case 'relevance':
        // Relevance ranks a title match above a description match.
        return (
          search
            ? [
                { title: { sort: 'desc' } },
                { description: { sort: 'desc' } },
                { createdAt: 'desc' },
                { id: 'desc' }
              ]
            : [{ createdAt: 'desc' }, { id: 'desc' }]
        ) as Prisma.NeedRequestOrderByWithRelationInput[]
      default:
        return [{ createdAt: 'desc' as const }, { id: 'desc' as const }]
    }
  }

  /**
   * Strips coordinates and adds the coarse location. Only the requester sees
   * their own exact position, and even then it stays in this service.
   */
  private decorate<T extends { latitude?: unknown; longitude?: unknown; requesterId?: string }>(
    row: T,
    viewerId?: string
  ) {
    const isOwner = viewerId !== undefined && row.requesterId === viewerId
    const { latitude, longitude, requesterId, ...rest } = row
    const lat = toNumber(latitude)
    const lng = toNumber(longitude)
    const hasCoords = lat !== null && lng !== null
    return {
      ...rest,
      hasCoordinates: hasCoords,
      approximateLocation: hasCoords ? { lat: round1(lat), lng: round1(lng) } : null,
      // The requester is told their own coordinates are stored; nobody else
      // is, and nobody else receives the values.
      ...(isOwner ? { coordinatesShared: true } : {})
    }
  }

  private toEngineRequest(row: {
    id: string
    title: string
    description: string
    categoryId: string
    budgetCents: number | null
    minBudgetCents: number | null
    budgetFlexible: boolean
    neighborhood: string | null
    city: string | null
    latitude: unknown
    longitude: unknown
    radiusMiles: number
    createdAt: Date
    requirements?: unknown
  }): MatchRequest {
    const requirements = (row.requirements ?? {}) as { keywords?: string }
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      categoryId: row.categoryId,
      budgetCents: row.budgetCents,
      minBudgetCents: row.minBudgetCents,
      budgetFlexible: row.budgetFlexible,
      neighborhood: row.neighborhood,
      city: row.city,
      latitude: toNumber(row.latitude),
      longitude: toNumber(row.longitude),
      radiusMiles: row.radiusMiles,
      keywords: requirements.keywords ?? null,
      createdAt: row.createdAt
    }
  }

  private async blockedSellerFilter(userId: string) {
    const blocks = await this.prisma.blockedUser.findMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
      select: { blockerId: true, blockedId: true }
    })
    if (blocks.length === 0) return {}
    const otherIds = blocks.map(block => (block.blockerId === userId ? block.blockedId : block.blockerId))
    return { sellerId: { notIn: [userId, ...otherIds] } }
  }

  private async attachListings(ranked: Array<{ listingId: string; score: number; reasons: string[] }>) {
    if (ranked.length === 0) return []
    const listings = await this.prisma.listing.findMany({
      where: { id: { in: ranked.map(match => match.listingId) } },
      select: {
        id: true,
        title: true,
        priceCents: true,
        condition: true,
        neighborhood: true,
        city: true,
        createdAt: true,
        images: { orderBy: { sortOrder: 'asc' }, select: { id: true, objectKey: true, sortOrder: true } },
        seller: { select: publicUserSelect }
      }
    })
    const byId = new Map(listings.map(listing => [listing.id, listing]))
    return ranked
      .map(match => {
        const listing = byId.get(match.listingId)
        if (!listing) return null
        return {
          listingId: match.listingId,
          score: match.score,
          reasons: match.reasons,
          listing: {
            ...listing,
            images: listing.images.map(image => ({
              ...image,
              url: mediaUrl(image)
            }))
          }
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)
  }
}

/**
 * A draft created without a category still needs a valid foreign key. This
 * placeholder is created on demand and never shown publicly.
 */
export const DRAFT_CATEGORY = '00000000-0000-4000-8000-000000000000'

export function mediaUrl(image: { objectKey: string }) {
  const [, listingId, file] = image.objectKey.split('/')
  return listingId && file ? `/api/v1/media/listings/${listingId}/${file}` : ''
}

function clamp(limit?: number) {
  if (limit === undefined) return 24
  return Math.min(Math.max(limit, 1), 100)
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'object' && 'toNumber' in value) {
    const parsed = (value as { toNumber: () => number }).toNumber()
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}