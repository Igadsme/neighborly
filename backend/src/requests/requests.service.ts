import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { OfferStatus, TransactionStatus } from '@prisma/client'
import { publicUserSelect } from '../common/public-user.select'
import { PrismaService } from '../prisma/prisma.service'
import { CounterOfferDto, CreateOfferDto, CreateRequestDto } from './dto'

const negotiableOfferStatuses: readonly OfferStatus[] = [OfferStatus.PENDING, OfferStatus.COUNTERED]

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

  listOffers(userId: string, scope: 'received' | 'sent' | 'all' = 'received') {
    const publishedRequest = { status: 'PUBLISHED' as const, deletedAt: null }
    const where =
      scope === 'sent'
        ? { offererId: userId, request: publishedRequest }
        : scope === 'all'
          ? {
              request: publishedRequest,
              OR: [{ offererId: userId }, { request: { requesterId: userId } }]
            }
          : { request: { ...publishedRequest, requesterId: userId } }

    return this.prisma.requestOffer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        offerer: { select: publicUserSelect },
        items: { include: { listing: { select: { id: true, title: true, priceCents: true, status: true } } } },
        request: {
          select: {
            id: true,
            title: true,
            description: true,
            budgetCents: true,
            status: true,
            mode: true,
            createdAt: true,
            category: true,
            requester: { select: publicUserSelect }
          }
        }
      }
    })
  }

  list() {
    return this.prisma.needRequest.findMany({
      where: { status: 'PUBLISHED', deletedAt: null },
      include: {
        category: true,
        requester: { select: publicUserSelect },
        offers: { select: { id: true, status: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  }

  async get(id: string) {
    const request = await this.prisma.needRequest.findFirst({
      where: { id, status: 'PUBLISHED', deletedAt: null },
      include: {
        category: true,
        requester: { select: publicUserSelect },
        offers: {
          orderBy: { createdAt: 'asc' },
          include: {
            items: { include: { listing: { select: { id: true, title: true, priceCents: true, status: true } } } },
            offerer: { select: publicUserSelect }
          }
        }
      }
    })
    if (!request) throw new NotFoundException('Request not found')
    return request
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
    if (!negotiableOfferStatuses.includes(offer.status)) throw new BadRequestException('Offer is no longer negotiable')
    return this.prisma.$transaction([
      this.prisma.requestOffer.update({ where: { id: offerId }, data: { status: 'COUNTERED' } }),
      this.prisma.counterOffer.create({ data: { offerId, fromUserId: userId, amountCents: input.amountCents, message: input.message.trim() } })
    ])
  }

  async acceptOffer(requesterId: string, offerId: string, requestId?: string) {
    const offer = await this.loadRequesterOffer(requesterId, offerId, requestId)
    if (!negotiableOfferStatuses.includes(offer.status)) throw new BadRequestException('Offer is no longer acceptable')

    return this.prisma.$transaction(async tx => {
      await tx.requestOffer.update({ where: { id: offerId }, data: { status: OfferStatus.ACCEPTED } })
      const conversation = await tx.conversation.create({
        data: {
          participants: {
            create: [{ userId: offer.request.requesterId }, { userId: offer.offererId }]
          }
        }
      })
      const transaction = await tx.transaction.create({
        data: {
          offerId,
          conversationId: conversation.id,
          status: TransactionStatus.ACCEPTED,
          participants: {
            create: [
              { userId: offer.request.requesterId, role: 'REQUESTER' },
              { userId: offer.offererId, role: 'OFFERER' }
            ]
          }
        }
      })
      await tx.transactionMilestone.create({
        data: { transactionId: transaction.id, toStatus: TransactionStatus.ACCEPTED }
      })
      return { conversation, transaction }
    })
  }

  async rejectOffer(requesterId: string, offerId: string, requestId?: string) {
    const offer = await this.loadRequesterOffer(requesterId, offerId, requestId)
    if (!negotiableOfferStatuses.includes(offer.status)) throw new BadRequestException('Offer is no longer rejectable')
    return this.prisma.requestOffer.update({ where: { id: offerId }, data: { status: OfferStatus.REJECTED } })
  }

  private async loadRequesterOffer(requesterId: string, offerId: string, requestId?: string) {
    const offer = await this.prisma.requestOffer.findUnique({ where: { id: offerId }, include: { request: true } })
    if (!offer || (requestId !== undefined && offer.requestId !== requestId)) throw new NotFoundException('Offer not found')
    if (offer.request.requesterId !== requesterId) throw new ForbiddenException()
    return offer
  }
}
