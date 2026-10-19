import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { activeAccountWhere } from '../common/active-account'
import { assertGeoQuery, ilikeContains, orderByIds, pageWithinRadius } from '../common/geo-search'
import { publicRating, ratingsForOwners, type PublicRating } from '../common/public-rating'
import { publicUserSelect } from '../common/public-user.select'
import { cleanList, cleanText, sanitizeText } from '../common/text'
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
  status: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: publicUserSelect },
  images: { orderBy: { sortOrder: 'asc' }, select: { id: true, objectKey: true, sortOrder: true } }
} satisfies Prisma.HousingListingSelect

function presentHousing<T extends { propertyType: string }>(row: T) {
  const { propertyType, ...rest } = row
  const publicRow = rest as T & { verified?: boolean }
  delete publicRow.verified
  return { ...publicRow, type: propertyType }
}

@Injectable()
export class HousingService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListHousingQuery) {
    const origin = assertGeoQuery(query)
    if (origin) {
      const page = await pageWithinRadius(this.prisma, 'HousingListing', origin, housingRadiusExtra(query), query.limit, query.offset)
      if (page.ids.length === 0) return []
      const rows = await this.prisma.housingListing.findMany({
        where: { id: { in: page.ids } },
        select: publicHousingSelect
      })
      return this.withRatings(orderByIds(rows, page.ids).map(presentHousing))
    }
    const search = query.query?.trim()
    const rows = await this.prisma.housingListing.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        owner: activeAccountWhere,
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
    return this.withRatings(rows.map(presentHousing))
  }

  async get(id: string) {
    const row = await this.prisma.housingListing.findFirst({
      where: { id, status: 'PUBLISHED', deletedAt: null, owner: activeAccountWhere },
      select: publicHousingSelect
    })
    if (!row) throw new NotFoundException('Housing listing not found')
    const [presented] = await this.withRatings([presentHousing(row)])
    return presented
  }

  async create(ownerId: string, input: CreateHousingDto) {
    const created = await this.prisma.housingListing.create({
      data: {
        ownerId,
        title: sanitizeText(input.title, 140),
        description: sanitizeText(input.description),
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
    const [presented] = await this.withRatings([presentHousing(created)])
    return presented
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

  private async withRatings<T extends { owner: { id: string } }>(rows: T[]): Promise<Array<T & PublicRating>> {
    const summaries = await ratingsForOwners(this.prisma, rows.map(row => row.owner.id))
    return rows.map(row => ({ ...row, ...publicRating(summaries, row.owner.id) }))
  }

  private async requireOwner(id: string, userId: string) {
    const row = await this.prisma.housingListing.findUnique({ where: { id }, select: { ownerId: true, deletedAt: true } })
    if (!row || row.deletedAt) throw new NotFoundException('Housing listing not found')
    if (row.ownerId !== userId) throw new ForbiddenException('You can only change your own housing listing')
  }
}

function housingRadiusExtra(query: ListHousingQuery): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`row.status::text = 'PUBLISHED'`]
  if (query.listingType) parts.push(Prisma.sql`row."listingType" = ${query.listingType}`)
  if (query.type) parts.push(Prisma.sql`row."propertyType" = ${query.type}`)
  if (query.minBeds) parts.push(Prisma.sql`row.beds >= ${query.minBeds}`)
  if (query.maxPriceCents !== undefined) parts.push(Prisma.sql`row."priceCents" <= ${query.maxPriceCents}`)
  if (query.pets) parts.push(Prisma.sql`row.pets = true`)
  if (query.furnished) parts.push(Prisma.sql`row.furnished = true`)
  if (query.verified) parts.push(Prisma.sql`row.verified = true`)
  if (query.utilitiesIncluded) {
    parts.push(Prisma.sql`row.utilities IS NOT NULL AND row.utilities <> 'N/A' AND row.utilities <> '' AND row.utilities NOT ILIKE 'Resident%'`)
  }
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
