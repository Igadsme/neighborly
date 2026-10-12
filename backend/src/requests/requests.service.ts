import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, OfferStatus, TransactionStatus } from '@prisma/client'
import { assertNotBlocked } from '../common/blocks'
import { publicUserSelect } from '../common/public-user.select'
import { sanitizeOptional, sanitizeText } from '../common/text'
import { PrismaService } from '../prisma/prisma.service'
import { CounterOfferDto, CreateOfferDto, CreateRequestDto } from './dto'

const negotiableOfferStatuses: OfferStatus[] = [OfferStatus.PENDING, OfferStatus.COUNTERED]

/**
 * Public request projection for anonymous discovery. Deliberately excludes
 * requesterId, latitude, and longitude so precise coordinates never leave the
 * API for non-owners.
 */
const publicRequestSelect = {
  id: true,
  title: true,
  description: true,
  budgetCents: true,
  radiusMiles: true,
  mode: true,
  status: true,
  createdAt: true,
  deadline: true,
  urgency: true,
  category: true,
  requester: { select: publicUserSelect }
} satisfies Prisma.NeedRequestSelect



const offerDetailInclude = {
  orderBy: { createdAt: 'asc' as const },
  include: {
    items: { include: { listing: { select: { id: true, title: true, priceCents: true, status: true } } } },
    offerer: { select: publicUserSelect }
  }
}

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService) {}

  create(requesterId: string, input: CreateRequestDto) {
    return this.prisma.needRequest.create({
      data: {
        requesterId,
        categoryId: input.categoryId,
        title: sanitizeText(input.title, 200),
        description: sanitizeText(input.description),
        budgetCents: input.budgetCents,
        latitude: input.latitude,
        longitude: input.longitude,
        radiusMiles: input.radiusMiles ?? 10,
        deadline: input.deadline ? new Date(input.deadline) : undefined,
        urgency: sanitizeOptional(input.urgency, 80),
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
      select: { ...publicRequestSelect, offers: { select: { id: true, status: true } } },
      orderBy: { createdAt: 'desc' }
    })
  }

  /**
   * Public read with an authorization-aware projection. Anonymous and
   * non-owner callers never receive coordinates or the requester id; the
   * verified owner receives the full row, including coordinates.
   */
  async get(id: string, viewerId?: string) {
    const withPrivateFields = viewerId !== undefined
    const request = await this.prisma.needRequest.findFirst({
      where: { id, status: 'PUBLISHED', deletedAt: null },
      select: {
        ...publicRequestSelect,
        ...(withPrivateFields ? { requesterId: true, latitude: true, longitude: true } : {}),
        offers: offerDetailInclude
      }
    })
    if (!request) throw new NotFoundException('Request not found')
    if (!viewerId) return request
    if (request.requesterId === viewerId) return request
    const { requesterId, latitude, longitude, ...publicView } = request
    return publicView
  }

  async createOffer(offererId: string, requestId: string, input: CreateOfferDto) {
    const request = await this.prisma.needRequest.findUnique({ where: { id: requestId } })
    if (!request || request.status !== 'PUBLISHED') throw new NotFoundException('Published request not found')
    if (request.requesterId === offererId) throw new BadRequestException('You cannot offer on your own request')
    await assertNotBlocked(this.prisma, offererId, request.requesterId)
    if (input.listingIds?.length) {
      const listings = await this.prisma.listing.findMany({ where: { id: { in: input.listingIds }, sellerId: offererId, status: 'PUBLISHED' }, select: { id: true } })
      if (listings.length !== input.listingIds.length) throw new ForbiddenException('Offers may only include your published listings')
    }
    return this.prisma.requestOffer.create({
      data: {
        requestId,
        offererId,
        amountCents: input.amountCents,
        message: sanitizeText(input.message, 4000),
        items: input.listingIds?.length ? { create: input.listingIds.map(listingId => ({ listingId })) } : undefined
      },
      include: { items: true }
    })
  }

  async counterOffer(userId: string, offerId: string, input: CounterOfferDto) {
    const offer = await this.prisma.requestOffer.findUnique({ where: { id: offerId }, include: { request: true } })
    if (!offer) throw new NotFoundException('Offer not found')
    if (offer.request.requesterId !== userId && offer.offererId !== userId) throw new ForbiddenException()
    const otherId = userId === offer.offererId ? offer.request.requesterId : offer.offererId
    await assertNotBlocked(this.prisma, userId, otherId)
    return this.prisma.$transaction(async tx => {
      // Atomic claim: only a negotiable offer can be countered.
      const claimed = await tx.requestOffer.updateMany({
        where: { id: offerId, status: { in: negotiableOfferStatuses } },
        data: { status: 'COUNTERED' }
      })
      if (claimed.count === 0) throw new BadRequestException('Offer is no longer negotiable')
      return tx.counterOffer.create({
        data: { offerId, fromUserId: userId, amountCents: input.amountCents, message: sanitizeText(input.message, 4000) }
      })
    })
  }

  async acceptOffer(requesterId: string, offerId: string, requestId?: string) {
    const offer = await this.loadRequesterOffer(requesterId, offerId, requestId)
    await assertNotBlocked(this.prisma, requesterId, offer.offererId)
    if (!negotiableOfferStatuses.includes(offer.status)) throw new BadRequestException('Offer is no longer acceptable')

    return this.prisma.$transaction(async tx => {
      // Atomic claim: the UPDATE locks the offer row and only succeeds while
      // the offer is still negotiable, so competing accepts cannot both win.
      const claimed = await tx.requestOffer.updateMany({
        where: { id: offerId, status: { in: negotiableOfferStatuses } },
        data: { status: OfferStatus.ACCEPTED }
      })
      if (claimed.count === 0) throw new BadRequestException('Offer is no longer acceptable')
      try {
        const conversation = await tx.conversation.create({
          data: {
            participants: {
              create: [{ userId: offer.request.requesterId }, { userId: offer.offererId }]
            }
          }
        })
        // Transaction.offerId is unique, so a second exchange for this
        // offer fails at the database even if the claim above raced.
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
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new BadRequestException('Offer is no longer acceptable')
        }
        throw error
      }
    })
  }

  async rejectOffer(requesterId: string, offerId: string, requestId?: string) {
    const offer = await this.loadRequesterOffer(requesterId, offerId, requestId)
    await assertNotBlocked(this.prisma, requesterId, offer.offererId)
    // Atomic claim: only a negotiable offer can be rejected.
    const claimed = await this.prisma.requestOffer.updateMany({
      where: { id: offerId, status: { in: negotiableOfferStatuses } },
      data: { status: OfferStatus.REJECTED }
    })
    if (claimed.count === 0) throw new BadRequestException('Offer is no longer rejectable')
    return this.prisma.requestOffer.findUniqueOrThrow({ where: { id: offerId } })
  }

  private async loadRequesterOffer(requesterId: string, offerId: string, requestId?: string) {
    const offer = await this.prisma.requestOffer.findUnique({ where: { id: offerId }, include: { request: true } })
    if (!offer || (requestId !== undefined && offer.requestId !== requestId)) throw new NotFoundException('Offer not found')
    if (offer.request.requesterId !== requesterId) throw new ForbiddenException()
    return offer
  }
}
