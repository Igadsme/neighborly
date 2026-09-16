import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { CounterOfferDto, CreateOfferDto, CreateRequestDto } from './dto'

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService) {}

  create(requesterId: string, input: CreateRequestDto) {
    return this.prisma.needRequest.create({
      data: {
        requesterId,
        categoryId: input.categoryId,
        title: input.title.trim(),
        description: input.description.trim(),
        budgetCents: input.budgetCents,
        latitude: input.latitude,
        longitude: input.longitude,
        radiusMiles: input.radiusMiles ?? 10,
        deadline: input.deadline ? new Date(input.deadline) : undefined,
        urgency: input.urgency?.trim(),
        mode: input.mode,
        status: 'PUBLISHED'
      }
    })
  }

  list() {
    return this.prisma.needRequest.findMany({
      where: { status: 'PUBLISHED', deletedAt: null },
      include: { category: true, requester: { include: { profile: true } }, offers: { select: { id: true, status: true } } },
      orderBy: { createdAt: 'desc' }
    })
  }

  async createOffer(offererId: string, requestId: string, input: CreateOfferDto) {
    const request = await this.prisma.needRequest.findUnique({ where: { id: requestId } })
    if (!request || request.status !== 'PUBLISHED') throw new NotFoundException('Published request not found')
    if (request.requesterId === offererId) throw new BadRequestException('You cannot offer on your own request')
    if (input.listingIds?.length) {
      const listings = await this.prisma.listing.findMany({ where: { id: { in: input.listingIds }, sellerId: offererId, status: 'PUBLISHED' }, select: { id: true } })
      if (listings.length !== input.listingIds.length) throw new ForbiddenException('Offers may only include your published listings')
    }
    return this.prisma.requestOffer.create({
      data: {
        requestId,
        offererId,
        amountCents: input.amountCents,
        message: input.message.trim(),
        items: input.listingIds?.length ? { create: input.listingIds.map(listingId => ({ listingId })) } : undefined
      },
      include: { items: true }
    })
  }

  async counterOffer(userId: string, offerId: string, input: CounterOfferDto) {
    const offer = await this.prisma.requestOffer.findUnique({ where: { id: offerId }, include: { request: true } })
    if (!offer) throw new NotFoundException('Offer not found')
    if (offer.request.requesterId !== userId && offer.offererId !== userId) throw new ForbiddenException()
    if (!['PENDING', 'COUNTERED'].includes(offer.status)) throw new BadRequestException('Offer is no longer negotiable')
    return this.prisma.$transaction([
      this.prisma.requestOffer.update({ where: { id: offerId }, data: { status: 'COUNTERED' } }),
      this.prisma.counterOffer.create({ data: { offerId, fromUserId: userId, amountCents: input.amountCents, message: input.message.trim() } })
    ])
  }
}
