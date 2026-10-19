import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService, MAX_IMAGE_SIZE_BYTES, MAX_LISTING_IMAGES } from '../storage/storage.service'
import { CompleteListingImageUploadDto, CreateListingImageUploadDto, CreateListingDto, ListListingsQuery, ReorderListingImagesDto, SaveSearchDto, UpdateListingDto } from './dto'

const publicListingSelect = {
  id: true,
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
  images: { select: { id: true, objectKey: true, sortOrder: true } },
  category: { select: { id: true, name: true, slug: true } },
  seller: {
    select: {
      id: true,
      profile: {
        select: {
          firstName: true,
          lastName: true,
          displayName: true,
          neighborhood: true,
          emailVerified: true,
        },
      },
    },
  },
} as const

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(query: ListListingsQuery) {
    const search = query.query?.trim()
    const listings = await this.prisma.listing.findMany({
      where: {
        status: 'PUBLISHED',
        categoryId: query.categoryId,
        condition: query.condition,
        deliveryAvailable: query.deliveryAvailable,
        ...(query.freeOnly
          ? { priceCents: 0 }
          : query.minPriceCents !== undefined || query.maxPriceCents !== undefined
            ? { priceCents: { gte: query.minPriceCents, lte: query.maxPriceCents } }
            : {}),
        ...(search ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }] } : {})
      },
      select: publicListingSelect,
      orderBy: query.sort === 'price_asc'
        ? { priceCents: 'asc' }
        : query.sort === 'price_desc'
          ? { priceCents: 'desc' }
          : { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset
    })
    return listings.map(listing => this.addImageUrls(listing))
  }

  async listMine(userId: string) {
    const listings = await this.prisma.listing.findMany({
      where: { sellerId: userId, deletedAt: null, status: { in: ['DRAFT', 'PUBLISHED'] } },
      select: publicListingSelect,
      orderBy: { updatedAt: 'desc' },
    })
    return listings.map((listing) => this.addImageUrls(listing))
  }

  create(sellerId: string, input: CreateListingDto) {
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
        status: 'DRAFT'
      }
    })
  }

  async publish(userId: string, id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } })
    if (!listing || listing.deletedAt) throw new NotFoundException('Listing not found')
    if (listing.sellerId !== userId) throw new ForbiddenException()
    if (listing.status === 'PUBLISHED') return this.get(id)
    if (listing.status !== 'DRAFT') throw new ConflictException('This listing cannot be published')
    const updated = await this.prisma.listing.updateMany({
      where: { id, sellerId: userId, status: 'DRAFT', deletedAt: null },
      data: { status: 'PUBLISHED' },
    })
    if (updated.count !== 1) throw new ConflictException('Listing status changed; refresh and try again')
    return this.get(id)
  }

  async get(id: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id, deletedAt: null, status: 'PUBLISHED' },
      select: {
        ...publicListingSelect,
        images: { select: { id: true, objectKey: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } },
      },
    })
    if (!listing) throw new NotFoundException('Listing not found')
    return this.addImageUrls(listing)
  }

  async createImageUpload(userId: string, listingId: string, input: CreateListingImageUploadDto) {
    await this.assertOwner(userId, listingId)
    if (input.sizeBytes < 1 || input.sizeBytes > MAX_IMAGE_SIZE_BYTES) {
      throw new BadRequestException('Image must be 10 MB or smaller')
    }
    const imageCount = await this.prisma.listingImage.count({ where: { listingId } })
    if (imageCount >= MAX_LISTING_IMAGES) {
      throw new BadRequestException(`A listing can have at most ${MAX_LISTING_IMAGES} images`)
    }
    return this.storage.createImageUpload(userId, listingId, input.contentType)
  }

  async completeImageUpload(userId: string, listingId: string, input: CompleteListingImageUploadDto) {
    await this.assertOwner(userId, listingId)
    const prefix = `listings/${userId}/${listingId}/`
    if (!input.key.startsWith(prefix)) throw new ForbiddenException('Image upload does not belong to this listing')
    const extension = input.key.split('.').pop()?.toLowerCase()
    const contentType = extension === 'jpg'
      ? 'image/jpeg'
      : extension === 'png'
        ? 'image/png'
        : extension === 'webp'
          ? 'image/webp'
          : ''
    if (!contentType) throw new BadRequestException('Unsupported image type')
    await this.storage.verifyImage(input.key, contentType)

    return this.prisma.$transaction(async tx => {
      const existing = await tx.listingImage.findFirst({
        where: { listingId, objectKey: input.key },
      })
      if (existing) return existing
      const count = await tx.listingImage.count({ where: { listingId } })
      if (count >= MAX_LISTING_IMAGES) {
        throw new BadRequestException(`A listing can have at most ${MAX_LISTING_IMAGES} images`)
      }
      return tx.listingImage.create({
        data: { listingId, objectKey: input.key, sortOrder: count },
      })
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
  }

  async reorderImages(userId: string, listingId: string, input: ReorderListingImagesDto) {
    await this.assertOwner(userId, listingId)
    return this.prisma.$transaction(async tx => {
      const images = await tx.listingImage.findMany({
        where: { listingId },
        select: { id: true },
      })
      if (images.length !== input.imageIds.length ||
          images.some(image => !input.imageIds.includes(image.id))) {
        throw new BadRequestException('Image order must include every listing image exactly once')
      }
      await Promise.all(input.imageIds.map((id, sortOrder) =>
        tx.listingImage.update({ where: { id }, data: { sortOrder } })))
      return tx.listingImage.findMany({
        where: { listingId },
        select: { id: true, objectKey: true, sortOrder: true },
        orderBy: { sortOrder: 'asc' },
      })
    })
  }

  async deleteImage(userId: string, listingId: string, imageId: string) {
    await this.assertOwner(userId, listingId)
    const image = await this.prisma.listingImage.findFirst({
      where: { id: imageId, listingId },
    })
    if (!image) throw new NotFoundException('Listing image not found')
    await this.prisma.listingImage.delete({ where: { id: imageId } })
    await this.storage.deleteImage(image.objectKey)
    return { deleted: true }
  }

  async update(userId: string, id: string, input: UpdateListingDto) {
    const listing = await this.prisma.listing.findUnique({ where: { id } })
    if (!listing || listing.deletedAt) throw new NotFoundException('Listing not found')
    if (listing.sellerId !== userId) throw new ForbiddenException()
    const updated = await this.prisma.listing.update({
      where: { id },
      data: {
        title: input.title?.trim(),
        description: input.description?.trim(),
        priceCents: input.priceCents,
        condition: input.condition?.trim(),
        pickupAvailable: input.pickupAvailable,
        deliveryAvailable: input.deliveryAvailable,
        shippingAvailable: input.shippingAvailable
      },
      select: publicListingSelect,
    })
    return this.addImageUrls(updated)
  }

  async archive(userId: string, id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id } })
    if (!listing || listing.deletedAt) throw new NotFoundException('Listing not found')
    if (listing.sellerId !== userId) throw new ForbiddenException()
    const updated = await this.prisma.listing.updateMany({
      where: { id, sellerId: userId, deletedAt: null, status: { in: ['DRAFT', 'PUBLISHED'] } },
      data: { status: 'ARCHIVED', deletedAt: new Date() },
    })
    if (updated.count !== 1) throw new ConflictException('Listing status changed; refresh and try again')
    return { archived: true }
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

  async listFavorites(userId: string) {
    const favorites = await this.prisma.favorite.findMany({
      where: { userId, listing: { deletedAt: null, status: { not: 'DELETED' } } },
      include: { listing: { select: publicListingSelect } },
      orderBy: { createdAt: 'desc' }
    })
    return favorites.map(favorite => ({
      ...favorite,
      listing: this.addImageUrls(favorite.listing),
    }))
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

  async deleteSavedSearch(userId: string, searchId: string) {
    const savedSearch = await this.prisma.savedSearch.findUnique({
      where: { id: searchId },
      select: { id: true, userId: true },
    })
    if (!savedSearch) throw new NotFoundException('Saved search not found')
    if (savedSearch.userId !== userId) throw new ForbiddenException()
    await this.prisma.savedSearch.delete({ where: { id: searchId } })
    return { deleted: true }
  }

  private async assertOwner(userId: string, listingId: string) {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      select: { id: true, sellerId: true },
    })
    if (!listing) throw new NotFoundException('Listing not found')
    if (listing.sellerId !== userId) throw new ForbiddenException()
    return listing
  }

  private addImageUrls<T extends { images: Array<{ objectKey: string }> }>(listing: T) {
    return {
      ...listing,
      images: listing.images.map(image => ({
        ...image,
        url: this.storage.publicImageUrl(image.objectKey),
      })),
    }
  }
}
