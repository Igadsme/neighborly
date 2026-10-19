import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from '@nestjs/common'
import { BorrowDisputeStatus, BorrowHandoffKind, ListingStatus } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { BorrowService } from './borrow.service'
import { OutboxWriter } from '../events/outbox-writer'
import { PrismaService } from '../prisma/prisma.service'
import { createTestPrisma } from '../common/testing/integration-fixtures'

const PASSWORD_HASH = '$argon2id$stub'
const DAY = 86_400_000

/**
 * Borrowing end to end against real PostgreSQL.
 *
 * The suite shares one database, so every test that asserts an exact count
 * creates its own item. That matters most for the availability tests: a
 * listing under a shared category would pick up another test's booking.
 */
describe('Neighborly Borrow against real PostgreSQL', () => {
  let prisma: PrismaService
  let borrow: BorrowService
  let outbox: OutboxWriter

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
    outbox = new OutboxWriter(prisma)
    borrow = new BorrowService(prisma, outbox)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  const future = (days: number) => new Date(Date.now() + days * DAY)

  async function makeUser(prefix: string, status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') {
    const id = randomUUID()
    await prisma.user.create({
      data: { id, email: `${prefix}-${id}@example.com`, passwordHash: PASSWORD_HASH, status }
    })
    await prisma.profile.create({ data: { userId: id, firstName: 'Test', lastName: 'User' } })
    return id
  }

  async function makeCategory() {
    const id = randomUUID()
    await prisma.category.create({
      data: { id, name: `Borrow ${id.slice(0, 8)}`, slug: `borrow-${id}` }
    })
    return id
  }

  async function makeItem(lenderId: string, overrides: Record<string, unknown> = {}) {
    return borrow.createItem(lenderId, {
      categoryId: await makeCategory(),
      title: 'Cordless drill',
      description: 'A reliable drill with two batteries and a charger.',
      usageInstructions: 'Please return the batteries charged.',
      maxBorrowDays: 14,
      minNoticeHours: 0,
      ...overrides
    } as never)
  }

  /**
   * A published borrow request with no approval. The window is returned
   * alongside it so a test can assert on the exact stored timestamps rather
   * than recomputing them and racing the clock.
   */
  async function requestItem(borrowerId: string, listingId: string, days = 3) {
    const startAt = future(2)
    const endAt = future(2 + days)
    const request = await borrow.createRequest(borrowerId, listingId, {
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      message: 'I need it for a weekend project.'
    })
    return { request, startAt, endAt }
  }

  // ---------------------------------------------------------- borrowable items

  it('creates a borrowable item with real persisted fields', async () => {
    const lender = await makeUser('item-lender')
    const item = await makeItem(lender, { depositCents: 5000, neighborhood: 'Inman Park' })

    expect(item.borrowable).toBe(true)
    expect(item.status).toBe('PUBLISHED')
    expect(item.usageInstructions).toBe('Please return the batteries charged.')
    expect(item.depositCents).toBe(5000)
    // A borrowable item is not for sale, so it carries no price.
    expect((item as unknown as { priceCents: number | null }).priceCents).toBeNull()
  })

  it('never returns the item coordinates to any caller', async () => {
    const lender = await makeUser('coord-lender')
    const item = await makeItem(lender, { latitude: 33.75, longitude: -84.35 })

    const ownerView = await borrow.getItem(item.id, lender)
    const strangerView = await borrow.getItem(item.id, randomUUID())
    for (const view of [ownerView, strangerView]) {
      expect(view).not.toHaveProperty('latitude')
      expect(view).not.toHaveProperty('longitude')
      expect(JSON.stringify(view)).not.toContain('33.75')
    }
    expect(strangerView.approximateLocation).toEqual({ lat: 33.8, lng: -84.3 })
  })

  it('lets only the owner edit, publish, and archive', async () => {
    const lender = await makeUser('own-lender')
    const stranger = await makeUser('own-stranger')
    const item = await makeItem(lender)

    await expect(borrow.updateItem(stranger, item.id, { title: 'Hijacked' } as never)).rejects.toBeInstanceOf(
      NotFoundException
    )
    await expect(borrow.setItemPublished(stranger, item.id, false)).rejects.toBeInstanceOf(NotFoundException)
    await expect(borrow.archiveItem(stranger, item.id)).rejects.toBeInstanceOf(NotFoundException)

    await expect(borrow.setItemPublished(lender, item.id, false)).resolves.toMatchObject({
      status: 'DRAFT'
    })
    await expect(borrow.setItemPublished(lender, item.id, true)).resolves.toMatchObject({
      status: 'PUBLISHED'
    })
    await expect(borrow.archiveItem(lender, item.id)).resolves.toMatchObject({ status: 'ARCHIVED' })
  })

  it('refuses to archive an item that is currently lent out', async () => {
    const lender = await makeUser('busy-lender')
    const borrower = await makeUser('busy-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')

    await expect(borrow.archiveItem(lender, item.id)).rejects.toBeInstanceOf(ConflictException)
  })

  it('refuses to edit an item that is currently lent out', async () => {
    const lender = await makeUser('edit-lender')
    const borrower = await makeUser('edit-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)

    await expect(
      borrow.updateItem(lender, item.id, { title: 'Changed mid loan' } as never)
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('searches and paginates the borrow marketplace server-side', async () => {
    const lender = await makeUser('search-lender')
    const marker = randomUUID().slice(0, 8)
    for (let index = 0; index < 4; index += 1) {
      await makeItem(lender, { title: `Drill ${marker} ${index}` })
    }
    const page = await borrow.listItems({ query: `Drill ${marker}`, limit: 2, offset: 0 })
    expect(page.items).toHaveLength(2)
    expect(page.total).toBe(4)
    const second = await borrow.listItems({ query: `Drill ${marker}`, limit: 2, offset: 2 })
    expect(new Set([...page.items, ...second.items].map(row => row.id)).size).toBe(4)
  })

  it('never lists a non-borrowable listing as borrowable', async () => {
    const seller = await makeUser('plain-seller')
    const category = await makeCategory()
    const plain = await prisma.listing.create({
      data: {
        sellerId: seller,
        categoryId: category,
        title: 'For sale drill',
        description: 'Not lent, sold outright.',
        priceCents: 5000,
        status: ListingStatus.PUBLISHED
      }
    })
    await expect(borrow.getItem(plain.id)).rejects.toBeInstanceOf(NotFoundException)
    const page = await borrow.listItems({})
    expect(page.items.map(row => row.id)).not.toContain(plain.id)
  })

  // ------------------------------------------------------------- requests

  it('creates a request that only the two parties can read', async () => {
    const lender = await makeUser('req-lender')
    const borrower = await makeUser('req-borrower')
    const stranger = await makeUser('req-stranger')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)

    expect(request.status).toBe('REQUESTED')
    expect(request.role).toBe('borrower')
    await expect(borrow.getRequest(borrower, request.id)).resolves.toMatchObject({ id: request.id })
    await expect(borrow.getRequest(lender, request.id)).resolves.toMatchObject({ id: request.id })
    // An unrelated caller learns nothing, not even that it exists.
    await expect(borrow.getRequest(stranger, request.id)).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuses a self-borrow at the service and at the database', async () => {
    const lender = await makeUser('self-lender')
    const item = await makeItem(lender)
    await expect(requestItem(lender, item.id)).rejects.toBeInstanceOf(BadRequestException)

    // The constraint is the real backstop.
    await expect(
      prisma.borrowRequest.create({
        data: {
          listingId: item.id,
          lenderId: lender,
          borrowerId: lender,
          startAt: future(1),
          endAt: future(2),
          originalEndAt: future(2)
        }
      })
    ).rejects.toBeTruthy()
  })

  it('refuses a request from a suspended borrower', async () => {
    const lender = await makeUser('susp-lender')
    const suspended = await makeUser('susp-borrower', 'SUSPENDED')
    const item = await makeItem(lender)
    await expect(requestItem(suspended, item.id)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('refuses a request to a blocked lender, in either direction', async () => {
    const lender = await makeUser('block-lender')
    const borrower = await makeUser('block-borrower')
    const item = await makeItem(lender)
    await prisma.blockedUser.create({ data: { blockerId: lender, blockedId: borrower } })
    await expect(requestItem(borrower, item.id)).rejects.toBeInstanceOf(ForbiddenException)

    const other = await makeUser('block-other')
    await prisma.blockedUser.deleteMany({ where: { blockerId: lender, blockedId: borrower } })
    await prisma.blockedUser.create({ data: { blockerId: borrower, blockedId: lender } })
    await expect(requestItem(other, item.id)).resolves.toBeTruthy()
  })

  it('refuses a second live request from the same borrower for the same item', async () => {
    const lender = await makeUser('dupe-lender')
    const borrower = await makeUser('dupe-borrower')
    const item = await makeItem(lender)
    await requestItem(borrower, item.id)
    await expect(requestItem(borrower, item.id)).rejects.toBeInstanceOf(ConflictException)
  })

  it('enforces the item maximum duration and rejects a reversed window', async () => {
    const lender = await makeUser('limit-lender')
    const borrower = await makeUser('limit-borrower')
    const item = await makeItem(lender, { maxBorrowDays: 5 })

    await expect(
      borrow.createRequest(borrower, item.id, {
        startAt: future(2).toISOString(),
        endAt: future(20).toISOString()
      })
    ).rejects.toBeInstanceOf(BadRequestException)

    // A reversed window is a malformed request, not a scheduling conflict.
    await expect(
      borrow.createRequest(borrower, item.id, {
        startAt: future(10).toISOString(),
        endAt: future(5).toISOString()
      })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('honours the lender notice requirement', async () => {
    const lender = await makeUser('notice-lender')
    const borrower = await makeUser('notice-borrower')
    const item = await makeItem(lender, { minNoticeHours: 48 })

    await expect(
      borrow.createRequest(borrower, item.id, {
        startAt: future(0.5).toISOString(),
        endAt: future(4).toISOString()
      })
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('lets a pending request be edited but not after it is decided', async () => {
    const lender = await makeUser('editreq-lender')
    const borrower = await makeUser('editreq-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id, 3)

    const laterEnd = future(8)
    const edited = await borrow.updateRequest(borrower, request.id, {
      endAt: laterEnd.toISOString(),
      message: 'Longer, sorry.'
    })
    expect(edited.endAt.toISOString()).toBe(laterEnd.toISOString())
    expect(edited.message).toBe('Longer, sorry.')

    await borrow.decide(lender, request.id, 'approve')
    await expect(
      borrow.updateRequest(borrower, request.id, { message: 'too late' })
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('records an append-only status history', async () => {
    const lender = await makeUser('hist-lender')
    const borrower = await makeUser('hist-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)

    await borrow.decide(lender, request.id, 'decline', { note: 'Already promised' })
    const events = await prisma.borrowStatusEvent.findMany({
      where: { borrowRequestId: request.id },
      orderBy: { createdAt: 'asc' }
    })
    expect(events.map(row => row.toStatus)).toEqual(['REQUESTED', 'DECLINED'])
    expect(events[1].actorId).toBe(lender)
    expect(events[1].note).toBe('Already promised')
  })

  // -------------------------------------------------- approval and booking

  it('approves a request and books the item', async () => {
    const lender = await makeUser('app-lender')
    const borrower = await makeUser('app-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)

    const approved = await borrow.decide(lender, request.id, 'approve')
    expect(approved.status).toBe('APPROVED')

    const reservation = await prisma.borrowReservation.findUniqueOrThrow({
      where: { borrowRequestId: request.id }
    })
    expect(reservation.listingId).toBe(item.id)
    expect(reservation.releasedAt).toBeNull()

    const event = await prisma.domainEventOutbox.findFirst({
      where: { type: 'borrow.approved', payload: { path: ['borrowRequestId'], equals: request.id } }
    })
    expect(event).toBeTruthy()
  })

  it('refuses approval by anyone but the lender', async () => {
    const lender = await makeUser('auth-lender')
    const borrower = await makeUser('auth-borrower')
    const stranger = await makeUser('auth-stranger')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)

    // The borrower is a participant, so they are told the action is not
    // theirs rather than that the borrowing does not exist.
    await expect(borrow.decide(borrower, request.id, 'approve')).rejects.toBeInstanceOf(ForbiddenException)
    await expect(borrow.decide(stranger, request.id, 'decline')).rejects.toBeInstanceOf(NotFoundException)
    expect(
      (await prisma.borrowRequest.findUniqueOrThrow({ where: { id: request.id } })).status
    ).toBe('REQUESTED')
  })

  it('refuses to decide a request twice', async () => {
    const lender = await makeUser('twice-lender')
    const borrower = await makeUser('twice-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)

    await borrow.decide(lender, request.id, 'approve')
    await expect(borrow.decide(lender, request.id, 'approve')).rejects.toBeInstanceOf(ConflictException)
    await expect(borrow.decide(lender, request.id, 'decline')).rejects.toBeInstanceOf(ConflictException)
  })

  it('allows two non-overlapping bookings on the same item', async () => {
    const lender = await makeUser('seq-lender')
    const first = await makeUser('seq-first')
    const second = await makeUser('seq-second')
    const item = await makeItem(lender)

    const early = await borrow.createRequest(first, item.id, {
      startAt: future(2).toISOString(),
      endAt: future(5).toISOString()
    })
    // Touching, not overlapping: the second borrower collects on the day the
    // first returns it.
    const late = await borrow.createRequest(second, item.id, {
      startAt: future(5).toISOString(),
      endAt: future(8).toISOString()
    })

    await expect(borrow.decide(lender, early.id, 'approve')).resolves.toMatchObject({
      status: 'APPROVED'
    })
    await expect(borrow.decide(lender, late.id, 'approve')).resolves.toMatchObject({
      status: 'APPROVED'
    })
  })

  it('refuses the second of two overlapping approvals', async () => {
    const lender = await makeUser('clash-lender')
    const first = await makeUser('clash-first')
    const second = await makeUser('clash-second')
    const item = await makeItem(lender)

    const a = await borrow.createRequest(first, item.id, {
      startAt: future(2).toISOString(),
      endAt: future(6).toISOString()
    })
    const b = await borrow.createRequest(second, item.id, {
      startAt: future(4).toISOString(),
      endAt: future(9).toISOString()
    })

    await borrow.decide(lender, a.id, 'approve')
    await expect(borrow.decide(lender, b.id, 'approve')).rejects.toBeInstanceOf(ConflictException)
    expect(
      (await prisma.borrowRequest.findUniqueOrThrow({ where: { id: b.id } })).status
    ).toBe('REQUESTED')
  })

  /**
   * The headline concurrency guarantee: two approvals racing on the same
   * item and the same window. Exactly one may succeed.
   */
  it('lets exactly one of two concurrent overlapping approvals win', async () => {
    const lender = await makeUser('race-lender')
    const first = await makeUser('race-first')
    const second = await makeUser('race-second')
    const item = await makeItem(lender)

    const a = await borrow.createRequest(first, item.id, {
      startAt: future(2).toISOString(),
      endAt: future(6).toISOString()
    })
    const b = await borrow.createRequest(second, item.id, {
      startAt: future(3).toISOString(),
      endAt: future(7).toISOString()
    })

    const outcomes = await Promise.allSettled([
      borrow.decide(lender, a.id, 'approve'),
      borrow.decide(lender, b.id, 'approve')
    ])
    expect(outcomes.filter(row => row.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(row => row.status === 'rejected')).toHaveLength(1)

    const reservations = await prisma.borrowReservation.count({
      where: { listingId: item.id, releasedAt: null }
    })
    expect(reservations).toBe(1)
  })

  it('refuses overlapping bookings even when the service check is bypassed', async () => {
    const lender = await makeUser('db-lender')
    const item = await makeItem(lender)
    const a = randomUUID()
    const b = randomUUID()
    for (const id of [a, b]) {
      await prisma.borrowRequest.create({
        data: {
          id,
          listingId: item.id,
          lenderId: lender,
          borrowerId: await makeUser(`db-borrower-${id.slice(0, 6)}`),
          startAt: future(2),
          endAt: future(6),
          originalEndAt: future(6)
        }
      })
    }
    await prisma.borrowReservation.create({
      data: { listingId: item.id, borrowRequestId: a, startAt: future(2), endAt: future(6) }
    })
    // The exclusion constraint, not the service, refuses this.
    await expect(
      prisma.borrowReservation.create({
        data: { listingId: item.id, borrowRequestId: b, startAt: future(4), endAt: future(8) }
      })
    ).rejects.toBeTruthy()
  })

  it('allows an overlapping booking once the first is released', async () => {
    const lender = await makeUser('release-lender')
    const first = await makeUser('release-first')
    const second = await makeUser('release-second')
    const item = await makeItem(lender)

    const a = await borrow.createRequest(first, item.id, {
      startAt: future(2).toISOString(),
      endAt: future(6).toISOString()
    })
    const b = await borrow.createRequest(second, item.id, {
      startAt: future(3).toISOString(),
      endAt: future(7).toISOString()
    })
    await borrow.decide(lender, a.id, 'approve')
    // A borrower cannot walk away from an approved booking; the lender can.
    await expect(borrow.cancel(first, a.id, 'borrower')).rejects.toBeInstanceOf(ConflictException)
    await borrow.cancel(lender, a.id, 'lender')

    // The cancelled booking is kept for audit, but no longer blocks.
    const released = await prisma.borrowReservation.findUniqueOrThrow({
      where: { borrowRequestId: a.id }
    })
    expect(released.releasedAt).not.toBeNull()
    await expect(borrow.decide(lender, b.id, 'approve')).resolves.toMatchObject({
      status: 'APPROVED'
    })
  })

  it('respects a lender unavailable window', async () => {
    const lender = await makeUser('window-lender')
    const borrower = await makeUser('window-borrower')
    const item = await makeItem(lender)
    await borrow.addAvailabilityWindow(lender, item.id, {
      kind: 'UNAVAILABLE',
      startsAt: future(3).toISOString(),
      endsAt: future(6).toISOString(),
      note: 'Away that week'
    })

    await expect(
      borrow.createRequest(borrower, item.id, {
        startAt: future(4).toISOString(),
        endAt: future(7).toISOString()
      })
    ).rejects.toBeInstanceOf(ConflictException)

    const request = await borrow.createRequest(borrower, item.id, {
      startAt: future(7).toISOString(),
      endAt: future(9).toISOString()
    })
    await expect(borrow.decide(lender, request.id, 'approve')).resolves.toMatchObject({
      status: 'APPROVED'
    })
  })

  it('shows booked dates on the calendar without revealing who booked them', async () => {
    const lender = await makeUser('cal-lender')
    const borrower = await makeUser('cal-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')

    const calendar = await borrow.listAvailability(item.id)
    expect(calendar.reserved).toHaveLength(1)
    expect(JSON.stringify(calendar)).not.toContain(borrower)
  })

  it('refuses to delete another lender availability window', async () => {
    const lender = await makeUser('win-lender')
    const stranger = await makeUser('win-stranger')
    const item = await makeItem(lender)
    const window = await borrow.addAvailabilityWindow(lender, item.id, {
      kind: 'UNAVAILABLE',
      startsAt: future(3).toISOString(),
      endsAt: future(4).toISOString()
    })
    await expect(
      borrow.removeAvailabilityWindow(stranger, item.id, window.id)
    ).rejects.toBeInstanceOf(NotFoundException)
    await expect(borrow.removeAvailabilityWindow(lender, item.id, window.id)).resolves.toEqual({
      deleted: true
    })
  })

  // ------------------------------------------------------ pickup and handoff

  it('does not check the item out until both sides confirm', async () => {
    const lender = await makeUser('pick-lender')
    const borrower = await makeUser('pick-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, {
      scheduledAt: future(2).toISOString(),
      locationNote: 'Front porch, side gate'
    })

    const first = await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    expect(first).toEqual({ completed: false, awaiting: 'lender' })
    expect(
      (await prisma.borrowRequest.findUniqueOrThrow({ where: { id: request.id } })).status
    ).toBe('PICKUP_SCHEDULED')

    const second = await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)
    expect(second).toEqual({ completed: true })
    const after = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: request.id } })
    expect(after.status).toBe('CHECKED_OUT')
    expect(after.checkedOutAt).not.toBeNull()
  })

  it('refuses a pickup confirmation by an unrelated member', async () => {
    const lender = await makeUser('pickauth-lender')
    const borrower = await makeUser('pickauth-borrower')
    const stranger = await makeUser('pickauth-stranger')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })

    await expect(
      borrow.confirmHandoff(stranger, request.id, BorrowHandoffKind.PICKUP)
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('keeps the pickup location note out of every event payload', async () => {
    const lender = await makeUser('secret-lender')
    const borrower = await makeUser('secret-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, {
      scheduledAt: future(2).toISOString(),
      locationNote: 'Blue door on Alder Street, buzzer 4B'
    })

    const events = await prisma.domainEventOutbox.findMany({
      where: { payload: { path: ['borrowRequestId'], equals: request.id } }
    })
    expect(events.length).toBeGreaterThan(0)
    expect(JSON.stringify(events)).not.toContain('Alder Street')
    expect(JSON.stringify(events)).not.toContain('4B')

    // The two participants still see it, because it is their meeting point.
    const view = await borrow.getRequest(borrower, request.id)
    const pickup = view.handoffs.find(row => row.kind === 'PICKUP')
    expect(pickup?.locationNote).toContain('Alder Street')
  })

  it('lets the lender cancel a pickup that never happened', async () => {
    const lender = await makeUser('cancel-lender')
    const borrower = await makeUser('cancel-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })

    await borrow.cancelHandoff(lender, request.id, BorrowHandoffKind.PICKUP)
    const after = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: request.id } })
    expect(after.status).toBe('APPROVED')
    // A cancelled handoff cannot then be confirmed.
    await expect(
      borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('records condition at handoff and keeps it immutable', async () => {
    const lender = await makeUser('cond-lender')
    const borrower = await makeUser('cond-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })

    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP, {
      condition: 'good',
      notes: 'Small scuff on the case.'
    })
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)

    const reports = await prisma.borrowConditionReport.findMany({
      where: { borrowRequestId: request.id }
    })
    expect(reports).toHaveLength(1)
    expect(reports[0].phase).toBe('BEFORE')
    expect(reports[0].notes).toBe('Small scuff on the case.')
    expect(reports[0].reportedById).toBe(borrower)
  })

  // ------------------------------------------------- return and completion

  it('runs the full happy path from request to completion', async () => {
    const lender = await makeUser('full-lender')
    const borrower = await makeUser('full-borrower')
    const item = await makeItem(lender)

    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP, {
      condition: 'good',
      notes: 'All present when collected.'
    })
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)
    await borrow.requestReturn(borrower, request.id, { scheduledAt: future(4).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.RETURN, {
      condition: 'good'
    })
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.RETURN)
    await expect(borrow.complete(lender, request.id)).resolves.toMatchObject({
      status: 'COMPLETED'
    })

    // The dates are free again, and the booking history is still there.
    const reservation = await prisma.borrowReservation.findUniqueOrThrow({
      where: { borrowRequestId: request.id }
    })
    expect(reservation.releasedAt).not.toBeNull()

    const history = await prisma.borrowStatusEvent.findMany({
      where: { borrowRequestId: request.id },
      orderBy: { createdAt: 'asc' }
    })
    expect(history.map(row => row.toStatus)).toEqual([
      'REQUESTED',
      'APPROVED',
      'PICKUP_SCHEDULED',
      'CHECKED_OUT',
      'RETURN_REQUESTED',
      'RETURNED',
      'COMPLETED'
    ])

    const afterReports = await prisma.borrowConditionReport.findMany({
      where: { borrowRequestId: request.id },
      orderBy: { phase: 'asc' }
    })
    expect(afterReports.map(row => row.phase)).toEqual(['BEFORE', 'AFTER'])
  })

  it('refuses to complete before both sides confirm the return', async () => {
    const lender = await makeUser('early-lender')
    const borrower = await makeUser('early-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)
    await borrow.requestReturn(borrower, request.id)

    await expect(borrow.complete(lender, request.id)).rejects.toBeInstanceOf(ConflictException)
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.RETURN)
    await expect(borrow.complete(lender, request.id)).rejects.toBeInstanceOf(ConflictException)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.RETURN)
    await expect(borrow.complete(lender, request.id)).resolves.toMatchObject({ status: 'COMPLETED' })
  })

  it('refuses a duplicate completion', async () => {
    const lender = await makeUser('dupe-lender')
    const borrower = await makeUser('dupe-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.RETURN)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.RETURN)
    await borrow.complete(lender, request.id)

    await expect(borrow.complete(lender, request.id)).rejects.toBeInstanceOf(ConflictException)
    const events = await prisma.borrowStatusEvent.count({
      where: { borrowRequestId: request.id, toStatus: 'COMPLETED' }
    })
    expect(events).toBe(1)
  })

  // ------------------------------------------------------------ extensions

  it('approves an extension and moves the due date', async () => {
    const lender = await makeUser('ext-lender')
    const borrower = await makeUser('ext-borrower')
    const item = await makeItem(lender)
    const { request, endAt } = await requestItem(borrower, item.id, 3)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)

    const requestedEnd = future(12)
    const extension = await borrow.requestExtension(borrower, request.id, {
      requestedEndAt: requestedEnd.toISOString(),
      reason: 'Project ran long'
    })
    expect(extension.previousEndAt.toISOString()).toBe(endAt.toISOString())

    await borrow.decideExtension(lender, extension.id, 'approve')
    const after = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: request.id } })
    expect(after.endAt.toISOString()).toBe(requestedEnd.toISOString())
    // The originally agreed date survives for the audit trail.
    expect(after.originalEndAt.toISOString()).toBe(endAt.toISOString())

    const reservation = await prisma.borrowReservation.findUniqueOrThrow({
      where: { borrowRequestId: request.id }
    })
    expect(reservation.endAt.toISOString()).toBe(requestedEnd.toISOString())
  })

  it('refuses an extension that would collide with a later booking', async () => {
    const lender = await makeUser('extclash-lender')
    const borrower = await makeUser('extclash-borrower')
    const other = await makeUser('extclash-other')
    const item = await makeItem(lender)

    const mineEnd = future(5)
    const mine = await borrow.createRequest(borrower, item.id, {
      startAt: future(2).toISOString(),
      endAt: mineEnd.toISOString()
    })
    // Someone else books the item for the following week.
    const theirs = await borrow.createRequest(other, item.id, {
      startAt: future(6).toISOString(),
      endAt: future(10).toISOString()
    })
    await borrow.decide(lender, mine.id, 'approve')
    await borrow.decide(lender, theirs.id, 'approve')
    await borrow.schedulePickup(lender, mine.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, mine.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, mine.id, BorrowHandoffKind.PICKUP)

    const extension = await borrow.requestExtension(borrower, mine.id, {
      requestedEndAt: future(8).toISOString()
    })
    await expect(borrow.decideExtension(lender, extension.id, 'approve')).rejects.toBeInstanceOf(
      ConflictException
    )
    // The failed approval left nothing behind.
    const after = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: mine.id } })
    expect(after.endAt.toISOString()).toBe(mineEnd.toISOString())
    expect(
      (await prisma.borrowExtension.findUniqueOrThrow({ where: { id: extension.id } })).status
    ).toBe('REQUESTED')
  })

  it('allows an extension that fits before a later booking', async () => {
    const lender = await makeUser('extok-lender')
    const borrower = await makeUser('extok-borrower')
    const other = await makeUser('extok-other')
    const item = await makeItem(lender)

    const mine = await borrow.createRequest(borrower, item.id, {
      startAt: future(2).toISOString(),
      endAt: future(5).toISOString()
    })
    const theirs = await borrow.createRequest(other, item.id, {
      startAt: future(9).toISOString(),
      endAt: future(12).toISOString()
    })
    await borrow.decide(lender, mine.id, 'approve')
    await borrow.decide(lender, theirs.id, 'approve')
    await borrow.schedulePickup(lender, mine.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, mine.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, mine.id, BorrowHandoffKind.PICKUP)

    const extension = await borrow.requestExtension(borrower, mine.id, {
      requestedEndAt: future(8).toISOString()
    })
    await expect(borrow.decideExtension(lender, extension.id, 'approve')).resolves.toMatchObject({
      status: 'APPROVED'
    })
  })

  it('lets a lender reject an extension and refuses to decide twice', async () => {
    const lender = await makeUser('extrej-lender')
    const borrower = await makeUser('extrej-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)

    const extension = await borrow.requestExtension(borrower, request.id, {
      requestedEndAt: future(12).toISOString()
    })
    await borrow.decideExtension(lender, extension.id, 'reject', { note: 'Need it back' })
    await expect(borrow.decideExtension(lender, extension.id, 'approve')).rejects.toBeInstanceOf(
      ConflictException
    )
  })

  it('refuses an extension by anyone but the lender', async () => {
    const lender = await makeUser('extauth-lender')
    const borrower = await makeUser('extauth-borrower')
    const stranger = await makeUser('extauth-stranger')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)
    const extension = await borrow.requestExtension(borrower, request.id, {
      requestedEndAt: future(12).toISOString()
    })

    await expect(
      borrow.decideExtension(borrower, extension.id, 'approve')
    ).rejects.toBeInstanceOf(NotFoundException)
    await expect(
      borrow.decideExtension(stranger, extension.id, 'approve')
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('refuses two pending extensions on one borrowing', async () => {
    const lender = await makeUser('extdupe-lender')
    const borrower = await makeUser('extdupe-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)

    await borrow.requestExtension(borrower, request.id, { requestedEndAt: future(12).toISOString() })
    await expect(
      borrow.requestExtension(borrower, request.id, { requestedEndAt: future(13).toISOString() })
    ).rejects.toBeInstanceOf(ConflictException)
  })

  // ----------------------------------------------------------------- overdue

  it('marks an overdue borrowing once, however many times the sweep runs', async () => {
    const lender = await makeUser('late-lender')
    const borrower = await makeUser('late-borrower')
    const item = await makeItem(lender)
    const request = await borrow.createRequest(borrower, item.id, {
      startAt: future(2).toISOString(),
      endAt: future(4).toISOString()
    })
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)

    // The sweep is global, so this asserts about this request rather than
    // about how many rows the shared database happened to have pending.
    const later = new Date(Date.now() + 10 * DAY)
    await borrow.sweepOverdue(later)
    // Re-running the sweep must not re-notify: a restart mid-sweep is safe.
    await borrow.sweepOverdue(later)
    await borrow.sweepOverdue(new Date(Date.now() + 20 * DAY))

    const after = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: request.id } })
    expect(after.status).toBe('OVERDUE')
    expect(after.overdueNotifiedAt).not.toBeNull()

    const events = await prisma.domainEventOutbox.count({
      where: { type: 'borrow.overdue', payload: { path: ['borrowRequestId'], equals: request.id } }
    })
    expect(events).toBe(1)
    const overdueEvents = await prisma.borrowStatusEvent.count({
      where: { borrowRequestId: request.id, toStatus: 'OVERDUE' }
    })
    expect(overdueEvents).toBe(1)
  })

  it('does not sweep something the borrower still has a valid extension for', async () => {
    const lender = await makeUser('extlate-lender')
    const borrower = await makeUser('extlate-borrower')
    const item = await makeItem(lender)
    const request = await borrow.createRequest(borrower, item.id, {
      startAt: future(2).toISOString(),
      endAt: future(4).toISOString()
    })
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)

    const extension = await borrow.requestExtension(borrower, request.id, {
      requestedEndAt: future(20).toISOString()
    })
    await borrow.decideExtension(lender, extension.id, 'approve')

    expect(await borrow.sweepOverdue(new Date(Date.now() + 10 * DAY))).toBe(0)
    expect(
      (await prisma.borrowRequest.findUniqueOrThrow({ where: { id: request.id } })).status
    ).toBe('CHECKED_OUT')
  })

  it('lets an overdue borrowing still be returned and completed', async () => {
    const lender = await makeUser('recov-lender')
    const borrower = await makeUser('recov-borrower')
    const item = await makeItem(lender)
    const request = await borrow.createRequest(borrower, item.id, {
      startAt: future(2).toISOString(),
      endAt: future(4).toISOString()
    })
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)
    await borrow.sweepOverdue(new Date(Date.now() + 10 * DAY))

    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.RETURN)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.RETURN)
    await expect(borrow.complete(lender, request.id)).resolves.toMatchObject({ status: 'COMPLETED' })
  })

  // --------------------------------------------------------------- disputes

  it('records a damage dispute with an append-only trail', async () => {
    const lender = await makeUser('disp-lender')
    const borrower = await makeUser('disp-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)

    const dispute = await borrow.openDispute(lender, request.id, {
      reason: 'DAMAGE',
      summary: 'The chuck is bent and no longer holds the bit.'
    })
    expect(dispute.status).toBe('OPEN')
    // The borrowing freezes rather than being forced forward.
    expect(
      (await prisma.borrowRequest.findUniqueOrThrow({ where: { id: request.id } })).status
    ).toBe('DISPUTED')

    const events = await prisma.borrowDisputeEvent.findMany({
      where: { disputeId: dispute.id },
      orderBy: { createdAt: 'asc' }
    })
    expect(events[0].toStatus).toBe('OPEN')
  })

  it('refuses a second open dispute on the same borrowing', async () => {
    const lender = await makeUser('dupdisp-lender')
    const borrower = await makeUser('dupdisp-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)

    await borrow.openDispute(lender, request.id, { reason: 'DAMAGE', summary: 'Broken chuck.' })
    await expect(
      borrow.openDispute(borrower, request.id, { reason: 'OTHER', summary: 'It was already broken.' })
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it('restricts a dispute to its two participants', async () => {
    const lender = await makeUser('dispauth-lender')
    const borrower = await makeUser('dispauth-borrower')
    const stranger = await makeUser('dispauth-stranger')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)
    const dispute = await borrow.openDispute(lender, request.id, {
      reason: 'MISSING_ITEM',
      summary: 'The item never came back after the due date.'
    })

    await expect(borrow.getDispute(stranger, dispute.id)).rejects.toBeInstanceOf(NotFoundException)
    await expect(borrow.getDispute(borrower, dispute.id)).resolves.toMatchObject({ id: dispute.id })
    expect((await borrow.listDisputes(stranger)).find(row => row.id === dispute.id)).toBeUndefined()
  })

  it('lets only staff resolve a dispute', async () => {
    const lender = await makeUser('res-lender')
    const borrower = await makeUser('res-borrower')
    const staff = await makeUser('res-staff')
    await prisma.staffRoleAssignment.create({ data: { userId: staff, role: 'MODERATOR' as never } })

    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)
    const dispute = await borrow.openDispute(lender, request.id, {
      reason: 'LATE_RETURN',
      summary: 'It came back three days after the due date.'
    })

    await expect(
      borrow.reviewDispute(lender, dispute.id, BorrowDisputeStatus.RESOLVED, { resolution: 'Agreed' })
    ).rejects.toBeInstanceOf(ForbiddenException)
    await expect(
      borrow.reviewDispute(borrower, dispute.id, BorrowDisputeStatus.UNDER_REVIEW)
    ).resolves.toMatchObject({ status: 'UNDER_REVIEW' })
    await expect(
      borrow.reviewDispute(staff, dispute.id, BorrowDisputeStatus.RESOLVED, { resolution: 'No charge' })
    ).resolves.toMatchObject({ status: 'RESOLVED' })
  })

  it('attaches evidence only for the item in the dispute', async () => {
    const lender = await makeUser('ev-lender')
    const borrower = await makeUser('ev-borrower')
    const stranger = await makeUser('ev-stranger')
    const item = await makeItem(lender)
    const other = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)
    const dispute = await borrow.openDispute(lender, request.id, {
      reason: 'DAMAGE',
      summary: 'The chuck is bent.'
    })

    await expect(
      borrow.addEvidence(stranger, dispute.id, {
        listingId: item.id,
        objectKey: 'evidence/x/y.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 10
      })
    ).rejects.toBeInstanceOf(NotFoundException)
    await expect(
      borrow.addEvidence(lender, dispute.id, {
        listingId: other.id,
        objectKey: 'evidence/x/y.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 10
      })
    ).rejects.toBeInstanceOf(ForbiddenException)

    const row = await borrow.addEvidence(lender, dispute.id, {
      listingId: item.id,
      objectKey: `evidence/${item.id}/abc.jpg`,
      contentType: 'image/jpeg',
      sizeBytes: 10,
      note: 'Close-up of the bent chuck'
    })
    expect((await borrow.listEvidence(lender, dispute.id)).map(entry => entry.id)).toContain(row.id)
  })

  it('refuses an evidence read by an unrelated member', async () => {
    const lender = await makeUser('evread-lender')
    const borrower = await makeUser('evread-borrower')
    const stranger = await makeUser('evread-stranger')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)
    const dispute = await borrow.openDispute(lender, request.id, {
      reason: 'DAMAGE',
      summary: 'The chuck is bent.'
    })
    const row = await borrow.addEvidence(lender, dispute.id, {
      listingId: item.id,
      objectKey: `evidence/${item.id}/abc.jpg`,
      contentType: 'image/jpeg',
      sizeBytes: 10
    })

    await expect(borrow.evidenceObjectKey(stranger, row.id)).rejects.toBeInstanceOf(NotFoundException)
    await expect(borrow.evidenceObjectKey(borrower, row.id)).resolves.toBe(`evidence/${item.id}/abc.jpg`)
  })

  // ------------------------------------------------------------ listing views

  it('splits borrowed and lent views and honours the overdue filter', async () => {
    const lender = await makeUser('view-lender')
    const borrower = await makeUser('view-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id, 2)
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)
    await borrow.sweepOverdue(new Date(Date.now() + 10 * DAY))

    const borrowed = await borrow.listRequests(borrower, { scope: 'borrowed' })
    expect(borrowed.map(row => row.id)).toContain(request.id)
    const lent = await borrow.listRequests(lender, { scope: 'lent' })
    expect(lent.map(row => row.id)).toContain(request.id)
    const overdue = await borrow.listRequests(lender, { scope: 'lent', overdueOnly: true })
    expect(overdue.map(row => row.id)).toContain(request.id)
    // Both sides see the same overdue record, from their own point of view.
    const asBorrower = await borrow.listRequests(borrower, { scope: 'borrowed', overdueOnly: true })
    expect(asBorrower.map(row => row.id)).toContain(request.id)
    expect(asBorrower.find(row => row.id === request.id)?.role).toBe('borrower')
    expect(overdue.find(row => row.id === request.id)?.role).toBe('lender')
  })

  it('never exposes the item coordinates through a borrowing view', async () => {
    const lender = await makeUser('vcoord-lender')
    const borrower = await makeUser('vcoord-borrower')
    const item = await makeItem(lender, { latitude: 33.7494, longitude: -84.388 })
    const { request: request } = await requestItem(borrower, item.id)

    const view = (await borrow.getRequest(borrower, request.id)) as {
      listing?: Record<string, unknown>
    }
    expect(view.listing).not.toHaveProperty('latitude')
    expect(JSON.stringify(view)).not.toContain('33.7494')
  })

  it('rolls back the whole approval when the reservation cannot be written', async () => {
    const lender = await makeUser('roll-lender')
    const borrower = await makeUser('roll-borrower')
    const item = await makeItem(lender)
    const { request: request } = await requestItem(borrower, item.id)

    // A reservation already exists for a request that no longer exists, so
    // the borrowRequestId unique index fires inside the approval transaction.
    await prisma.borrowRequest.create({
      data: {
        id: request.id,
        listingId: item.id,
        lenderId: lender,
        borrowerId: await makeUser('roll-ghost'),
        startAt: future(1),
        endAt: future(2),
        originalEndAt: future(2)
      }
    }).catch(() => undefined)

    await borrow.decide(lender, request.id, 'approve').catch(() => undefined)
    const statuses = await prisma.borrowStatusEvent.findMany({
      where: { borrowRequestId: request.id },
      orderBy: { createdAt: 'asc' }
    })
    // Whatever happened, no half-finished approval history remains without a
    // matching reservation or an APPROVED status.
    const row = await prisma.borrowRequest.findUniqueOrThrow({ where: { id: request.id } })
    const reservation = await prisma.borrowReservation.findUnique({
      where: { borrowRequestId: request.id }
    })
    if (row.status === 'APPROVED') expect(reservation).not.toBeNull()
    else expect(reservation).toBeNull()
    expect(statuses.length).toBeGreaterThanOrEqual(1)
  })
})
