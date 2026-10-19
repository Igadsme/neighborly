import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { ListingStatus, Prisma } from '@prisma/client'
import { activeAccountWhere } from '../common/active-account'
import { assertGeoQuery, ilikeContains, orderByIds, pageWithinRadius } from '../common/geo-search'
import { publicUserSelect } from '../common/public-user.select'
import { sanitizeOptional, sanitizeText } from '../common/text'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import {
  AttachImagesDto,
  CreateListingDto,
  ListListingsQuery,
  MAX_LISTING_IMAGES,
  MyListingsQuery,
  ReorderImagesDto,
  SaveSearchDto,
  UpdateListingDto,
  UpdateSavedSearchDto
} from './dto'

const publicSeller = { select: publicUserSelect }

/**
 * Coordinates are deliberately absent from the public projection. A
 * seller's exact address is never public; `distanceMiles` and a rounded
 * `approximateLocation` are computed per request instead.
 */
const publicListingSelect = {
  id: true,
  sellerId: true,
  categoryId: true,
  title: true,
  description: true,
  priceCents: true,
  condition: true,
  status: true,
  neighborhood: true,
  city: true,
  radiusMiles: true,
  pickupAvailable: true,
  deliveryAvailable: true,
  shippingAvailable: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  category: true,
  seller: publicSeller
} satisfies Prisma.ListingSelect

const listingWithImages = {
  select: { ...publicListingSelect, images: { orderBy: { sortOrder: 'asc' as const } } }
}

type ListingWithImagesSelect = typeof listingWithImages.select

/** Earth radius in miles, used for the bounding-box prefilter. */
const EARTH_RADIUS_MILES = 3958.8
const DEG_TO_RAD = Math.PI / 180

function distanceMiles(aLat: number, aLng: number, bLat: number, bLng: number) {
  const dLat = (bLat - aLat) * DEG_TO_RAD
  const dLng = (bLng - aLng) * DEG_TO_RAD
  const lat1 = aLat * DEG_TO_RAD
  const lat2 = bLat * DEG_TO_RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2)
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Rounds to one decimal place, which is roughly a tenth of a mile. */
function round1(value: number) {
  return Math.round(value * 10) / 10
}

/**
 * Reduces a coordinate to a ~1km grid cell. Two listings in the same cell
 * share a value, which is enough for a map marker without revealing an
 * address.
 */
function approximate(lat: number, lng: number) {
  return { lat: round1(lat), lng: round1(lng) }
}

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService
  ) {}

  // ------------------------------------------------------------------ discovery

  /**
   * Server-side filtering, sorting, and pagination. `total` lets the client
   * paginate without a second count query of its own.
   */
  async list(query: ListListingsQuery) {
    const origin = assertGeoQuery(query)
    const limit = clampLimit(query.limit)
    const offset = query.offset ?? 0
    if (origin) {
      const page = await pageWithinRadius(this.prisma, 'Listing', origin, this.radiusExtra(query), limit, offset)
      if (page.ids.length === 0) return { items: [], total: page.total, limit, offset }
      const rows = await this.prisma.listing.findMany({
        where: { id: { in: page.ids } },
        select: { ...listingWithImages.select, latitude: true, longitude: true }
      })
      const items = orderByIds(rows, page.ids).map(listing =>
        this.decorate(this.withDistance(listing, query, page.distances.get(listing.id) ?? null))
      )
      return { items, total: page.total, limit, offset }
    }

    const where = this.publicWhere(query)
    const [items, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        select: { ...listingWithImages.select, latitude: true, longitude: true },
        orderBy: this.orderBy(query.sort, query.query?.trim()),
        take: limit,
        // A stable secondary sort keeps offset pagination deterministic when
        // two listings share a timestamp or price.
        skip: offset
      }),
      this.prisma.listing.count({ where })
    ])

    return {
      items: items.map(listing => this.decorate(this.withDistance(listing, query))),
      total,
      limit,
      offset
    }
  }

  async get(id: string, viewer?: { latitude?: number; longitude?: number }) {
    assertGeoQuery(viewer ?? {})
    const listing = await this.prisma.listing.findFirst({
      // Paused rows are ARCHIVED with deletedAt left null so the owner can
      // publish them again. They are not a public detail read. Sold rows stay
      // readable; drafts never are. A suspended seller's rows stay in the
      // database and reappear when the account is ACTIVE again.
      where: { id, deletedAt: null, status: { in: ['PUBLISHED', 'SOLD'] }, seller: activeAccountWhere },
      select: { ...listingWithImages.select, latitude: true, longitude: true }
    })
    if (!listing) throw new NotFoundException('Listing not found')
    return this.decorate(this.withDistance(listing, {
      latitude: viewer?.latitude,
      longitude: viewer?.longitude
    }))
  }

  /**
   * Drafts are invisible to everyone but their owner, so the owner has to
   * ask for them explicitly.
   */
  async getForOwner(userId: string, id: string) {
    const listing = await this.prisma.listing.findFirst({
      // Archived rows stay manageable by their owner; only a permanently
      // removed listing is hidden from the management view.
      where: { id, sellerId: userId, status: { not: 'DELETED' } },
      select: { ...listingWithImages.select, latitude: true, longitude: true }
    })
    if (!listing) throw new NotFoundException('Listing not found')
    return this.decorate(this.withDistance(listing, {}))
  }

  // ------------------------------------------------------------------ lifecycle

  create(sellerId: string, input: CreateListingDto) {
    return this.persist(sellerId, input, 'PUBLISHED')
  }

  saveDraft(sellerId: string, input: Partial<CreateListingDto>) {
    return this.persist(sellerId, input, 'DRAFT')
  }

  async publish(userId: string, id: string) {
    const listing = await this.ownedListing(userId, id)
    if (listing.status === 'PUBLISHED') return listing
    if (listing.status === 'ARCHIVED') {
      // Restoring an archived listing is the same transition as publishing.
      return this.prisma.listing.update({ where: { id }, data: { status: 'PUBLISHED', deletedAt: null } })
    }
    if (listing.status !== 'DRAFT') throw new ConflictException('Only a draft can be published')
    if (listing.title.trim().length < 3 || listing.description.trim().length < 10) {
      throw new BadRequestException('Add a title and description before publishing.')
    }
    return this.prisma.listing.update({ where: { id }, data: { status: 'PUBLISHED', deletedAt: null } })
  }

  async update(userId: string, id: string, input: UpdateListingDto) {
    await this.ownedListing(userId, id)
    const data: Record<string, unknown> = {}
    if (input.title !== undefined) data.title = sanitizeText(input.title, 140)
    if (input.description !== undefined) data.description = sanitizeText(input.description)
    if (input.priceCents !== undefined) data.priceCents = input.priceCents
    if (input.condition !== undefined) data.condition = input.condition
    if (input.neighborhood !== undefined) data.neighborhood = sanitizeOptional(input.neighborhood, 80)
    if (input.city !== undefined) data.city = sanitizeOptional(input.city, 80)
    if (input.latitude !== undefined) data.latitude = input.latitude
    if (input.longitude !== undefined) data.longitude = input.longitude
    if (input.radiusMiles !== undefined) data.radiusMiles = input.radiusMiles
    if (input.pickupAvailable !== undefined) data.pickupAvailable = input.pickupAvailable
    if (input.deliveryAvailable !== undefined) data.deliveryAvailable = input.deliveryAvailable
    if (input.shippingAvailable !== undefined) data.shippingAvailable = input.shippingAvailable
    if (Object.keys(data).length === 0) throw new BadRequestException('No fields to update')
    // Editing a published listing keeps it published; editing a draft keeps
    // it a draft, so an edit never silently changes visibility.
    return this.prisma.listing.update({ where: { id }, data })
  }

  /**
   * Withdraws a listing. The row is kept and history that references it
   * (offers, transactions, conversations, favorites) stays intact; only the
   * public visibility changes.
   */
  async archive(userId: string, id: string) {
    const listing = await this.ownedListing(userId, id)
    if (listing.status === 'ARCHIVED') return listing
    return this.prisma.listing.update({ where: { id }, data: { status: 'ARCHIVED', deletedAt: new Date() } })
  }

  async restore(userId: string, id: string) {
    const listing = await this.ownedListing(userId, id)
    if (listing.status !== 'ARCHIVED') throw new ConflictException('Only an archived listing can be restored')
    return this.prisma.listing.update({ where: { id }, data: { status: 'PUBLISHED', deletedAt: null } })
  }

  /**
   * Permanent removal for the owner. Offer and transaction history is
   * detached rather than cascaded, because those records are financial and
   * conversation history that must survive the listing.
   */
  async remove(userId: string, id: string) {
    const listing = await this.ownedListing(userId, id)
    const imageKeys = listing.images.map(image => image.objectKey)
    await this.prisma.$transaction([
      // Detach the rows that would otherwise cascade away.
      this.prisma.offerItem.deleteMany({ where: { listingId: id } }),
      this.prisma.requestMatch.deleteMany({ where: { listingId: id } }),
      this.prisma.listing.update({ where: { id }, data: { status: 'DELETED', deletedAt: new Date() } })
    ])
    // Storage cleanup is best effort: a failed object delete must not fail
    // the database write that already succeeded.
    await this.storage.removeMany(imageKeys).catch(() => undefined)
    return { id, deleted: true }
  }

  async pause(userId: string, id: string) {
    const listing = await this.ownedListing(userId, id)
    if (listing.status === 'ARCHIVED') return listing
    if (listing.status !== 'PUBLISHED') throw new ConflictException('Only a published listing can be paused')
    return this.prisma.listing.update({ where: { id }, data: { status: 'ARCHIVED', deletedAt: null } })
  }

  async markSold(userId: string, id: string) {
    const listing = await this.ownedListing(userId, id)
    if (listing.status === 'SOLD') return listing
    if (listing.status !== 'PUBLISHED' && listing.status !== 'ARCHIVED') {
      throw new ConflictException('Only a published or paused listing can be marked sold')
    }
    return this.prisma.listing.update({ where: { id }, data: { status: 'SOLD', deletedAt: null } })
  }

  listMine(userId: string, query: MyListingsQuery = {}) {
    return this.prisma.listing.findMany({
      where: {
        sellerId: userId,
        deletedAt: query.status === 'ARCHIVED' ? { not: null } : null,
        ...(query.status ? { status: query.status as ListingStatus } : {}),
        ...(query.status ? {} : { status: { not: 'DELETED' } })
      },
      select: listingWithImages.select,
      orderBy: { updatedAt: 'desc' },
      take: clampLimit(query.limit),
      skip: query.offset ?? 0
    })
  }

  // --------------------------------------------------------------------- images

  async addImage(userId: string, listingId: string, file: { buffer?: Buffer; mimetype?: string; size?: number }) {
    const listing = await this.ownedListing(userId, listingId)
    if (!file?.buffer || file.buffer.length === 0) throw new BadRequestException('No image was uploaded')
    const existing = await this.prisma.listingImage.count({ where: { listingId } })
    if (existing >= MAX_LISTING_IMAGES) {
      throw new BadRequestException(`A listing can have at most ${MAX_LISTING_IMAGES} images`)
    }
    const stored = await this.storage.putListingImage(listingId, file.buffer, file.mimetype)
    return this.prisma.listingImage.create({
      data: {
        listing: { connect: { id: listing.id } },
        objectKey: stored.objectKey,
        sortOrder: existing
      }
    })
  }

  async attachImages(userId: string, listingId: string, input: AttachImagesDto) {
    await this.ownedListing(userId, listingId)
    if (input.imageIds.length === 0) return this.imagesOf(listingId)
    const images = await this.prisma.listingImage.findMany({ where: { id: { in: input.imageIds }, listingId } })
    if (images.length !== input.imageIds.length) {
      throw new BadRequestException('One or more images do not belong to this listing')
    }
    const current = await this.prisma.listingImage.count({ where: { listingId } })
    if (current + input.imageIds.length > MAX_LISTING_IMAGES) {
      throw new BadRequestException(`A listing can have at most ${MAX_LISTING_IMAGES} images`)
    }
    const start = current
    await this.prisma.listingImage.updateMany({
      where: { id: { in: input.imageIds } },
      data: { sortOrder: { increment: start } }
    })
    return this.imagesOf(listingId)
  }

  async reorderImages(userId: string, listingId: string, input: ReorderImagesDto) {
    await this.ownedListing(userId, listingId)
    const images = await this.prisma.listingImage.findMany({ where: { listingId } })
    const known = new Set(images.map(image => image.id))
    if (input.imageIds.length !== images.length || input.imageIds.some(id => !known.has(id))) {
      throw new BadRequestException('Reorder must list every image on this listing exactly once')
    }
    await this.prisma.$transaction(
      input.imageIds.map((imageId, sortOrder) =>
        this.prisma.listingImage.update({ where: { id: imageId }, data: { sortOrder } })
      )
    )
    return this.imagesOf(listingId)
  }

  async removeImage(userId: string, listingId: string, imageId: string) {
    await this.ownedListing(userId, listingId)
    const image = await this.prisma.listingImage.findFirst({ where: { id: imageId, listingId } })
    if (!image) throw new NotFoundException('Image not found')
    await this.prisma.listingImage.delete({ where: { id: imageId } })
    await this.storage.remove(image.objectKey).catch(() => undefined)
    // Close the gap in sort order so the remaining images stay contiguous.
    await this.prisma.listingImage.updateMany({
      where: { listingId, sortOrder: { gt: image.sortOrder } },
      data: { sortOrder: { decrement: 1 } }
    })
    return this.imagesOf(listingId)
  }

  // --------------------------------------------------------------------- saving

  async toggleFavorite(userId: string, listingId: string) {
    await this.get(listingId)
    const existing = await this.prisma.favorite.findUnique({ where: { userId_listingId: { userId, listingId } } })
    if (existing) {
      await this.prisma.favorite.delete({ where: { userId_listingId: { userId, listingId } } })
      return { saved: false }
    }
    // The composite primary key makes a duplicate insert impossible, so a
    // double tap cannot create two rows.
    await this.prisma.favorite.upsert({
      where: { userId_listingId: { userId, listingId } },
      create: { userId, listingId },
      update: {}
    })
    return { saved: true }
  }

  listFavorites(userId: string) {
    return this.prisma.favorite.findMany({
      where: { userId, listing: { deletedAt: null, status: { in: ['PUBLISHED', 'SOLD'] } } },
      include: { listing: { select: listingWithImages.select as ListingWithImagesSelect } },
      orderBy: { createdAt: 'desc' }
    })
  }

  saveSearch(userId: string, input: SaveSearchDto) {
    if (!input.query.trim()) throw new BadRequestException('Search query is required')
    return this.prisma.savedSearch.create({
      data: { userId, query: input.query.trim(), filters: (input.filters ?? {}) as Prisma.InputJsonValue }
    })
  }

  listSavedSearches(userId: string) {
    return this.prisma.savedSearch.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } })
  }

  async updateSavedSearch(userId: string, id: string, input: UpdateSavedSearchDto) {
    // Scoped by userId so one member cannot edit another's saved search.
    const existing = await this.prisma.savedSearch.findFirst({ where: { id, userId } })
    if (!existing) throw new NotFoundException('Saved search not found')
    return this.prisma.savedSearch.update({
      where: { id },
      data: {
        ...(input.query !== undefined ? { query: input.query.trim() } : {}),
        ...(input.filters !== undefined ? { filters: input.filters as Prisma.InputJsonValue } : {})
      }
    })
  }

  async deleteSavedSearch(userId: string, id: string) {
    const result = await this.prisma.savedSearch.deleteMany({ where: { id, userId } })
    if (result.count === 0) throw new NotFoundException('Saved search not found')
    return { deleted: true }
  }

  // ------------------------------------------------------------------ discovery

  async neighborhoodCounts() {
    const rows = await this.prisma.listing.groupBy({
      by: ['neighborhood'],
      where: { status: 'PUBLISHED', deletedAt: null, seller: activeAccountWhere },
      _count: { _all: true }
    })
    return rows
      .filter((row): row is typeof row & { neighborhood: string } => Boolean(row.neighborhood))
      .map(row => ({ neighborhood: row.neighborhood, count: row._count._all }))
      .sort((a, b) => b.count - a.count || a.neighborhood.localeCompare(b.neighborhood))
  }

  // -------------------------------------------------------------------- helpers

  private publicWhere(query: ListListingsQuery): Prisma.ListingWhereInput {
    const search = query.query?.trim()
    const where: Prisma.ListingWhereInput = {
      // A draft is never public regardless of the requested status.
      // A suspended seller's rows stay published in the database and
      // reappear when the account is ACTIVE again.
      status: query.status ?? 'PUBLISHED',
      deletedAt: null,
      seller: activeAccountWhere,
      ...(query.sellerId ? { sellerId: query.sellerId } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
      ...(query.neighborhood ? { neighborhood: { equals: query.neighborhood, mode: 'insensitive' } } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { neighborhood: { contains: search, mode: 'insensitive' } }
            ]
          }
        : {}),
      ...this.priceWhere(query)
    }
    return where
  }

  /**
   * Filters that travel with the ST_DWithin query. Status, deletedAt, and
   * the seller's ACTIVE check live in pageWithinRadius, so a draft, a
   * paused or archived row, and a suspended seller cannot match.
   */
  private radiusExtra(query: ListListingsQuery): Prisma.Sql {
    this.priceWhere(query)
    const parts: Prisma.Sql[] = [Prisma.sql`row.status::text = ${query.status ?? 'PUBLISHED'}`]
    if (query.sellerId) parts.push(Prisma.sql`row."sellerId" = CAST(${query.sellerId} AS uuid)`)
    if (query.categoryId) parts.push(Prisma.sql`row."categoryId" = CAST(${query.categoryId} AS uuid)`)
    if (query.city) parts.push(Prisma.sql`LOWER(row.city) = LOWER(${query.city})`)
    if (query.neighborhood) parts.push(Prisma.sql`LOWER(row.neighborhood) = LOWER(${query.neighborhood})`)
    if (query.minPriceCents !== undefined) parts.push(Prisma.sql`row."priceCents" IS NOT NULL AND row."priceCents" >= ${query.minPriceCents}`)
    if (query.maxPriceCents !== undefined) parts.push(Prisma.sql`row."priceCents" IS NOT NULL AND row."priceCents" <= ${query.maxPriceCents}`)
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

  private priceWhere(query: ListListingsQuery): Prisma.ListingWhereInput {
    if (query.minPriceCents === undefined && query.maxPriceCents === undefined) return {}
    if (
      query.minPriceCents !== undefined &&
      query.maxPriceCents !== undefined &&
      query.minPriceCents > query.maxPriceCents
    ) {
      throw new BadRequestException('Minimum price cannot exceed maximum price')
    }
    return {
      priceCents: {
        ...(query.minPriceCents !== undefined ? { gte: query.minPriceCents } : {}),
        ...(query.maxPriceCents !== undefined ? { lte: query.maxPriceCents } : {}),
        not: null
      }
    }
  }

  private orderBy(sort: ListListingsQuery['sort'], search?: string): Prisma.ListingOrderByWithRelationInput[] {
    switch (sort) {
      case 'oldest':
        return [{ createdAt: 'asc' }, { id: 'asc' }]
      case 'price_asc':
        // Listings with no price sort last rather than as zero.
        return [{ priceCents: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }] as Prisma.ListingOrderByWithRelationInput[]
      case 'price_desc':
        return [{ priceCents: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }] as Prisma.ListingOrderByWithRelationInput[]
      case 'relevance':
        // Relevance only means something when there is a term. Ordering on
        // the text columns puts a title match ahead of a description match.
        if (search) {
          return [
            { title: { sort: 'desc', nulls: 'last' } },
            { description: { sort: 'desc', nulls: 'last' } },
            { createdAt: 'desc' },
            { id: 'desc' }
          ] as Prisma.ListingOrderByWithRelationInput[]
        }
        return [{ createdAt: 'desc' }, { id: 'desc' }]
      default:
        return [{ createdAt: 'desc' }, { id: 'desc' }]
    }
  }

  /**
   * Strips raw coordinates and adds a coarse location plus, when the caller
   * supplied an origin, the exact distance. This is the only place a public
   * listing shape is produced.
   */
  private withDistance<T extends { latitude: unknown; longitude: unknown }>(
    listing: T,
    query: { latitude?: number; longitude?: number },
    sqlDistance?: number | null
  ) {
    const { latitude: rawLat, longitude: rawLng, ...rest } = listing
    // Prisma returns Decimal columns as objects, so they are coerced before
    // any math. A Decimal would otherwise silently produce NaN.
    const latitude = toNumber(rawLat)
    const longitude = toNumber(rawLng)
    const hasCoords = latitude !== null && longitude !== null
    const originProvided = query.latitude !== undefined && query.longitude !== undefined
    const miles =
      sqlDistance !== undefined
        ? sqlDistance
        : hasCoords && originProvided
          ? round1(distanceMiles(query.latitude as number, query.longitude as number, latitude, longitude))
          : null
    return {
      ...rest,
      hasCoordinates: hasCoords,
      approximateLocation: hasCoords ? approximate(latitude, longitude) : null,
      distanceMiles: miles
    }
  }

  /** Adds the fetchable media URL to each image row. */
  private decorate<T extends { images?: Array<{ objectKey: string }> }>(listing: T) {
    if (!Array.isArray(listing.images)) return listing
    return {
      ...listing,
      images: listing.images.map(image => ({ ...image, url: mediaUrl(image) }))
    }
  }

  private imagesOf(listingId: string) {
    return this.prisma.listingImage
      .findMany({ where: { listingId }, orderBy: { sortOrder: 'asc' } })
      .then(images => images.map(image => ({ ...image, url: mediaUrl(image) })))
  }

  private async ownedListing(userId: string, id: string) {
    const listing = await this.prisma.listing.findUnique({
      where: { id },
      include: { images: { select: { id: true, objectKey: true, sortOrder: true } } }
    })
    if (!listing) throw new NotFoundException('Listing not found')
    // Ownership is checked before status so a caller cannot probe another
    // user's archived listings by guessing ids.
    if (listing.sellerId !== userId) throw new ForbiddenException()
    if (listing.status === 'DELETED') throw new NotFoundException('Listing not found')
    return listing
  }

  private persist(sellerId: string, input: Partial<CreateListingDto>, status: 'DRAFT' | 'PUBLISHED') {
    return this.prisma.listing.create({
      data: {
        sellerId,
        categoryId: input.categoryId as string,
        // A draft stores empty strings rather than placeholder copy. Filling
        // in a real title is what makes it publishable, so placeholder text
        // cannot be used to bypass the publish-time content check.
        title: sanitizeText(input.title ?? '', 140),
        description: sanitizeText(input.description ?? '', 5000),
        priceCents: input.priceCents,
        condition: input.condition,
        neighborhood: sanitizeOptional(input.neighborhood, 80),
        city: sanitizeOptional(input.city, 80),
        latitude: input.latitude,
        longitude: input.longitude,
        radiusMiles: input.radiusMiles,
        pickupAvailable: input.pickupAvailable ?? true,
        deliveryAvailable: input.deliveryAvailable ?? false,
        shippingAvailable: input.shippingAvailable ?? false,
        status
      }
    })
  }
}

/**
 * Same-origin media URL. The object key is random per upload, so the URL is
 * immutable and safe to cache for a year.
 */
function mediaUrl(image: { objectKey: string }) {
  const [, listingId, file] = image.objectKey.split('/')
  return listingId && file ? `/api/v1/media/listings/${listingId}/${file}` : ''
}

function clampLimit(limit?: number) {
  if (limit === undefined) return 24
  return Math.min(Math.max(limit, 1), 100)
}

export { distanceMiles, approximate, clampLimit }
/** Prisma returns Decimal columns as objects; coerce to a number or null. */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  if (typeof value === 'object' && 'toNumber' in value) {
    const parsed = (value as { toNumber: () => number }).toNumber()
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}
