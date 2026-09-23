import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, QuoteStatus } from '@prisma/client'
import { publicUserSelect } from '../common/public-user.select'
import { cleanList, cleanText } from '../common/text'
import { PrismaService } from '../prisma/prisma.service'
import { CreateQuoteDto, CreateServiceDto, ListServicesQuery, UpdateServiceDto } from './dto'

const publicServiceSelect = {
  id: true,
  title: true,
  businessName: true,
  description: true,
  category: true,
  startingPriceCents: true,
  location: true,
  availability: true,
  tags: true,
  imageKey: true,
  backgroundCheck: true,
  rating: true,
  reviewCount: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: publicUserSelect }
} satisfies Prisma.ServiceListingSelect

const quoteForProviderSelect = {
  id: true,
  serviceId: true,
  preferredDate: true,
  preferredTime: true,
  notes: true,
  address: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  requester: { select: publicUserSelect }
} satisfies Prisma.ServiceQuoteSelect

type ProviderQuote = Prisma.ServiceQuoteGetPayload<{ select: typeof quoteForProviderSelect }>

function toRating(value: Prisma.Decimal | number | string | null) {
  if (value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function presentService<T extends { imageKey: string | null; rating: Prisma.Decimal | number | string | null }>(row: T) {
  const { imageKey, rating, ...rest } = row
  return { ...rest, image: imageKey, rating: toRating(rating) }
}

function presentQuoteForProvider(quote: ProviderQuote) {
  const card = {
    id: quote.id,
    serviceId: quote.serviceId,
    preferredDate: quote.preferredDate,
    preferredTime: quote.preferredTime,
    notes: quote.notes,
    status: quote.status,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
    requester: quote.requester
  }
  if (quote.status === QuoteStatus.ACCEPTED) return { ...card, address: quote.address }
  return card
}

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListServicesQuery) {
    const search = query.query?.trim()
    const rows = await this.prisma.serviceListing.findMany({
      where: {
        status: 'PUBLISHED',
        deletedAt: null,
        ...(query.category ? { category: query.category } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { businessName: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } }
              ]
            }
          : {})
      },
      select: publicServiceSelect,
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      skip: query.offset
    })
    return rows.map(presentService)
  }

  async get(id: string) {
    const row = await this.prisma.serviceListing.findFirst({
      where: { id, status: 'PUBLISHED', deletedAt: null },
      select: publicServiceSelect
    })
    if (!row) throw new NotFoundException('Service not found')
    return presentService(row)
  }

  async create(ownerId: string, input: CreateServiceDto) {
    const created = await this.prisma.serviceListing.create({
      data: {
        ownerId,
        title: input.title.trim(),
        businessName: input.businessName.trim(),
        description: input.description.trim(),
        category: input.category,
        startingPriceCents: input.startingPriceCents,
        location: input.location.trim(),
        availability: input.availability.trim(),
        tags: cleanList(input.tags) ?? [],
        imageKey: cleanText(input.imageKey),
        latitude: input.latitude,
        longitude: input.longitude,
        status: 'PUBLISHED'
      },
      select: publicServiceSelect
    })
    return presentService(created)
  }

  async update(userId: string, id: string, input: UpdateServiceDto) {
    await this.requireOwner(id, userId)
    await this.prisma.serviceListing.update({
      where: { id },
      data: {
        title: input.title?.trim(),
        businessName: input.businessName?.trim(),
        description: input.description?.trim(),
        category: input.category,
        startingPriceCents: input.startingPriceCents,
        location: input.location?.trim(),
        availability: input.availability?.trim(),
        tags: cleanList(input.tags),
        imageKey: cleanText(input.imageKey),
        latitude: input.latitude,
        longitude: input.longitude
      }
    })
    return this.get(id)
  }

  async archive(userId: string, id: string) {
    await this.requireOwner(id, userId)
    await this.prisma.serviceListing.update({ where: { id }, data: { status: 'ARCHIVED', deletedAt: new Date() } })
    return { id, status: 'ARCHIVED' as const }
  }

  async createQuote(userId: string, serviceId: string, input: CreateQuoteDto) {
    const service = await this.prisma.serviceListing.findFirst({
      where: { id: serviceId, status: 'PUBLISHED', deletedAt: null },
      select: { ownerId: true }
    })
    if (!service) throw new NotFoundException('Service not found')
    if (service.ownerId === userId) throw new BadRequestException('You cannot request a quote on your own service')
    return this.prisma.serviceQuote.create({
      data: {
        serviceId,
        requesterId: userId,
        preferredDate: cleanText(input.preferredDate),
        preferredTime: cleanText(input.preferredTime),
        notes: input.notes.trim(),
        address: cleanText(input.address),
        status: 'PENDING'
      },
      select: {
        id: true,
        serviceId: true,
        preferredDate: true,
        preferredTime: true,
        notes: true,
        address: true,
        status: true,
        createdAt: true,
        updatedAt: true
      }
    })
  }

  async listMyQuotes(userId: string) {
    const rows = await this.prisma.serviceQuote.findMany({
      where: { requesterId: userId },
      select: {
        id: true,
        serviceId: true,
        preferredDate: true,
        preferredTime: true,
        notes: true,
        address: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        service: { select: publicServiceSelect }
      },
      orderBy: { createdAt: 'desc' }
    })
    return rows.map(row => ({ ...row, service: presentService(row.service) }))
  }

  async listQuotesForProvider(userId: string, serviceId: string) {
    await this.requireOwner(serviceId, userId)
    const quotes = await this.prisma.serviceQuote.findMany({
      where: { serviceId },
      select: quoteForProviderSelect,
      orderBy: { createdAt: 'desc' }
    })
    return quotes.map(presentQuoteForProvider)
  }

  async acceptQuote(userId: string, quoteId: string) {
    const quote = await this.prisma.serviceQuote.findUnique({
      where: { id: quoteId },
      select: {
        ...quoteForProviderSelect,
        service: { select: { ownerId: true, deletedAt: true, status: true } }
      }
    })
    if (!quote || quote.service.deletedAt || quote.service.status !== 'PUBLISHED') throw new NotFoundException('Quote not found')
    if (quote.service.ownerId !== userId) throw new ForbiddenException('Only the provider can accept a quote request')
    if (quote.status === 'ACCEPTED') return presentQuoteForProvider(quote)
    const updated = await this.prisma.serviceQuote.update({
      where: { id: quoteId },
      data: { status: 'ACCEPTED' },
      select: quoteForProviderSelect
    })
    return presentQuoteForProvider(updated)
  }

  private async requireOwner(id: string, userId: string) {
    const row = await this.prisma.serviceListing.findUnique({ where: { id }, select: { ownerId: true, deletedAt: true } })
    if (!row || row.deletedAt) throw new NotFoundException('Service not found')
    if (row.ownerId !== userId) throw new ForbiddenException('You can only change your own service')
  }
}
