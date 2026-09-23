import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { publicUserSelect } from '../common/public-user.select'
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
        title: input.title?.trim(),
        description: input.description?.trim(),
        priceCents: input.priceCents,
        condition: input.condition?.trim(),
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

  private persist(sellerId: string, input: CreateListingDto, status: 'DRAFT' | 'PUBLISHED') {
    return this.prisma.listing.create({
      data: {
        sellerId,
        categoryId: input.categoryId,
        title: input.title.trim(),
        description: input.description.trim(),
        priceCents: input.priceCents,
        condition: input.condition?.trim(),
        neighborhood: input.neighborhood?.trim(),
        city: input.city?.trim(),
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
