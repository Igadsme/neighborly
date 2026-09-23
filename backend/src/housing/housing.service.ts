import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { publicUserSelect } from '../common/public-user.select'
import { cleanList, cleanText } from '../common/text'
import { PrismaService } from '../prisma/prisma.service'
import { CreateHousingDto, ListHousingQuery, UpdateHousingDto } from './dto'

const publicHousingSelect = {
  id: true,
  title: true,
  description: true,
  propertyType: true,
  listingType: true,
  priceCents: true,
  priceUnit: true,
  beds: true,
  baths: true,
  sqft: true,
  neighborhood: true,
  city: true,
  available: true,
  lease: true,
  pets: true,
  furnished: true,
  utilities: true,
  verified: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: publicUserSelect },
  images: { orderBy: { sortOrder: 'asc' }, select: { id: true, objectKey: true, sortOrder: true } }
} satisfies Prisma.HousingListingSelect

function presentHousing<T extends { propertyType: string }>(row: T) {
  const { propertyType, ...rest } = row
  return { ...rest, type: propertyType }
}

@Injectable()
export class HousingService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListHousingQuery) {
    const search = query.query?.trim()
    const rows = await this.prisma.housingListing.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        ...(query.listingType ? { listingType: query.listingType } : {}),
        ...(query.type ? { propertyType: query.type } : {}),
        ...(query.minBeds ? { beds: { gte: query.minBeds } } : {}),
        ...(query.maxPriceCents !== undefined ? { priceCents: { lte: query.maxPriceCents } } : {}),
        ...(query.pets ? { pets: true } : {}),
        ...(query.furnished ? { furnished: true } : {}),
        ...(query.verified ? { verified: true } : {}),
        ...(query.utilitiesIncluded
          ? {
              NOT: {
                OR: [
                  { utilities: null },
                  { utilities: { in: ['N/A', ''] } },
                  { utilities: { startsWith: 'Resident', mode: 'insensitive' } }
                ]
              }
            }
          : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
                { neighborhood: { contains: search, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      select: publicHousingSelect,
      orderBy:
        query.sort === 'price_asc'
          ? { priceCents: 'asc' }
          : query.sort === 'price_desc'
            ? { priceCents: 'desc' }
            : query.sort === 'beds'
              ? { beds: 'desc' }
              : { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset
    })
    return rows.map(presentHousing)
  }

  async get(id: string) {
    const row = await this.prisma.housingListing.findFirst({
      where: { id, status: 'PUBLISHED', deletedAt: null },
      select: publicHousingSelect
    })
    if (!row) throw new NotFoundException('Housing listing not found')
    return presentHousing(row)
  }

  async create(ownerId: string, input: CreateHousingDto) {
    const created = await this.prisma.housingListing.create({
      data: {
        ownerId,
        title: input.title.trim(),
        description: input.description.trim(),
        propertyType: input.type,
        listingType: input.listingType,
        priceCents: input.priceCents,
        priceUnit: cleanText(input.priceUnit),
        beds: input.beds,
        baths: input.baths,
        sqft: input.sqft ?? 0,
        neighborhood: input.neighborhood.trim(),
        city: cleanText(input.city),
        available: cleanText(input.available),
        lease: cleanText(input.lease),
        pets: input.pets ?? false,
        furnished: input.furnished ?? false,
        utilities: cleanText(input.utilities),
        latitude: input.latitude,
        longitude: input.longitude,
        status: 'PUBLISHED',
        images: input.imageKeys?.length
          ? { create: cleanList(input.imageKeys)!.map((objectKey, sortOrder) => ({ objectKey, sortOrder })) }
          : undefined
      },
      select: publicHousingSelect
    })
    return presentHousing(created)
  }

  async update(userId: string, id: string, input: UpdateHousingDto) {
    await this.requireOwner(id, userId)
    await this.prisma.housingListing.update({
      where: { id },
      data: {
        title: input.title?.trim(),
        description: input.description?.trim(),
        propertyType: input.type,
        listingType: input.listingType,
        priceCents: input.priceCents,
        priceUnit: cleanText(input.priceUnit),
        beds: input.beds,
        baths: input.baths,
        sqft: input.sqft,
        neighborhood: input.neighborhood?.trim(),
        city: cleanText(input.city),
        available: cleanText(input.available),
        lease: cleanText(input.lease),
        pets: input.pets,
        furnished: input.furnished,
        utilities: cleanText(input.utilities),
        latitude: input.latitude,
        longitude: input.longitude
      }
    })
    if (input.imageKeys) {
      const keys = cleanList(input.imageKeys) ?? []
      await this.prisma.housingImage.deleteMany({ where: { housingId: id } })
      if (keys.length) {
        await this.prisma.housingImage.createMany({
          data: keys.map((objectKey, sortOrder) => ({ housingId: id, objectKey, sortOrder }))
        })
      }
    }
    return this.get(id)
  }

  async archive(userId: string, id: string) {
    await this.requireOwner(id, userId)
    await this.prisma.housingListing.update({
      where: { id },
      data: { status: 'ARCHIVED', deletedAt: new Date() }
    })
    return { id, status: 'ARCHIVED' as const }
  }

  private async requireOwner(id: string, userId: string) {
    const row = await this.prisma.housingListing.findUnique({ where: { id }, select: { ownerId: true, deletedAt: true } })
    if (!row || row.deletedAt) throw new NotFoundException('Housing listing not found')
    if (row.ownerId !== userId) throw new ForbiddenException('You can only change your own housing listing')
  }
}
