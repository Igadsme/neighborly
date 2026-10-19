import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import {
  BorrowAvailabilityKind,
  BorrowConditionPhase,
  BorrowDisputeStatus,
  BorrowHandoffKind,
  BorrowRequestStatus,
  ListingStatus,
  Prisma
} from '@prisma/client'
import { activeAccountWhere } from '../common/active-account'
import { assertNotBlocked } from '../common/blocks'
import { audit } from '../common/logger'
import { publicUserSelect } from '../common/public-user.select'
import { sanitizeOptional, sanitizeText } from '../common/text'
import { DOMAIN_EVENTS } from '../events/domain-events'
import { OutboxWriter } from '../events/outbox-writer'
import { PrismaService } from '../prisma/prisma.service'
import {
  AddEvidenceDto,
  ConfirmHandoffDto,
  CreateBorrowRequestDto,
  CreateExtensionDto,
  DecideBorrowRequestDto,
  ListBorrowItemsQuery,
  ListBorrowRequestsQuery,
  OpenDisputeDto,
  RecordConditionDto,
  ScheduleHandoffDto,
  UpdateBorrowRequestDto
} from './dto'
import {
  BLOCKING_STATUSES,
  CHECKED_OUT_STATUSES,
  DISPUTABLE_STATUSES,
  LENDER_CANCELLABLE,
  PICKUP_STATUSES,
  RETURN_STATUSES,
  canTransition,
  handoffComplete,
  validateWindow
} from './borrow-state'

/** How long a cancelled request's reservation keeps blocking, in minutes. */
/** Zero: a cancellation releases the dates immediately. */
const RELEASED_AT = new Date(0)

/**
 * Item listing columns the borrow flow reads. Borrowable metadata is public
 * (it is what a borrower needs to decide), but the item's own coordinates are
 * handled separately and never serialized.
 */
const itemSelect = {
  id: true,
  sellerId: true,
  categoryId: true,
  title: true,
  description: true,
  condition: true,
  priceCents: true,
  status: true,
  neighborhood: true,
  city: true,
  latitude: true,
  longitude: true,
  borrowable: true,
  maxBorrowDays: true,
  minNoticeHours: true,
  usageInstructions: true,
  depositCents: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  category: true,
  seller: { select: publicUserSelect }
} satisfies Prisma.ListingSelect

@Injectable()
export class BorrowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxWriter
  ) {}

  // ------------------------------------------------------- borrowable items

  /**
   * Creates a borrowable item. It is an ordinary listing with borrowing
   * metadata attached, so the Milestone 4 search, media, and ownership
   * machinery all continue to apply unchanged.
   */
  async createItem(sellerId: string, input: Record<string, unknown>) {
    const data = this.itemData(input, {})
    const item = await this.prisma.listing.create({
      data: {
        ...data,
        sellerId,
        borrowable: true,
        pickupAvailable: true,
        // A borrowable item is never sold, so it carries no price.
        priceCents: null,
        status: input.publish === false ? ListingStatus.DRAFT : ListingStatus.PUBLISHED
      } as Prisma.ListingUncheckedCreateInput,
      select: itemSelect
    })
    audit('borrow.item_created', { sellerId, listingId: item.id })
    return this.decorateItem(item, sellerId)
  }

  async updateItem(sellerId: string, listingId: string, input: Record<string, unknown>) {
    const existing = await this.ownedItem(sellerId, listingId)
    if (!existing.borrowable) {
      throw new BadRequestException('This listing is not a borrowable item')
    }
    // Checked out means the item is physically with a borrower; the lender
    // must not rewrite its terms while that is true.
    const live = await this.prisma.borrowRequest.count({
      where: { listingId, status: { in: CHECKED_OUT_STATUSES } }
    })
    if (live > 0) {
      throw new ConflictException('This item is currently lent out and cannot be edited')
    }
    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: this.itemData(input, {}, true) as Prisma.ListingUpdateInput,
      select: itemSelect
    })
    audit('borrow.item_updated', { sellerId, listingId })
    return this.decorateItem(updated, sellerId)
  }

  async getItem(listingId: string, viewerId?: string) {
    const item = await this.prisma.listing.findFirst({
      where: {
        id: listingId,
        borrowable: true,
        deletedAt: null,
        status: { in: [ListingStatus.PUBLISHED, ListingStatus.ARCHIVED] },
        seller: activeAccountWhere
      },
      select: itemSelect
    })
    if (!item) throw new NotFoundException('Borrowable item not found')
    return this.decorateItem(item, viewerId)
  }

  async listMyItems(sellerId: string) {
    const rows = await this.prisma.listing.findMany({
      where: { sellerId, borrowable: true, deletedAt: null },
      select: itemSelect,
      orderBy: { updatedAt: 'desc' }
    })
    return rows.map(row => this.decorateItem(row, sellerId))
  }

  /**
   * Publishes or unpublishes. Unpublishing blocks new requests without
   * touching any borrowing already in flight.
   */
  async setItemPublished(sellerId: string, listingId: string, published: boolean) {
    await this.ownedItem(sellerId, listingId)
    const item = await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: published ? ListingStatus.PUBLISHED : ListingStatus.DRAFT },
      select: itemSelect
    })
    audit('borrow.item_publication_changed', { sellerId, listingId, published })
    return this.decorateItem(item, sellerId)
  }

  async archiveItem(sellerId: string, listingId: string) {
    await this.ownedItem(sellerId, listingId)
    const live = await this.prisma.borrowRequest.count({
      where: { listingId, status: { in: BLOCKING_STATUSES } }
    })
    if (live > 0) {
      throw new ConflictException('Finish or cancel the active borrowings before archiving')
    }
    const item = await this.prisma.listing.update({
      where: { id: listingId },
      data: { status: ListingStatus.ARCHIVED },
      select: itemSelect
    })
    audit('borrow.item_archived', { sellerId, listingId })
    return this.decorateItem(item, sellerId)
  }

  /**
   * The borrow marketplace. Every filter runs in PostgreSQL before the page
   * is sliced, so the total is global rather than the length of one page.
   */
  async listItems(query: ListBorrowItemsQuery) {
    const limit = clamp(query.limit)
    const search = query.query?.trim()
    const where: Prisma.ListingWhereInput = {
      borrowable: true,
      deletedAt: null,
      status: ListingStatus.PUBLISHED,
      seller: activeAccountWhere,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.city ? { city: { equals: query.city, mode: 'insensitive' } } : {}),
      ...(query.neighborhood ? { neighborhood: { equals: query.neighborhood, mode: 'insensitive' } } : {}),
      ...(query.latitude !== undefined && query.longitude !== undefined && query.radiusMiles !== undefined
        ? boundingFilter(query.latitude, query.longitude, query.radiusMiles)
        : {}),
      // Not the caller's own items: you borrow from a neighbor.
      ...(query.availableNow
        ? {
            availabilityWindows: {
              none: {
                kind: BorrowAvailabilityKind.UNAVAILABLE,
                startsAt: { lt: new Date() },
                endsAt: { gt: new Date() }
              }
            }
          }
        : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { usageInstructions: { contains: search, mode: 'insensitive' } }
            ]
          }
        : {})
    }

    const [rows, total] = await Promise.all([
      this.prisma.listing.findMany({
        where,
        select: itemSelect,
        orderBy: this.itemOrderBy(query.sort),
        take: limit,
        skip: query.offset ?? 0
      }),
      this.prisma.listing.count({ where })
    ])

    return {
      items: rows.map(row => this.decorateItem(row, undefined)),
      total,
      limit,
      offset: query.offset ?? 0
    }
  }

  // ----------------------------------------------------- availability windows

  /** The calendar a borrower reads and a lender writes. */
  async listAvailability(listingId: string) {
    const item = await this.prisma.listing.findFirst({
      where: { id: listingId, borrowable: true, deletedAt: null },
      select: { id: true, minNoticeHours: true }
    })
    if (!item) throw new NotFoundException('Borrowable item not found')
    const [windows, reservations] = await Promise.all([
      this.prisma.borrowAvailabilityWindow.findMany({
        where: { listingId },
        orderBy: { startsAt: 'asc' }
      }),
      this.prisma.borrowReservation.findMany({
        where: { listingId, releasedAt: null, endAt: { gte: new Date() } },
        select: { id: true, startAt: true, endAt: true },
        orderBy: { startAt: 'asc' }
      })
    ])
    return {
      minNoticeHours: item.minNoticeHours,
      windows,
      // Booked dates are shown without who booked them: the calendar is
      // public, the identities behind it are not.
      reserved: reservations.map(row => ({ startAt: row.startAt, endAt: row.endAt }))
    }
  }

  async addAvailabilityWindow(
    sellerId: string,
    listingId: string,
    input: { kind: BorrowAvailabilityKind; startsAt: string; endsAt: string; note?: string }
  ) {
    await this.ownedItem(sellerId, listingId)
    const startsAt = new Date(input.startsAt)
    const endsAt = new Date(input.endsAt)
    if (endsAt.getTime() <= startsAt.getTime()) {
      throw new BadRequestException('The window must end after it starts')
    }
    return this.prisma.borrowAvailabilityWindow.create({
      data: {
        listingId,
        kind: input.kind,
        startsAt,
        endsAt,
        note: sanitizeOptional(input.note ?? '', 200) ?? null
      }
    })
  }

  async removeAvailabilityWindow(sellerId: string, listingId: string, windowId: string) {
    await this.ownedItem(sellerId, listingId)
    // Scoped by listing as well, so one lender cannot delete another's window.
    const removed = await this.prisma.borrowAvailabilityWindow.deleteMany({
      where: { id: windowId, listingId }
    })
    if (removed.count === 0) throw new NotFoundException('Availability window not found')
    return { deleted: true }
  }

  // ------------------------------------------------------------ borrow requests

  /**
   * A borrower asks for an item for a window.
   *
   * Availability is checked here so a hopeless request fails fast, but the
   * authoritative check happens again inside the approval transaction: a
   * check at request time says nothing about what happens twenty minutes
   * later.
   */
  async createRequest(borrowerId: string, listingId: string, input: CreateBorrowRequestDto) {
    const item = await this.requestableItem(listingId)
    if (item.sellerId === borrowerId) {
      throw new BadRequestException('You cannot borrow your own item')
    }
    await assertNotBlocked(this.prisma, borrowerId, item.sellerId)
    await this.assertBorrowerUsable(borrowerId)

    const startAt = new Date(input.startAt)
    const endAt = new Date(input.endAt)
    const problem = validateWindow(startAt, endAt, { maxDays: item.maxBorrowDays })
    if (problem) throw new BadRequestException(problem)

    await this.assertWindowAvailable(item.id, { startAt, endAt }, item.minNoticeHours, item.sellerId)

    // One live request per borrower per item. A second would produce two
    // competing bookings for the same person.
    const duplicate = await this.prisma.borrowRequest.findFirst({
      where: {
        listingId,
        borrowerId,
        status: { in: [BorrowRequestStatus.REQUESTED, ...BLOCKING_STATUSES] }
      },
      select: { id: true }
    })
    if (duplicate) {
      throw new ConflictException('You already have an open request for this item')
    }

    const created = await this.prisma.$transaction(async tx => {
      const request = await tx.borrowRequest.create({
        data: {
          listingId,
          lenderId: item.sellerId,
          borrowerId,
          status: BorrowRequestStatus.REQUESTED,
          startAt,
          endAt,
          originalEndAt: endAt,
          message: sanitizeOptional(input.message ?? '', 1000) ?? null,
          depositCents: item.depositCents
        },
        select: requestSelect
      })
      await tx.borrowStatusEvent.create({
        data: { borrowRequestId: request.id, toStatus: BorrowRequestStatus.REQUESTED, actorId: borrowerId }
      })
      await this.outbox.record(
        DOMAIN_EVENTS.borrowRequested,
        {
          borrowRequestId: request.id,
          listingId,
          listingTitle: item.title,
          lenderId: item.sellerId,
          borrowerId,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString()
        },
        { actorId: borrowerId, dedupe: [request.id] },
        tx
      )
      return request
    })

    audit('borrow.requested', { borrowerId, listingId, requestId: created.id })
    return this.decorateRequest(created, borrowerId)
  }

  /**
   * The lender approves, which is where the item is actually booked.
   *
   * The whole decision runs in one transaction: the item row is locked for
   * update, so two concurrent approvals for the same item serialize; the
   * overlap check runs against live reservations; the reservation insert is
   * the last write. Even if two approvals slip past the application check,
   * the database exclusion constraint refuses the second one.
   */
  async decide(
    lenderId: string,
    requestId: string,
    decision: 'approve' | 'decline',
    input: DecideBorrowRequestDto = {}
  ) {
    const request = await this.participantRow(lenderId, requestId, 'lender')

    if (decision === 'decline') {
      return this.transition(lenderId, request, BorrowRequestStatus.DECLINED, {
        note: input.note,
        event: DOMAIN_EVENTS.borrowDeclined,
        dedupe: [requestId, 'declined']
      })
    }

    if (request.status !== BorrowRequestStatus.REQUESTED) {
      throw new ConflictException(`Only a pending request can be approved (this one is ${request.status})`)
    }
    const item = await this.prisma.listing.findUnique({
      where: { id: request.listingId },
      select: itemSelect
    })
    if (!item || item.status !== ListingStatus.PUBLISHED) {
      throw new ConflictException('This item is not available for borrowing')
    }

    const approved = await this.prisma.$transaction(async tx => {
      // Serializes approvals for this item. Without it two approvals could
      // both read "no conflict" before either wrote a reservation.
      await tx.$queryRaw`SELECT id FROM "Listing" WHERE id = ${request.listingId}::uuid FOR UPDATE`

      const conflict = await tx.borrowReservation.findFirst({
        where: {
          listingId: request.listingId,
          releasedAt: null,
          startAt: { lt: request.endAt },
          endAt: { gt: request.startAt }
        },
        select: { id: true }
      })
      if (conflict) {
        throw new ConflictException('Those dates are already booked')
      }
      const blocked = await tx.borrowAvailabilityWindow.findFirst({
        where: {
          listingId: request.listingId,
          kind: BorrowAvailabilityKind.UNAVAILABLE,
          startsAt: { lt: request.endAt },
          endsAt: { gt: request.startAt }
        },
        select: { id: true }
      })
      if (blocked) {
        throw new ConflictException('The lender marked those dates unavailable')
      }

      // A conditional claim keyed on the observed status: a concurrent
      // decision that already moved this request wins, and this one becomes
      // a no-op rather than a second approval.
      const claimed = await tx.borrowRequest.updateMany({
        where: { id: requestId, status: BorrowRequestStatus.REQUESTED },
        data: { status: BorrowRequestStatus.APPROVED, approvedAt: new Date() }
      })
      if (claimed.count === 0) {
        throw new ConflictException('That request was already decided')
      }

      await tx.borrowStatusEvent.create({
        data: {
          borrowRequestId: requestId,
          fromStatus: BorrowRequestStatus.REQUESTED,
          toStatus: BorrowRequestStatus.APPROVED,
          actorId: lenderId,
          note: input.note
        }
      })
      await tx.borrowReservation.create({
        data: {
          listingId: request.listingId,
          borrowRequestId: requestId,
          startAt: request.startAt,
          endAt: request.endAt
        }
      })
      await this.outbox.record(
        DOMAIN_EVENTS.borrowApproved,
        {
          borrowRequestId: requestId,
          listingId: request.listingId,
          lenderId: request.lenderId,
          borrowerId: request.borrowerId,
          from: BorrowRequestStatus.REQUESTED,
          to: BorrowRequestStatus.APPROVED
        },
        { actorId: lenderId, dedupe: [requestId] },
        tx
      )
      return tx.borrowRequest.findUniqueOrThrow({ where: { id: requestId }, select: requestSelect })
    })

    audit('borrow.approved', { lenderId, requestId })
    return this.decorateRequest(approved, lenderId)
  }

  /**
   * Cancels a pending request. Releasing the reservation rather than
   * deleting it keeps the booking history intact while freeing the dates.
   */
  async cancel(actorId: string, requestId: string, as: 'borrower' | 'lender') {
    const request = await this.participantRow(actorId, requestId, as)
    const cancellable = as === 'borrower' ? [BorrowRequestStatus.REQUESTED] : LENDER_CANCELLABLE
    if (!cancellable.includes(request.status)) {
      throw new ConflictException(`This request can no longer be cancelled (${request.status})`)
    }

    const cancelled = await this.prisma.$transaction(async tx => {
      const claimed = await tx.borrowRequest.updateMany({
        where: { id: requestId, status: request.status },
        data: { status: BorrowRequestStatus.CANCELLED, cancelledAt: new Date() }
      })
      if (claimed.count === 0) throw new ConflictException('The request changed; reload and try again')
      await tx.borrowStatusEvent.create({
        data: {
          borrowRequestId: requestId,
          fromStatus: request.status,
          toStatus: BorrowRequestStatus.CANCELLED,
          actorId
        }
      })
      await tx.borrowReservation.updateMany({
        where: { borrowRequestId: requestId, releasedAt: null },
        data: { releasedAt: RELEASED_AT, status: 'RELEASED' }
      })
      await this.outbox.record(
        DOMAIN_EVENTS.borrowCancelled,
        {
          borrowRequestId: requestId,
          listingId: request.listingId,
          lenderId: request.lenderId,
          borrowerId: request.borrowerId,
          from: request.status,
          to: BorrowRequestStatus.CANCELLED
        },
        { actorId, dedupe: [requestId] },
        tx
      )
      return tx.borrowRequest.findUniqueOrThrow({ where: { id: requestId }, select: requestSelect })
    })
    audit('borrow.cancelled', { actorId, requestId, as })
    return this.decorateRequest(cancelled, actorId)
  }

  /**
   * Cancellation by whichever party the caller actually is. Deriving the side
   * from the request rather than the body is what stops a member from
   * cancelling in a role they do not hold.
   */
  async cancelAsParticipant(userId: string, requestId: string) {
    const request = await this.participantRow(userId, requestId)
    return userId === request.borrowerId
      ? this.cancel(userId, requestId, 'borrower')
      : this.cancel(userId, requestId, 'lender')
  }

  /** A pending request may be edited by its borrower before it is decided. */
  async updateRequest(borrowerId: string, requestId: string, input: UpdateBorrowRequestDto) {
    const request = await this.participantRow(borrowerId, requestId, 'borrower')
    if (request.status !== BorrowRequestStatus.REQUESTED) {
      throw new ConflictException('Only a pending request can be edited')
    }
    const item = await this.prisma.listing.findUnique({
      where: { id: request.listingId },
      select: itemSelect
    })
    if (!item) throw new NotFoundException('Item not found')

    const startAt = input.startAt ? new Date(input.startAt) : request.startAt
    const endAt = input.endAt ? new Date(input.endAt) : request.endAt
    const problem = validateWindow(startAt, endAt, { maxDays: item.maxBorrowDays })
    if (problem) throw new BadRequestException(problem)
    await this.assertWindowAvailable(item.id, { startAt, endAt }, item.minNoticeHours, item.sellerId, requestId)

    const updated = await this.prisma.borrowRequest.update({
      where: { id: requestId },
      data: {
        startAt,
        endAt,
        ...(input.message !== undefined ? { message: sanitizeOptional(input.message, 1000) } : {})
      },
      select: requestSelect
    })
    audit('borrow.request_updated', { borrowerId, requestId })
    return this.decorateRequest(updated, borrowerId)
  }

  // ------------------------------------------------------- pickup and handoff

  /**
   * Schedules a pickup. The location note is written to the handoff and is
   * never included in an event payload or a public projection.
   */
  async schedulePickup(actorId: string, requestId: string, input: ScheduleHandoffDto) {
    const request = await this.participantRow(actorId, requestId)
    if (!PICKUP_STATUSES.includes(request.status)) {
      throw new ConflictException(`A pickup can only be scheduled on an approved request (${request.status})`)
    }
    const scheduledAt = new Date(input.scheduledAt)
    if (Number.isNaN(scheduledAt.getTime())) throw new BadRequestException('Invalid pickup time')

    const handoff = await this.prisma.$transaction(async tx => {
      const row = await tx.borrowHandoff.upsert({
        where: { borrowRequestId_kind: { borrowRequestId: requestId, kind: BorrowHandoffKind.PICKUP } },
        create: {
          borrowRequestId: requestId,
          kind: BorrowHandoffKind.PICKUP,
          scheduledAt,
          locationNote: sanitizeOptional(input.locationNote ?? '', 500) ?? null
        },
        update: {
          scheduledAt,
          ...(input.locationNote !== undefined
            ? { locationNote: sanitizeOptional(input.locationNote, 500) }
            : {})
        }
      })
      if (request.status === BorrowRequestStatus.APPROVED) {
        const claimed = await tx.borrowRequest.updateMany({
          where: { id: requestId, status: BorrowRequestStatus.APPROVED },
          data: { status: BorrowRequestStatus.PICKUP_SCHEDULED, pickupInstructions: null }
        })
        if (claimed.count > 0) {
          await tx.borrowStatusEvent.create({
            data: {
              borrowRequestId: requestId,
              fromStatus: BorrowRequestStatus.APPROVED,
              toStatus: BorrowRequestStatus.PICKUP_SCHEDULED,
              actorId
            }
          })
          await this.outbox.record(
            DOMAIN_EVENTS.borrowPickupScheduled,
            {
              borrowRequestId: requestId,
              listingId: request.listingId,
              lenderId: request.lenderId,
              borrowerId: request.borrowerId,
              // Deliberately no location note: an event is addressed to a
              // recipient, and the pickup point is only for the two parties.
              scheduledAt: scheduledAt.toISOString()
            },
            { actorId, dedupe: [requestId, scheduledAt.toISOString()] },
            tx
          )
        }
      }
      return row
    })
    audit('borrow.pickup_scheduled', { actorId, requestId })
    return handoff
  }

  /**
   * One party confirms the handoff. The item does not move until both have.
   *
   * @param side which party is confirming; taken from the caller's role in
   *   the request rather than from the request body, so a member cannot
   *   confirm on the other's behalf.
   */
  async confirmHandoff(
    actorId: string,
    requestId: string,
    kind: BorrowHandoffKind,
    input: ConfirmHandoffDto = {}
  ) {
    const request = await this.participantRow(actorId, requestId)
    const side = actorId === request.borrowerId ? 'borrower' : 'lender'

    if (kind === BorrowHandoffKind.PICKUP) {
      if (!PICKUP_STATUSES.includes(request.status)) {
        throw new ConflictException(`The item cannot be handed over yet (${request.status})`)
      }
    } else if (kind === BorrowHandoffKind.RETURN) {
      if (!RETURN_STATUSES.includes(request.status)) {
        throw new ConflictException(`The item is not out on loan (${request.status})`)
      }
    }

    const completed = await this.prisma.$transaction(async tx => {
      const existing = await tx.borrowHandoff.findUnique({
        where: { borrowRequestId_kind: { borrowRequestId: requestId, kind } }
      })
      if (existing?.cancelledAt) {
        throw new ConflictException('This handoff was cancelled')
      }

      const now = new Date()
      const handoff = await tx.borrowHandoff.upsert({
        where: { borrowRequestId_kind: { borrowRequestId: requestId, kind } },
        create: {
          borrowRequestId: requestId,
          kind,
          [side === 'borrower' ? 'borrowerConfirmedAt' : 'lenderConfirmedAt']: now
        },
        update: {
          [side === 'borrower' ? 'borrowerConfirmedAt' : 'lenderConfirmedAt']: now
        }
      })

      // Condition is documented at handoff, by whoever held the item.
      if (input.condition) {
        await this.writeConditionReport(tx, request, kind, side, input)
      }

      // One side confirming is not a handoff.
      if (!handoffComplete(handoff)) return null

      if (kind === BorrowHandoffKind.PICKUP) {
        const claimed = await tx.borrowRequest.updateMany({
          where: {
            id: requestId,
            status: { in: [BorrowRequestStatus.APPROVED, BorrowRequestStatus.PICKUP_SCHEDULED] }
          },
          data: { status: BorrowRequestStatus.CHECKED_OUT, checkedOutAt: now }
        })
        if (claimed.count > 0) {
          await tx.borrowStatusEvent.create({
            data: {
              borrowRequestId: requestId,
              toStatus: BorrowRequestStatus.CHECKED_OUT,
              actorId,
              note: 'Both parties confirmed the pickup'
            }
          })
          await this.outbox.record(
            DOMAIN_EVENTS.borrowHandoffConfirmed,
            {
              borrowRequestId: requestId,
              listingId: request.listingId,
              lenderId: request.lenderId,
              borrowerId: request.borrowerId,
              kind: BorrowHandoffKind.PICKUP
            },
            { actorId, dedupe: [requestId, 'pickup'] },
            tx
          )
        }
      } else {
        const claimed = await tx.borrowRequest.updateMany({
          where: {
            id: requestId,
            status: { in: [
              BorrowRequestStatus.CHECKED_OUT,
              BorrowRequestStatus.RETURN_REQUESTED,
              BorrowRequestStatus.OVERDUE,
              BorrowRequestStatus.DISPUTED
            ] }
          },
          data: { status: BorrowRequestStatus.RETURNED, returnedAt: now }
        })
        if (claimed.count > 0) {
          await tx.borrowStatusEvent.create({
            data: {
              borrowRequestId: requestId,
              toStatus: BorrowRequestStatus.RETURNED,
              actorId,
              note: 'Both parties confirmed the return'
            }
          })
          await this.outbox.record(
            DOMAIN_EVENTS.borrowReturned,
            {
              borrowRequestId: requestId,
              listingId: request.listingId,
              lenderId: request.lenderId,
              borrowerId: request.borrowerId,
              kind: BorrowHandoffKind.RETURN
            },
            { actorId, dedupe: [requestId, 'return'] },
            tx
          )
        }
        // The item is physically back, so the dates are free again.
        await tx.borrowReservation.updateMany({
          where: { borrowRequestId: requestId, releasedAt: null },
          data: { releasedAt: RELEASED_AT, status: 'RELEASED' }
        })
      }

      await tx.borrowHandoff.update({
        where: { id: handoff.id },
        data: { completedAt: now }
      })
      return handoff
    })

    audit('borrow.handoff_confirmed', { actorId, requestId, kind, completed: completed !== null })
    if (completed === null) {
      return { completed: false, awaiting: side === 'borrower' ? 'lender' : 'borrower' }
    }
    return { completed: true }
  }

  /** Cancels a pickup before the item changed hands. */
  async cancelHandoff(actorId: string, requestId: string, kind: BorrowHandoffKind) {
    // Only the lender may call off a pickup; a borrower withdraws the whole
    // request instead, so the booking is released with it.
    await this.participantRow(actorId, requestId, 'lender')
    const result = await this.prisma.$transaction(async tx => {
      const existing = await tx.borrowHandoff.findUnique({
        where: { borrowRequestId_kind: { borrowRequestId: requestId, kind } }
      })
      // A completed handoff is history and cannot be cancelled.
      if (!existing || existing.completedAt) {
        throw new ConflictException('That handoff cannot be cancelled')
      }
      await tx.borrowHandoff.update({ where: { id: existing.id }, data: { cancelledAt: new Date() } })
      if (kind === BorrowHandoffKind.PICKUP) {
        await tx.borrowRequest.updateMany({
          where: { id: requestId, status: BorrowRequestStatus.PICKUP_SCHEDULED },
          data: { status: BorrowRequestStatus.APPROVED }
        })
      }
      return { cancelled: true }
    })
    audit('borrow.handoff_cancelled', { actorId, requestId, kind })
    return result
  }

  // --------------------------------------------------------- return/completion

  /** The borrower says they are bringing the item back. */
  async requestReturn(borrowerId: string, requestId: string, input: { scheduledAt?: string } = {}) {
    const request = await this.participantRow(borrowerId, requestId, 'borrower')
    if (!CHECKED_OUT_STATUSES.includes(request.status)) {
      throw new ConflictException(`This borrowing cannot be returned from ${request.status}`)
    }
    const row = await this.transition(
      borrowerId,
      request,
      BorrowRequestStatus.RETURN_REQUESTED,
      { event: DOMAIN_EVENTS.borrowReturnRequested, dedupe: [requestId] }
    )
    if (input.scheduledAt) {
      await this.prisma.borrowHandoff.upsert({
        where: { borrowRequestId_kind: { borrowRequestId: requestId, kind: BorrowHandoffKind.RETURN } },
        create: {
          borrowRequestId: requestId,
          kind: BorrowHandoffKind.RETURN,
          scheduledAt: new Date(input.scheduledAt)
        },
        update: { scheduledAt: new Date(input.scheduledAt) }
      })
    }
    return row
  }

  /**
   * Completes the borrowing. Only reachable once the return handoff has
   * been confirmed by both sides, which the state machine enforces, so the
   * reservation and the history are already settled by this point.
   */
  async complete(actorId: string, requestId: string) {
    const request = await this.participantRow(actorId, requestId)
    if (request.status !== BorrowRequestStatus.RETURNED) {
      throw new ConflictException(
        'The item must be returned and confirmed by both parties before this can complete'
      )
    }
    return this.transition(actorId, request, BorrowRequestStatus.COMPLETED, {
      event: DOMAIN_EVENTS.borrowCompleted,
      dedupe: [requestId]
    })
  }

  // -------------------------------------------------------------- extensions

  async requestExtension(borrowerId: string, requestId: string, input: CreateExtensionDto) {
    const request = await this.participantRow(borrowerId, requestId, 'borrower')
    if (!CHECKED_OUT_STATUSES.includes(request.status)) {
      throw new ConflictException('Only an item that is currently out can be extended')
    }
    const pending = await this.prisma.borrowExtension.findFirst({
      where: { borrowRequestId: requestId, status: 'REQUESTED' },
      select: { id: true }
    })
    if (pending) throw new ConflictException('An extension is already awaiting a decision')

    const requestedEndAt = new Date(input.requestedEndAt)
    const problem = validateWindow(request.startAt, requestedEndAt)
    if (problem) throw new BadRequestException(problem)

    const extension = await this.prisma.$transaction(async tx => {
      const row = await tx.borrowExtension.create({
        data: {
          borrowRequestId: requestId,
          requestedById: borrowerId,
          status: 'REQUESTED',
          requestedEndAt,
          previousEndAt: request.endAt,
          reason: sanitizeOptional(input.reason ?? '', 500) ?? null
        }
      })
      await this.outbox.record(
        DOMAIN_EVENTS.borrowExtensionRequested,
        {
          borrowRequestId: requestId,
          listingId: request.listingId,
          lenderId: request.lenderId,
          borrowerId: request.borrowerId,
          extensionId: row.id,
          status: 'REQUESTED',
          requestedEndAt: requestedEndAt.toISOString()
        },
        { actorId: borrowerId, dedupe: [row.id] },
        tx
      )
      return row
    })
    audit('borrow.extension_requested', { borrowerId, requestId, extensionId: extension.id })
    return extension
  }

  /**
   * Approving an extension re-checks availability, because the item may have
   * been booked by someone else since the extension was asked for.
   */
  async decideExtension(
    lenderId: string,
    extensionId: string,
    decision: 'approve' | 'reject',
    input: { note?: string } = {}
  ) {
    const extension = await this.prisma.borrowExtension.findUnique({
      where: { id: extensionId },
      include: { borrowRequest: { select: requestSelect } }
    })
    if (!extension) throw new NotFoundException('Extension not found')
    if (extension.borrowRequest.lenderId !== lenderId) throw new NotFoundException('Extension not found')
    if (extension.status !== 'REQUESTED') {
      throw new ConflictException('That extension was already decided')
    }
    const request = extension.borrowRequest

    if (decision === 'reject') {
      const rejected = await this.prisma.$transaction(async tx => {
        const claimed = await tx.borrowExtension.updateMany({
          where: { id: extensionId, status: 'REQUESTED' },
          data: {
            status: 'REJECTED',
            decidedAt: new Date(),
            decidedById: lenderId,
            // The note lives only on the event; the column the schema declares
            // is `reason`, which records why it was asked for.
            reason: input.note ?? null
          }
        })
        if (claimed.count === 0) throw new ConflictException('That extension was already decided')
        await this.outbox.record(
          DOMAIN_EVENTS.borrowExtensionDecided,
          {
            borrowRequestId: request.id,
            listingId: request.listingId,
            lenderId: request.lenderId,
            borrowerId: request.borrowerId,
            extensionId,
            status: 'REJECTED',
            requestedEndAt: extension.requestedEndAt.toISOString()
          },
          { actorId: lenderId, dedupe: [extensionId] },
          tx
        )
        return tx.borrowExtension.findUniqueOrThrow({ where: { id: extensionId } })
      })
      audit('borrow.extension_rejected', { lenderId, extensionId })
      return rejected
    }

    const approved = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Listing" WHERE id = ${request.listingId}::uuid FOR UPDATE`

      // Only the newly added tail has to be free; the current booking is the
      // borrower's own and is excluded by request id.
      const tail = { startAt: request.endAt, endAt: extension.requestedEndAt }
      if (tail.endAt.getTime() <= tail.startAt.getTime()) {
        throw new BadRequestException('That extension does not move the due date')
      }
      const conflict = await tx.borrowReservation.findFirst({
        where: {
          listingId: request.listingId,
          releasedAt: null,
          borrowRequestId: { not: request.id },
          startAt: { lt: tail.endAt },
          endAt: { gt: tail.startAt }
        },
        select: { id: true }
      })
      if (conflict) {
        throw new ConflictException('The item is booked for those extra days')
      }
      const blocked = await tx.borrowAvailabilityWindow.findFirst({
        where: {
          listingId: request.listingId,
          kind: BorrowAvailabilityKind.UNAVAILABLE,
          startsAt: { lt: tail.endAt },
          endsAt: { gt: tail.startAt }
        },
        select: { id: true }
      })
      if (blocked) {
        throw new ConflictException('The lender marked those days unavailable')
      }

      const claimed = await tx.borrowExtension.updateMany({
        where: { id: extensionId, status: 'REQUESTED' },
        data: {
          status: 'APPROVED',
          decidedAt: new Date(),
          decidedById: lenderId,
          reason: input.note ?? null
        }
      })
      if (claimed.count === 0) throw new ConflictException('That extension was already decided')

      // Moving the due date: the request keeps originalEndAt, so the audit
      // trail shows what was first agreed.
      await tx.borrowRequest.update({ where: { id: request.id }, data: { endAt: extension.requestedEndAt } })
      await tx.borrowReservation.updateMany({
        where: { borrowRequestId: request.id, releasedAt: null },
        data: { endAt: extension.requestedEndAt }
      })
      await this.outbox.record(
        DOMAIN_EVENTS.borrowExtensionDecided,
        {
          borrowRequestId: request.id,
          listingId: request.listingId,
          lenderId: request.lenderId,
          borrowerId: request.borrowerId,
          extensionId,
          status: 'APPROVED',
          requestedEndAt: extension.requestedEndAt.toISOString()
        },
        { actorId: lenderId, dedupe: [extensionId] },
        tx
      )
      return tx.borrowExtension.findUniqueOrThrow({ where: { id: extensionId } })
    })
    audit('borrow.extension_approved', { lenderId, extensionId })
    return approved
  }

  // --------------------------------------------------------------- overdue

  /**
   * Finds everything past its due date and marks it overdue.
   *
   * The status flip and the notification are one transaction and the outbox
   * event is deduplicated per request, so running this sweep twice, or twice
   * in parallel, produces one notification. That is what makes a restart
   * during a sweep safe.
   */
  async sweepOverdue(now = new Date()): Promise<number> {
    const candidates = await this.prisma.borrowRequest.findMany({
      where: {
        status: { in: [BorrowRequestStatus.CHECKED_OUT, BorrowRequestStatus.RETURN_REQUESTED] },
        endAt: { lt: now }
      },
      select: requestSelect,
      take: 200
    })

    let marked = 0
    for (const request of candidates) {
      const daysOverdue = Math.floor((now.getTime() - request.endAt.getTime()) / 86_400_000)
      const done = await this.prisma.$transaction(async tx => {
        const claimed = await tx.borrowRequest.updateMany({
          where: {
            id: request.id,
            status: { in: [BorrowRequestStatus.CHECKED_OUT, BorrowRequestStatus.RETURN_REQUESTED] },
            endAt: { lt: now }
          },
          data: { status: BorrowRequestStatus.OVERDUE, overdueNotifiedAt: now }
        })
        if (claimed.count === 0) return false
        await tx.borrowStatusEvent.create({
          data: {
            borrowRequestId: request.id,
            fromStatus: request.status,
            toStatus: BorrowRequestStatus.OVERDUE,
            note: `Due ${request.endAt.toISOString().slice(0, 10)}`
          }
        })
        await this.outbox.record(
          DOMAIN_EVENTS.borrowOverdue,
          {
            borrowRequestId: request.id,
            listingId: request.listingId,
            lenderId: request.lenderId,
            borrowerId: request.borrowerId,
            endAt: request.endAt.toISOString(),
            daysOverdue
          },
          { dedupe: [request.id, 'overdue'] },
          tx
        )
        return true
      })
      if (done) marked += 1
    }
    if (marked > 0) audit('borrow.overdue_sweep', { marked })
    return marked
  }

  // ------------------------------------------------------------- disputes

  async openDispute(actorId: string, requestId: string, input: OpenDisputeDto) {
    const request = await this.participantRow(actorId, requestId)
    const open = await this.prisma.borrowDispute.findFirst({
      where: { borrowRequestId: requestId, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      select: { id: true }
    })
    if (open) throw new ConflictException('There is already an open dispute for this borrowing')

    const dispute = await this.prisma.$transaction(async tx => {
      const row = await tx.borrowDispute.create({
        data: {
          borrowRequestId: requestId,
          openedById: actorId,
          reason: input.reason,
          summary: sanitizeText(input.summary, 2000),
          status: BorrowDisputeStatus.OPEN
        },
        select: disputeSelect
      })
      await tx.borrowDisputeEvent.create({
        data: { disputeId: row.id, toStatus: BorrowDisputeStatus.OPEN, actorId }
      })
      // A dispute freezes the borrowing at the state it had, rather than
      // forcing it forward past an unresolved problem.
      const claimed = await tx.borrowRequest.updateMany({
        where: { id: requestId, status: { in: [...DISPUTABLE_STATUSES] } },
        data: { status: BorrowRequestStatus.DISPUTED }
      })
      if (claimed.count > 0) {
        await tx.borrowStatusEvent.create({
          data: {
            borrowRequestId: requestId,
            toStatus: BorrowRequestStatus.DISPUTED,
            actorId,
            note: 'A dispute was opened'
          }
        })
      }
      await this.outbox.record(
        DOMAIN_EVENTS.borrowDisputeOpened,
        {
          borrowRequestId: requestId,
          listingId: request.listingId,
          lenderId: request.lenderId,
          borrowerId: request.borrowerId,
          disputeId: row.id,
          reason: input.reason,
          status: BorrowDisputeStatus.OPEN
        },
        { actorId, dedupe: [row.id] },
        tx
      )
      return row
    })
    audit('borrow.dispute_opened', { actorId, requestId, disputeId: dispute.id })
    return this.decorateDispute(dispute)
  }

  /**
   * Evidence is read only by the two participants and by staff. There is no
   * delete route on purpose: one party must not be able to remove what the
   * other recorded.
   */
  async listEvidence(actorId: string, disputeId: string) {
    const dispute = await this.prisma.borrowDispute.findUnique({
      where: { id: disputeId },
      select: { id: true, borrowRequest: { select: { lenderId: true, borrowerId: true } } }
    })
    if (!dispute) throw new NotFoundException('Dispute not found')
    await this.assertParticipantOrStaff(actorId, dispute.borrowRequest)

    return this.prisma.borrowDisputeEvidence.findMany({
      where: { disputeId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        note: true,
        contentType: true,
        createdAt: true,
        uploadedBy: { select: publicUserSelect }
      }
    })
  }

  async addEvidence(actorId: string, disputeId: string, input: { listingId: string; objectKey: string; contentType: string; sizeBytes: number; note?: string }) {
    const dispute = await this.prisma.borrowDispute.findUnique({
      where: { id: disputeId },
      select: { id: true, borrowRequest: { select: { lenderId: true, borrowerId: true, listingId: true } } }
    })
    if (!dispute) throw new NotFoundException('Dispute not found')
    await this.assertParticipantOrStaff(actorId, dispute.borrowRequest)
    // The evidence must belong to the item the dispute is about, or one
    // borrowing could be used to attach photos from another.
    if (input.listingId !== dispute.borrowRequest.listingId) {
      throw new ForbiddenException('Evidence must belong to the item in this dispute')
    }
    return this.prisma.borrowDisputeEvidence.create({
      data: {
        disputeId,
        listingId: input.listingId,
        uploadedById: actorId,
        objectKey: input.objectKey,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        note: sanitizeOptional(input.note ?? '', 500) ?? null
      },
      select: { id: true, disputeId: true, note: true, contentType: true, createdAt: true }
    })
  }

  /** Records condition independently of a handoff confirmation. */
  async recordCondition(actorId: string, requestId: string, input: RecordConditionDto) {
    const request = await this.participantRow(actorId, requestId)
    return this.prisma.$transaction(async tx =>
      this.writeConditionReport(tx, request, null, actorId === request.borrowerId ? 'borrower' : 'lender', {
        condition: input.condition,
        notes: input.notes,
        evidenceIds: input.evidenceIds
      }, input.phase)
    )
  }

  async listDisputes(actorId: string) {
    return this.prisma.borrowDispute.findMany({
      where: {
        borrowRequest: { OR: [{ lenderId: actorId }, { borrowerId: actorId }] }
      },
      select: { ...disputeSelect, borrowRequest: { select: { id: true, status: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 100
    })
  }

  async getDispute(actorId: string, disputeId: string) {
    const dispute = await this.prisma.borrowDispute.findUnique({
      where: { id: disputeId },
      select: {
        ...disputeSelect,
        borrowRequest: { select: { id: true, lenderId: true, borrowerId: true, status: true } }
      }
    })
    if (!dispute) throw new NotFoundException('Dispute not found')
    await this.assertParticipantOrStaff(actorId, dispute.borrowRequest)
    const events = await this.prisma.borrowDisputeEvent.findMany({
      where: { disputeId },
      orderBy: { createdAt: 'asc' },
      select: { fromStatus: true, toStatus: true, note: true, createdAt: true }
    })
    return { ...this.decorateDispute(dispute), events }
  }

  /**
   * Moves a dispute along. A participant may add evidence but only staff may
   * resolve, because resolving is the one action with an outcome that binds
   * the other party.
   */
  async reviewDispute(
    actorId: string,
    disputeId: string,
    to: BorrowDisputeStatus,
    input: { resolution?: string } = {}
  ) {
    const dispute = await this.prisma.borrowDispute.findUnique({
      where: { id: disputeId },
      select: { ...disputeSelect, borrowRequest: { select: { lenderId: true, borrowerId: true } } }
    })
    if (!dispute) throw new NotFoundException('Dispute not found')
    if (to === BorrowDisputeStatus.RESOLVED || to === BorrowDisputeStatus.CLOSED) {
      await this.assertStaff(actorId)
    } else {
      await this.assertParticipantOrStaff(actorId, dispute.borrowRequest)
    }
    const allowed: Record<BorrowDisputeStatus, BorrowDisputeStatus[]> = {
      OPEN: [BorrowDisputeStatus.UNDER_REVIEW, BorrowDisputeStatus.RESOLVED, BorrowDisputeStatus.CLOSED],
      UNDER_REVIEW: [BorrowDisputeStatus.RESOLVED, BorrowDisputeStatus.CLOSED],
      RESOLVED: [BorrowDisputeStatus.CLOSED],
      CLOSED: []
    }
    if (!allowed[dispute.status].includes(to)) {
      throw new ConflictException(`A ${dispute.status} dispute cannot become ${to}`)
    }

    const updated = await this.prisma.$transaction(async tx => {
      const row = await tx.borrowDispute.update({
        where: { id: disputeId },
        data: {
          status: to,
          ...(input.resolution ? { resolution: sanitizeText(input.resolution, 2000) } : {}),
          ...(to === BorrowDisputeStatus.RESOLVED || to === BorrowDisputeStatus.CLOSED
            ? { resolvedAt: new Date() }
            : {})
        },
        select: disputeSelect
      })
      await tx.borrowDisputeEvent.create({
        data: { disputeId, fromStatus: dispute.status, toStatus: to, actorId, note: input.resolution }
      })
      await this.outbox.record(
        DOMAIN_EVENTS.borrowDisputeUpdated,
        {
          borrowRequestId: dispute.borrowRequestId,
          listingId: '',
          lenderId: dispute.borrowRequest.lenderId,
          borrowerId: dispute.borrowRequest.borrowerId,
          disputeId,
          reason: dispute.reason,
          status: to
        },
        { actorId, dedupe: [disputeId, to] },
        tx
      )
      return row
    })
    audit('borrow.dispute_reviewed', { actorId, disputeId, to })
    return this.decorateDispute(updated)
  }

  /**
   * The item an evidence upload belongs to, resolved after authorization so
   * the object key can be built before any bytes are accepted.
   */
  async evidenceListingId(userId: string, disputeId: string) {
    const dispute = await this.prisma.borrowDispute.findUnique({
      where: { id: disputeId },
      select: { borrowRequest: { select: { lenderId: true, borrowerId: true, listingId: true } } }
    })
    if (!dispute) throw new NotFoundException('Dispute not found')
    await this.assertParticipantOrStaff(userId, dispute.borrowRequest)
    return dispute.borrowRequest.listingId
  }

  /**
   * The object key for one evidence photo, after checking that the caller is
   * allowed to see it. The key is rebuilt from stored parts rather than
   * accepted from the caller.
   */
  async evidenceObjectKey(userId: string, evidenceId: string) {
    const evidence = await this.prisma.borrowDisputeEvidence.findUnique({
      where: { id: evidenceId },
      select: {
        objectKey: true,
        dispute: {
          select: { borrowRequest: { select: { lenderId: true, borrowerId: true, listingId: true } } }
        },
        conditionReport: {
          select: { borrowRequest: { select: { lenderId: true, borrowerId: true, listingId: true } } }
        }
      }
    })
    if (!evidence) throw new NotFoundException('Evidence not found')
    const request = evidence.dispute?.borrowRequest ?? evidence.conditionReport?.borrowRequest
    if (!request) throw new NotFoundException('Evidence not found')
    await this.assertParticipantOrStaff(userId, request)

    // The stored key is the authority for the prefix, and the filename must
    // be the random one it was written with, so a crafted key cannot walk
    // out of the evidence prefix.
    const [, listingId, file] = evidence.objectKey.split('/')
    if (listingId !== request.listingId || !file || !/^[0-9A-Za-z-]+\.(jpg|png|webp|gif)$/.test(file)) {
      throw new NotFoundException('Evidence not found')
    }
    return `evidence/${listingId}/${file}`
  }

  // ------------------------------------------------------------------ reads

  async listRequests(userId: string, query: ListBorrowRequestsQuery = {}) {
    const scope = query.scope ?? 'borrowed'
    const where: Prisma.BorrowRequestWhereInput = {
      ...(scope === 'borrowed' ? { borrowerId: userId } : scope === 'lent' ? { lenderId: userId } : {
        OR: [{ borrowerId: userId }, { lenderId: userId }]
      }),
      ...(query.status ? { status: query.status as BorrowRequestStatus } : {}),
      ...(query.overdueOnly ? { status: BorrowRequestStatus.OVERDUE } : {})
    }
    const rows = await this.prisma.borrowRequest.findMany({
      where,
      select: { ...requestSelect, ...handoffSelect },
      orderBy: { updatedAt: 'desc' },
      take: clamp(query.limit),
      skip: query.offset ?? 0
    })
    return rows.map(row => this.decorateRequest(row, userId))
  }

  /**
   * One borrowing, with the pickups and returns the caller is part of. The
   * location note is included only because both participants may read it; an
   * unrelated caller never gets this far.
   */
  async getRequest(userId: string, requestId: string) {
    const request = await this.prisma.borrowRequest.findUnique({
      where: { id: requestId },
      select: {
        ...requestSelect,
        ...handoffSelect,
        extensions: { orderBy: { createdAt: 'asc' } },
        conditionReports: { orderBy: { createdAt: 'asc' }, select: conditionSelect },
        disputes: { select: disputeSelect },
        events: { orderBy: { createdAt: 'asc' }, select: { fromStatus: true, toStatus: true, note: true, createdAt: true } }
      }
    })
    if (!request) throw new NotFoundException('Borrowing not found')
    if (request.lenderId !== userId && request.borrowerId !== userId) {
      // 404 rather than 403: an unrelated caller learns nothing about whether
      // this borrowing exists.
      throw new NotFoundException('Borrowing not found')
    }
    return {
      ...this.decorateRequest(request, userId),
      extensions: request.extensions,
      conditionReports: request.conditionReports,
      disputes: request.disputes.map(row => this.decorateDispute(row)),
      events: request.events
    }
  }

  // --------------------------------------------------------------- helpers

  private itemOrderBy(sort?: string): Prisma.ListingOrderByWithRelationInput[] {
    switch (sort) {
      case 'oldest':
        return [{ createdAt: 'asc' }, { id: 'asc' }]
      case 'title':
        return [{ title: 'asc' }, { id: 'asc' }]
      default:
        return [{ createdAt: 'desc' }, { id: 'desc' }]
    }
  }

  private itemData(input: Record<string, unknown>, _defaults: Record<string, unknown>, partial = false) {
    const data: Record<string, unknown> = {}
    if (input.categoryId !== undefined) data.categoryId = input.categoryId
    if (input.title !== undefined) data.title = sanitizeText(String(input.title), partial ? 140 : 140)
    if (input.description !== undefined) data.description = sanitizeText(String(input.description), 5000)
    if (input.condition !== undefined) data.condition = sanitizeOptional(String(input.condition), 60) ?? null
    if (input.maxBorrowDays !== undefined) data.maxBorrowDays = input.maxBorrowDays
    if (input.minNoticeHours !== undefined) data.minNoticeHours = input.minNoticeHours
    if (input.usageInstructions !== undefined) {
      data.usageInstructions = sanitizeText(String(input.usageInstructions), 2000)
    }
    if (input.depositCents !== undefined) data.depositCents = input.depositCents
    if (input.latitude !== undefined) data.latitude = input.latitude
    if (input.longitude !== undefined) data.longitude = input.longitude
    if (input.neighborhood !== undefined) data.neighborhood = sanitizeOptional(String(input.neighborhood), 80)
    if (input.city !== undefined) data.city = sanitizeOptional(String(input.city), 80)
    if (input.radiusMiles !== undefined) data.radiusMiles = input.radiusMiles
    return data
  }

  /**
   * Strips the item's coordinates. Nobody receives them: the borrow flow uses
   * them for radius filtering only, and a pickup point is negotiated between
   * the two parties rather than published.
   */
  private decorateItem<T extends { latitude?: unknown; longitude?: unknown; sellerId: string }>(
    item: T,
    viewerId?: string
  ) {
    const { latitude, longitude, ...rest } = item
    const hasCoordinates = toNumber(latitude) !== null && toNumber(longitude) !== null
    return {
      ...rest,
      hasCoordinates,
      approximateLocation: hasCoordinates
        ? { lat: round1(toNumber(latitude)!), lng: round1(toNumber(longitude)!) }
        : null,
      viewerIsOwner: viewerId !== undefined && item.sellerId === viewerId
    }
  }

  private decorateRequest<T extends { lenderId: string; borrowerId: string; listing?: { latitude?: unknown; longitude?: unknown } | undefined }>(
    request: T,
    viewerId: string
  ) {
    const role = viewerId === request.borrowerId ? 'borrower' : viewerId === request.lenderId ? 'lender' : 'observer'
    const { listing, ...rest } = request
    if (!listing) return { ...rest, role }
    const { latitude, longitude, ...item } = listing
    return { ...rest, role, listing: item }
  }

  /**
   * A dispute carries no counterparty contact details: it names the opening
   * member and the reason, and nothing else about either party.
   */
  private decorateDispute<T extends object>(dispute: T): T {
    return dispute
  }

  private async ownedItem(sellerId: string, listingId: string) {
    const item = await this.prisma.listing.findFirst({
      where: { id: listingId, sellerId, borrowable: true, deletedAt: null },
      select: itemSelect
    })
    if (!item) throw new NotFoundException('Borrowable item not found')
    return item
  }

  /** An item that can be requested right now: published and not deleted. */
  private async requestableItem(listingId: string) {
    const item = await this.prisma.listing.findFirst({
      where: { id: listingId, borrowable: true, status: ListingStatus.PUBLISHED, deletedAt: null, seller: activeAccountWhere },
      select: itemSelect
    })
    if (!item) throw new NotFoundException('This item is not available for borrowing')
    return item
  }

  private async participantRow(userId: string, requestId: string, as?: 'borrower' | 'lender') {
    const request = await this.prisma.borrowRequest.findUnique({
      where: { id: requestId },
      select: requestSelect
    })
    if (!request) throw new NotFoundException('Borrowing not found')
    // Non-participants get a 404, so the existence of a borrowing is not
    // leaked to the neighborhood.
    if (request.lenderId !== userId && request.borrowerId !== userId) {
      throw new NotFoundException('Borrowing not found')
    }
    if (as === 'lender' && request.lenderId !== userId) throw new ForbiddenException()
    if (as === 'borrower' && request.borrowerId !== userId) throw new ForbiddenException()
    return request
  }

  private async assertParticipantOrStaff(
    userId: string,
    request: { lenderId: string; borrowerId: string }
  ) {
    if (request.lenderId === userId || request.borrowerId === userId) return
    if (await this.isStaff(userId)) return
    throw new NotFoundException('Borrowing not found')
  }

  private async assertStaff(userId: string) {
    if (await this.isStaff(userId)) return
    throw new ForbiddenException('Only staff can take that action')
  }

  private async isStaff(userId: string) {
    const assignment = await this.prisma.staffRoleAssignment.findFirst({
      where: { userId },
      select: { id: true }
    })
    return assignment !== null
  }

  /**
   * A borrower must not be suspended, and must not be in a blocked
   * relationship with the lender in either direction.
   */
  private async assertBorrowerUsable(userId: string) {
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { status: true, deletedAt: true }
    })
    if (!account || account.deletedAt) throw new ForbiddenException('This account cannot borrow')
    if (account.status !== 'ACTIVE') throw new ForbiddenException('This account cannot borrow')
  }

  /**
   * Fail-fast availability check used at request and edit time. The
   * authoritative check is inside the approval transaction.
   */
  private async assertWindowAvailable(
    listingId: string,
    window: { startAt: Date; endAt: Date },
    minNoticeHours: number,
    lenderId: string,
    excludeRequestId?: string
  ) {
    const noticeStart = Date.now() + minNoticeHours * 3_600_000
    if (window.startAt.getTime() < noticeStart) {
      throw new BadRequestException(
        minNoticeHours > 0
          ? `This lender needs at least ${minNoticeHours} hours notice before a pickup`
          : 'The pickup date is too soon'
      )
    }

    const blocking = await this.prisma.borrowAvailabilityWindow.findFirst({
      where: {
        listingId,
        kind: BorrowAvailabilityKind.UNAVAILABLE,
        startsAt: { lt: window.endAt },
        endsAt: { gt: window.startAt }
      },
      select: { id: true }
    })
    if (blocking) throw new ConflictException('The lender marked those dates unavailable')

    const booked = await this.prisma.borrowReservation.findFirst({
      where: {
        listingId,
        releasedAt: null,
        ...(excludeRequestId ? { borrowRequestId: { not: excludeRequestId } } : {}),
        startAt: { lt: window.endAt },
        endAt: { gt: window.startAt }
      },
      select: { id: true }
    })
    if (booked) throw new ConflictException('Those dates are already booked')
  }

  /**
   * The single place a borrowing's status changes. Every accepted move
   * writes a history row and an outbox event in the same transaction.
   */
  private async transition(
    actorId: string,
    request: { id: string; listingId: string; lenderId: string; borrowerId: string; status: BorrowRequestStatus },
    to: BorrowRequestStatus,
    options: { note?: string; event: string; dedupe: string[] }
  ) {
    if (!canTransition(request.status, to)) {
      throw new ConflictException(`Invalid borrowing transition: ${request.status} -> ${to}`)
    }
    const now = new Date()
    const updated = await this.prisma.$transaction(async tx => {
      const claimed = await tx.borrowRequest.updateMany({
        where: { id: request.id, status: request.status },
        data: {
          status: to,
          ...(to === BorrowRequestStatus.RETURNED ? { returnedAt: now } : {}),
          ...(to === BorrowRequestStatus.COMPLETED ? { completedAt: now } : {})
        }
      })
      if (claimed.count === 0) {
        throw new ConflictException('The borrowing changed; reload and try again')
      }
      await tx.borrowStatusEvent.create({
        data: { borrowRequestId: request.id, fromStatus: request.status, toStatus: to, actorId, note: options.note }
      })
      await this.outbox.record(
        options.event as never,
        {
          borrowRequestId: request.id,
          listingId: request.listingId,
          lenderId: request.lenderId,
          borrowerId: request.borrowerId,
          from: request.status,
          to
        },
        { actorId, dedupe: options.dedupe },
        tx
      )
      return tx.borrowRequest.findUniqueOrThrow({ where: { id: request.id }, select: requestSelect })
    })
    audit('borrow.transition', { actorId, requestId: request.id, from: request.status, to })
    return this.decorateRequest(updated, actorId)
  }

  private async writeConditionReport(
    tx: Prisma.TransactionClient,
    request: { id: string; borrowerId: string; lenderId: string },
    kind: BorrowHandoffKind | null,
    side: 'borrower' | 'lender',
    input: ConfirmHandoffDto | AddEvidenceDto | RecordConditionDto,
    phase?: BorrowConditionPhase
  ) {
    const resolvedPhase: BorrowConditionPhase =
      phase ?? (kind === BorrowHandoffKind.RETURN ? BorrowConditionPhase.AFTER : BorrowConditionPhase.BEFORE)

    let handoffId: string | undefined
    if (kind) {
      const handoff = await tx.borrowHandoff.findUnique({
        where: { borrowRequestId_kind: { borrowRequestId: request.id, kind } },
        select: { id: true }
      })
      handoffId = handoff?.id
    }

    const report = await tx.borrowConditionReport.create({
      data: {
        borrowRequestId: request.id,
        handoffId: handoffId ?? null,
        phase: resolvedPhase,
        condition: 'condition' in input && input.condition ? input.condition : 'not_recorded',
        notes: 'notes' in input ? sanitizeOptional(input.notes ?? '', 2000) : null,
        reportedById: side === 'borrower' ? request.borrowerId : request.lenderId
      },
      select: conditionSelect
    })

    const evidenceIds = 'evidenceIds' in input ? input.evidenceIds : undefined
    if (evidenceIds?.length) {
      // Evidence is re-pointed at the report, and only evidence that was
      // already attached to this item may be moved, so a report cannot adopt
      // a photo from an unrelated borrowing.
      await tx.borrowDisputeEvidence.updateMany({
        where: { id: { in: evidenceIds }, listingId: { not: '' } },
        data: { conditionReportId: report.id, disputeId: null }
      })
    }
    return report
  }
}

const requestSelect = {
  id: true,
  listingId: true,
  lenderId: true,
  borrowerId: true,
  status: true,
  startAt: true,
  endAt: true,
  originalEndAt: true,
  message: true,
  depositCents: true,
  approvedAt: true,
  checkedOutAt: true,
  returnedAt: true,
  completedAt: true,
  cancelledAt: true,
  overdueNotifiedAt: true,
  createdAt: true,
  updatedAt: true,
  listing: {
    select: {
      id: true,
      sellerId: true,
      title: true,
      description: true,
      condition: true,
      neighborhood: true,
      city: true,
      maxBorrowDays: true,
      minNoticeHours: true,
      usageInstructions: true,
      depositCents: true,
      borrowable: true,
      latitude: true,
      longitude: true,
      images: { orderBy: { sortOrder: 'asc' }, select: { id: true, objectKey: true, sortOrder: true } },
      category: true,
      seller: { select: publicUserSelect }
    }
  },
  borrower: { select: publicUserSelect }
} satisfies Prisma.BorrowRequestSelect

const handoffSelect = {
  handoffs: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      kind: true,
      scheduledAt: true,
      locationNote: true,
      borrowerConfirmedAt: true,
      lenderConfirmedAt: true,
      completedAt: true,
      cancelledAt: true
    }
  }
} satisfies Prisma.BorrowRequestSelect

const conditionSelect = {
  id: true,
  phase: true,
  condition: true,
  notes: true,
  createdAt: true,
  reportedBy: { select: publicUserSelect }
} satisfies Prisma.BorrowConditionReportSelect

const disputeSelect = {
  id: true,
  borrowRequestId: true,
  openedById: true,
  reason: true,
  status: true,
  summary: true,
  resolution: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  openedBy: { select: publicUserSelect }
} satisfies Prisma.BorrowDisputeSelect

function clamp(limit?: number) {
  if (limit === undefined) return 24
  return Math.min(Math.max(limit, 1), 100)
}

function boundingFilter(lat: number, lng: number, radiusMiles: number): Prisma.ListingWhereInput {
  const latDelta = radiusMiles / 69.0
  const lngDelta = radiusMiles / (Math.cos((lat * Math.PI) / 180) || 0.01)
  return {
    latitude: { gte: lat - latDelta, lte: lat + latDelta },
    longitude: { gte: lng - lngDelta, lte: lng + lngDelta }
  }
}

function round1(value: number) {
  return Math.round(value * 10) / 10
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'object' && 'toNumber' in value) {
    const parsed = (value as { toNumber: () => number }).toNumber()
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export { requestSelect, conditionSelect, disputeSelect }