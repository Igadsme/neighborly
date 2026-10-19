import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { OfferStatus, Prisma, TransactionStatus } from '@prisma/client'
import { assertNotBlocked } from '../common/blocks'
import { audit } from '../common/logger'
import { activeAccountWhere } from '../common/active-account'
import { publicUserSelect } from '../common/public-user.select'
import { sanitizeText } from '../common/text'
import { DOMAIN_EVENTS } from '../events/domain-events'
import { OutboxWriter } from '../events/outbox-writer'
import { PrismaService } from '../prisma/prisma.service'
import { CounterOfferDto, CreateOfferDto } from './dto'

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




@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxWriter
  ) {}  list() {
    return this.prisma.needRequest.findMany({
      where: { status: 'PUBLISHED', deletedAt: null, requester: activeAccountWhere },
      select: { ...publicRequestSelect, offers: { select: { id: true, status: true } } },
      orderBy: { createdAt: 'desc' }
    })
  }

  /**
   * Submits an offer on a published request. Only a PUBLISHED request
   * accepts offers, so a paused, cancelled, or fulfilled one cannot
   * accumulate new proposals.
   */
  async createOffer(offererId: string, requestId: string, input: CreateOfferDto) {
    const request = await this.prisma.needRequest.findUnique({ where: { id: requestId } })
    if (!request || request.status !== 'PUBLISHED') throw new NotFoundException('Published request not found')
    if (request.requesterId === offererId) throw new BadRequestException('You cannot offer on your own request')
    await assertNotBlocked(this.prisma, offererId, request.requesterId)
    if (input.listingIds?.length) {
      const listings = await this.prisma.listing.findMany({ where: { id: { in: input.listingIds }, sellerId: offererId, status: 'PUBLISHED' }, select: { id: true } })
      if (listings.length !== input.listingIds.length) throw new ForbiddenException('Offers may only include your published listings')
    }
    const offer = await this.prisma.$transaction(async tx => {
      const created = await tx.requestOffer.create({
        data: {
          requestId,
          offererId,
          amountCents: input.amountCents,
          message: sanitizeText(input.message, 4000),
          items: input.listingIds?.length ? { create: input.listingIds.map(listingId => ({ listingId })) } : undefined
        },
        include: { items: true }
      })
      await this.outbox.record(
        DOMAIN_EVENTS.offerReceived,
        {
          offerId: created.id,
          requestId,
          requestTitle: request.title,
          requesterId: request.requesterId,
          offererId,
          amountCents: input.amountCents ?? null
        },
        { actorId: offererId, dedupe: [created.id] },
        tx
      )
      return created
    })
    audit('offer.created', { offererId, offerId: offer.id, requestId })
    return offer
  }

  /** A single offer, readable only by its two parties. */
  async getOffer(userId: string, offerId: string) {
    const offer = await this.prisma.requestOffer.findUnique({
      where: { id: offerId },
      include: {
        offerer: { select: publicUserSelect },
        items: { include: { listing: { select: { id: true, title: true, priceCents: true, status: true } } } },
        counterOffers: { orderBy: { createdAt: 'asc' } },
        request: { select: { id: true, title: true, status: true, requesterId: true } }
      }
    })
    if (!offer) throw new NotFoundException('Offer not found')
    if (offer.offererId !== userId && offer.request.requesterId !== userId) {
      throw new ForbiddenException()
    }
    return offer
  }

  /** Offers received or sent, scoped so one member cannot read another's. */
  listOffers(
    userId: string,
    scope: 'received' | 'sent' | 'all' = 'received',
    query: { status?: OfferStatus; limit?: number; offset?: number } = {}
  ) {
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
      where: { ...where, ...(query.status ? { status: query.status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(query.limit ?? 50, 1), 100),
      skip: query.offset ?? 0,
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

  /**
   * Offers on one request. Only the requester sees every offer; an offerer
   * sees only their own, so one provider's price and message never leak to
   * another.
   */
  async listOffersForRequest(userId: string, requestId: string, query: { status?: OfferStatus; limit?: number; offset?: number } = {}) {
    const request = await this.prisma.needRequest.findUnique({
      where: { id: requestId },
      select: { requesterId: true }
    })
    if (!request) throw new NotFoundException('Request not found')
    const isRequester = request.requesterId === userId
    return this.prisma.requestOffer.findMany({
      where: {
        requestId,
        ...(query.status ? { status: query.status } : {}),
        // A non-requester sees only their own offer.
        ...(isRequester ? {} : { offererId: userId })
      },
      orderBy: { createdAt: 'asc' },
      take: Math.min(Math.max(query.limit ?? 50, 1), 100),
      skip: query.offset ?? 0,
      include: {
        offerer: { select: publicUserSelect },
        items: { include: { listing: { select: { id: true, title: true, priceCents: true, status: true } } } }
      }
    })
  }

  /**
   * Edits an offer while it is still negotiable. Once the requester has
   * accepted or rejected, the offer is history and is immutable.
   */
  async editOffer(userId: string, offerId: string, input: { amountCents?: number; message?: string; listingIds?: string[] }) {
    const offer = await this.prisma.requestOffer.findUnique({
      where: { id: offerId },
      include: { request: { select: { requesterId: true, title: true } } }
    })
    if (!offer) throw new NotFoundException('Offer not found')
    if (offer.offererId !== userId) throw new ForbiddenException()
    if (!negotiableOfferStatuses.includes(offer.status)) {
      throw new ConflictException('This offer can no longer be edited')
    }

    if (input.listingIds?.length) {
      const listings = await this.prisma.listing.findMany({
        where: { id: { in: input.listingIds }, sellerId: userId, status: 'PUBLISHED' },
        select: { id: true }
      })
      if (listings.length !== input.listingIds.length) {
        throw new ForbiddenException('Offers may only include your published listings')
      }
    }

    const updated = await this.prisma.$transaction(async tx => {
      // Conditional claim keeps a concurrent accept from being overwritten.
      const claimed = await tx.requestOffer.updateMany({
        where: { id: offerId, status: { in: negotiableOfferStatuses } },
        data: {
          ...(input.amountCents !== undefined ? { amountCents: input.amountCents } : {}),
          ...(input.message !== undefined ? { message: sanitizeText(input.message, 4000) } : {})
        }
      })
      if (claimed.count === 0) throw new ConflictException('This offer can no longer be edited')
      if (input.listingIds?.length) {
        await tx.offerItem.deleteMany({ where: { offerId } })
        await tx.offerItem.createMany({
          data: input.listingIds.map(listingId => ({ offerId, listingId }))
        })
      }
      const row = await tx.requestOffer.findUniqueOrThrow({ where: { id: offerId } })
      await this.outbox.record(
        DOMAIN_EVENTS.offerUpdated,
        {
          offerId,
          requestId: offer.requestId,
          requesterId: offer.request.requesterId,
          offererId: userId,
          status: row.status
        },
        // One event per edit, keyed on the row's own version timestamp.
        { actorId: userId, dedupe: [offerId, row.updatedAt.toISOString()] },
        tx
      )
      return row
    })
    audit('offer.edited', { userId, offerId })
    return updated
  }

  /** The offerer pulls back an offer nobody has accepted yet. */
  async withdrawOffer(userId: string, offerId: string) {
    const offer = await this.prisma.requestOffer.findUnique({ where: { id: offerId } })
    if (!offer) throw new NotFoundException('Offer not found')
    if (offer.offererId !== userId) throw new ForbiddenException()
    if (offer.status === OfferStatus.ACCEPTED) {
      throw new ConflictException('An accepted offer cannot be withdrawn')
    }
    if (offer.status === OfferStatus.WITHDRAWN) return offer
    return this.prisma.requestOffer.update({
      where: { id: offerId },
      data: { status: OfferStatus.WITHDRAWN }
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
      /*
       * Claim the offer first, then the request.
       *
       * The offer guard alone is not enough: two different offers on the same
       * request are two independent rows, so both could claim themselves and
       * both would create a transaction and a conversation for one request. The
       * request row is the contended resource, so it has to be claimed too, and
       * that claim decides the winner.
       *
       * The order matters for the error the caller sees. Claiming the offer
       * first means a repeat acceptance of an offer that is already accepted
       * reports "Offer is no longer acceptable", which is what it did before
       * and what callers rely on. Only when the offer is genuinely negotiable
       * but the request is already taken does the request-level guard fire.
       */
      const claimed = await tx.requestOffer.updateMany({
        where: { id: offerId, status: { in: negotiableOfferStatuses } },
        data: { status: OfferStatus.ACCEPTED }
      })
      if (claimed.count === 0) throw new BadRequestException('Offer is no longer acceptable')

      // Atomic compare-and-set on the contended resource: the row is locked and
      // re-checked, so exactly one acceptance can move the request out of
      // PUBLISHED and the losers see zero rows affected.
      const claimedRequest = await tx.needRequest.updateMany({
        where: { id: offer.requestId, status: 'PUBLISHED' },
        data: {
          status: 'FULFILLED',
          statusChangedAt: new Date(),
          fulfilledAt: new Date(),
          updatedAt: new Date()
        }
      })
      if (claimedRequest.count === 0) {
        throw new BadRequestException('That request has already been fulfilled')
      }
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

        // The request was claimed above, so this event is always recorded exactly
        // once for the acceptance that actually won.
        await tx.requestStatusEvent.create({
          data: {
            requestId: offer.requestId,
            fromStatus: 'PUBLISHED',
            toStatus: 'FULFILLED',
            actorId: requesterId,
            note: 'An offer was accepted'
          }
        })
        await this.outbox.record(
          DOMAIN_EVENTS.offerAccepted,
          {
            offerId,
            requestId: offer.requestId,
            requesterId: offer.request.requesterId,
            offererId: offer.offererId,
            transactionId: transaction.id,
            conversationId: conversation.id
          },
          // Unique per offer, so a retry cannot duplicate the event.
          { actorId: requesterId, dedupe: [offerId] },
          tx
        )
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
    return this.prisma.$transaction(async tx => {
      // Atomic claim: only a negotiable offer can be rejected.
      const claimed = await tx.requestOffer.updateMany({
        where: { id: offerId, status: { in: negotiableOfferStatuses } },
        data: { status: OfferStatus.REJECTED }
      })
      if (claimed.count === 0) throw new BadRequestException('Offer is no longer rejectable')
      await this.outbox.record(
        DOMAIN_EVENTS.offerRejected,
        {
          offerId,
          requestId: offer.requestId,
          requesterId: offer.request.requesterId,
          offererId: offer.offererId
        },
        { actorId: requesterId, dedupe: [offerId] },
        tx
      )
      return tx.requestOffer.findUniqueOrThrow({ where: { id: offerId } })
    })
  }

  private async loadRequesterOffer(requesterId: string, offerId: string, requestId?: string) {
    const offer = await this.prisma.requestOffer.findUnique({ where: { id: offerId }, include: { request: true } })
    if (!offer || (requestId !== undefined && offer.requestId !== requestId)) throw new NotFoundException('Offer not found')
    if (offer.request.requesterId !== requesterId) throw new ForbiddenException()
    return offer
  }
}
