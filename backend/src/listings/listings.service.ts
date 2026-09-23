import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { publicUserSelect } from '../common/public-user.select'
import { sanitizeOptional, sanitizeText } from '../common/text'
import { PrismaService } from '../prisma/prisma.service'
import { CreateListingDto, ListListingsQuery, SaveSearchDto, UpdateListingDto } from './dto'

const publicSeller = { select: publicUserSelect }

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

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  list(query: ListListingsQuery) {
    const search = query.query?.trim()
    const status = query.status === 'SOLD' ? 'SOLD' : 'PUBLISHED'
    return this.prisma.listing.findMany({
      where: {
        status,
        ...(status === 'SOLD' ? { deletedAt: null } : {}),
        ...(query.sellerId ? { sellerId: query.sellerId } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(search ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] } : {})
      },
      select: { ...publicListingSelect, images: true },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset
    })
  }

  create(sellerId: string, input: CreateListingDto) {
    return this.persist(sellerId, input, 'PUBLISHED')
  }

  saveDraft(sellerId: string, input: CreateListingDto) {
    return this.persist(sellerId, input, 'DRAFT')
  }

  async publish(userId: string, id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } })
    if (!listing || listing.deletedAt) throw new NotFoundException('Listing not found')
    if (listing.sellerId !== userId) throw new ForbiddenException()
    if (listing.status === 'PUBLISHED') return listing
    if (listing.status === 'ARCHIVED') {
      return this.prisma.listing.update({ where: { id }, data: { status: 'PUBLISHED' } })
    }
    if (listing.status !== 'DRAFT') throw new ConflictException('Only a draft can be published')
    if (listing.title.trim().length < 3 || listing.description.trim().length < 10) {
      throw new BadRequestException('Add a title and description before publishing.')
    }
    return this.prisma.listing.update({ where: { id }, data: { status: 'PUBLISHED' } })
  }

  async get(id: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, deletedAt: null, status: { not: 'DRAFT' } },
      select: { ...publicListingSelect, images: { orderBy: { sortOrder: 'asc' } } }
    })
    if (!listing) throw new NotFoundException('Listing not found')
    return listing
  }

  async update(userId: string, id: string, input: UpdateListingDto) {
    const listing = await this.prisma.listing.findUnique({ where: { id } })
    if (!listing) throw new NotFoundException('Listing not found')
    if (listing.sellerId !== userId) throw new ForbiddenException()
    return this.prisma.listing.update({
      where: { id },
      data: {
        title: sanitizeOptional(input.title, 140),
        description: sanitizeOptional(input.description),
        priceCents: input.priceCents,
        condition: sanitizeOptional(input.condition, 40),
        pickupAvailable: input.pickupAvailable,
        deliveryAvailable: input.deliveryAvailable,
        shippingAvailable: input.shippingAvailable
      }
    })
  }

  async archive(userId: string, id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } })
    if (!listing) throw new NotFoundException('Listing not found')
    if (listing.sellerId !== userId) throw new ForbiddenException()
    return this.prisma.listing.update({ where: { id }, data: { status: 'ARCHIVED', deletedAt: new Date() } })
  }

  async toggleFavorite(userId: string, listingId: string) {
    await this.get(listingId)
    const existing = await this.prisma.favorite.findUnique({ where: { userId_listingId: { userId, listingId } } })
    if (existing) {
      await this.prisma.favorite.delete({ where: { userId_listingId: { userId, listingId } } })
      return { saved: false }
    }
    await this.prisma.favorite.create({ data: { userId, listingId } })
    return { saved: true }
  }

  listFavorites(userId: string) {
    return this.prisma.favorite.findMany({
      where: { userId, listing: { deletedAt: null, status: { not: 'DELETED' } } },
      include: { listing: { select: { ...publicListingSelect, images: true } } },
      orderBy: { createdAt: 'desc' }
    })
  }

  saveSearch(userId: string, input: SaveSearchDto) {
    if (!input.query.trim()) throw new ConflictException('Search query is required')
    return this.prisma.savedSearch.create({
      data: { userId, query: input.query.trim(), filters: (input.filters ?? {}) as Prisma.InputJsonValue }
    })
  }

  listSavedSearches(userId: string) {
    return this.prisma.savedSearch.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } })
  }

  listMine(userId: string) {
    return this.prisma.listing.findMany({
      where: {
        sellerId: userId,
        deletedAt: null,
        status: { in: ['DRAFT', 'PUBLISHED', 'SOLD', 'ARCHIVED'] }
      },
      select: { ...publicListingSelect, images: true },
      orderBy: { createdAt: 'desc' }
    })
  }

  async neighborhoodCounts() {
    const rows = await this.prisma.listing.groupBy({
      by: ['neighborhood'],
      where: { status: 'PUBLISHED', deletedAt: null },
      _count: { _all: true }
    })
    return rows
      .filter((row): row is typeof row & { neighborhood: string } => Boolean(row.neighborhood))
      .map((row) => ({ neighborhood: row.neighborhood, count: row._count._all }))
      .sort((a, b) => b.count - a.count || a.neighborhood.localeCompare(b.neighborhood))
  }

  async pause(userId: string, id: string) {
    const listing = await this.ownedListing(userId, id)
    if (listing.status === 'ARCHIVED') return listing
    if (listing.status !== 'PUBLISHED') throw new ConflictException('Only a published listing can be paused')
    return this.prisma.listing.update({ where: { id }, data: { status: 'ARCHIVED' } })
  }

  async markSold(userId: string, id: string) {
    const listing = await this.ownedListing(userId, id)
    if (listing.status === 'SOLD') return listing
    if (listing.status !== 'PUBLISHED' && listing.status !== 'ARCHIVED') {
      throw new ConflictException('Only a published or paused listing can be marked sold')
    }
    return this.prisma.listing.update({ where: { id }, data: { status: 'SOLD' } })
  }

  private async ownedListing(userId: string, id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } })
    if (!listing || listing.deletedAt) throw new NotFoundException('Listing not found')
    if (listing.sellerId !== userId) throw new ForbiddenException()
    return listing
  }

  private persist(sellerId: string, input: CreateListingDto, status: 'DRAFT' | 'PUBLISHED') {
    return this.prisma.listing.create({
      data: {
        sellerId,
        categoryId: input.categoryId,
        title: sanitizeText(input.title, 140),
        description: sanitizeText(input.description),
        priceCents: input.priceCents,
        condition: sanitizeOptional(input.condition, 40),
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
