import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { CounterOfferDto, CreateOfferDto, CreateRequestDto } from './dto'
import { SafetyService } from '../safety/safety.service'

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly safety: SafetyService,
  ) {}

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

  list(userId: string) {
    return this.prisma.needRequest.findMany({
      where: { status: 'PUBLISHED', deletedAt: null },
      select: {
        id: true,
        requesterId: true,
        categoryId: true,
        title: true,
        description: true,
        budgetCents: true,
        radiusMiles: true,
        deadline: true,
        urgency: true,
        mode: true,
        status: true,
        createdAt: true,
        category: { select: { id: true, name: true } },
        requester: {
          select: {
            id: true,
            profile: { select: { firstName: true, neighborhood: true } },
          },
        },
        offers: userId
          ? {
              where: { request: { requesterId: userId } },
              select: {
                id: true,
                amountCents: true,
                message: true,
                status: true,
                offererId: true,
                offerer: {
                  select: {
                    id: true,
                    profile: { select: { firstName: true, lastName: true } },
                  },
                },
                items: {
                  select: {
                    listing: { select: { id: true, title: true, priceCents: true, condition: true } },
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
            }
          : false,
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async createOffer(offererId: string, requestId: string, input: CreateOfferDto) {
    const request = await this.prisma.needRequest.findUnique({ where: { id: requestId } })
    if (!request || request.status !== 'PUBLISHED') throw new NotFoundException('Published request not found')
    if (request.requesterId === offererId) throw new BadRequestException('You cannot offer on your own request')
    await this.safety.assertInteractionAllowed(offererId, request.requesterId)
    if (input.listingIds?.length) {
      const listings = await this.prisma.listing.findMany({ where: { id: { in: input.listingIds }, sellerId: offererId, status: 'PUBLISHED' }, select: { id: true } })
      if (listings.length !== input.listingIds.length) throw new ForbiddenException('Offers may only include your published listings')
    }
    return this.prisma.$transaction(async tx => {
      const offer = await tx.requestOffer.create({
        data: {
          requestId,
          offererId,
          amountCents: input.amountCents,
          message: input.message.trim(),
          items: input.listingIds?.length ? { create: input.listingIds.map(listingId => ({ listingId })) } : undefined
        },
        include: { items: true }
      })
      await this.notifications.createInTransaction(tx, {
        userId: request.requesterId,
        type: 'OFFER_RECEIVED',
        title: 'New offer on your request',
        body: `Someone made an offer on “${request.title}”.`,
        data: { requestId, offerId: offer.id },
      })
      return offer
    })
  }

  async counterOffer(userId: string, offerId: string, input: CounterOfferDto) {
    const offer = await this.prisma.requestOffer.findUnique({ where: { id: offerId }, include: { request: true } })
    if (!offer) throw new NotFoundException('Offer not found')
    if (offer.request.requesterId !== userId && offer.offererId !== userId) throw new ForbiddenException()
    if (!['PENDING', 'COUNTERED'].includes(offer.status)) throw new BadRequestException('Offer is no longer negotiable')
    await this.safety.assertInteractionAllowed(offer.offererId, offer.request.requesterId)
    return this.prisma.$transaction(async tx => {
      const changed = await tx.requestOffer.updateMany({
        where: { id: offerId, status: { in: ['PENDING', 'COUNTERED'] } },
        data: { status: 'COUNTERED' },
      })
      if (changed.count !== 1) throw new ConflictException('Offer status changed; refresh and try again')
      const counterOffer = await tx.counterOffer.create({
        data: { offerId, fromUserId: userId, amountCents: input.amountCents, message: input.message.trim() },
      })
      await this.notifications.createInTransaction(tx, {
        userId: userId === offer.offererId ? offer.request.requesterId : offer.offererId,
        type: 'COUNTEROFFER_RECEIVED',
        title: 'You received a counteroffer',
        body: `There is a new counteroffer on “${offer.request.title}”.`,
        data: { requestId: offer.requestId, offerId },
      })
      return counterOffer
    })
  }

  async acceptOffer(userId: string, offerId: string) {
    const offer = await this.prisma.requestOffer.findUnique({
      where: { id: offerId },
      include: { request: true },
    })
    if (!offer) throw new NotFoundException('Offer not found')
    if (offer.request.requesterId !== userId) throw new ForbiddenException()
    if (offer.status !== 'PENDING' && offer.status !== 'COUNTERED') {
      throw new ConflictException('Offer is no longer available')
    }
    if (offer.request.status !== 'PUBLISHED') {
      throw new ConflictException('Request is no longer accepting offers')
    }
    await this.safety.assertInteractionAllowed(offer.offererId, offer.request.requesterId)

    return this.prisma.$transaction(async tx => {
      const claimedOffer = await tx.requestOffer.updateMany({
        where: { id: offerId, status: { in: ['PENDING', 'COUNTERED'] } },
        data: { status: 'ACCEPTED' },
      })
      const closedRequest = await tx.needRequest.updateMany({
        where: { id: offer.requestId, requesterId: userId, status: 'PUBLISHED' },
        data: { status: 'CLOSED' },
      })
      if (claimedOffer.count !== 1 || closedRequest.count !== 1) {
        throw new ConflictException('The offer or request has already changed')
      }

      const directKey = [offer.request.requesterId, offer.offererId].sort().join(':')
      const conversation = await tx.conversation.upsert({
        where: { directKey },
        create: {
          directKey,
          participants: {
            create: [
              { userId: offer.request.requesterId },
              { userId: offer.offererId },
            ],
          },
        },
        update: {},
      })
      const transaction = await tx.transaction.create({
        data: {
          offerId,
          status: 'ACCEPTED',
          conversation: { connect: { id: conversation.id } },
          participants: {
            create: [
              { userId: offer.request.requesterId, role: 'REQUESTER' },
              { userId: offer.offererId, role: 'OFFERER' },
            ],
          },
          milestones: { create: { fromStatus: 'OFFER_RECEIVED', toStatus: 'ACCEPTED' } },
        },
        include: { conversation: true, participants: true },
      })
      await this.notifications.createInTransaction(tx, {
        userId: offer.offererId,
        type: 'OFFER_ACCEPTED',
        title: 'Your offer was accepted',
        body: `Your offer on “${offer.request.title}” was accepted.`,
        data: { requestId: offer.requestId, offerId, transactionId: transaction.id },
      })
      return transaction
    })
  }

  async rejectOffer(userId: string, offerId: string) {
    const offer = await this.prisma.requestOffer.findUnique({
      where: { id: offerId },
      include: { request: true },
    })
    if (!offer) throw new NotFoundException('Offer not found')
    if (offer.request.requesterId !== userId) throw new ForbiddenException()
    if (offer.status !== 'PENDING' && offer.status !== 'COUNTERED') {
      throw new ConflictException('Offer is no longer available')
    }
    return this.prisma.$transaction(async tx => {
      const result = await tx.requestOffer.updateMany({
        where: {
          id: offerId,
          requestId: offer.requestId,
          status: { in: ['PENDING', 'COUNTERED'] },
          request: { requesterId: userId, status: 'PUBLISHED' },
        },
        data: { status: 'REJECTED' },
      })
      if (result.count !== 1) throw new ConflictException('Offer or request status changed; refresh and try again')
      await this.notifications.createInTransaction(tx, {
        userId: offer.offererId,
        type: 'OFFER_REJECTED',
        title: 'Your offer was declined',
        body: `Your offer on “${offer.request.title}” was declined.`,
        data: { requestId: offer.requestId, offerId },
      })
      return tx.requestOffer.findUniqueOrThrow({ where: { id: offerId } })
    })
  }
}
