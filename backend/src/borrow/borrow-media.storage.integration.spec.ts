import { randomUUID } from 'node:crypto'
import { NotFoundException, UnsupportedMediaTypeException } from '@nestjs/common'
import { BorrowHandoffKind } from '@prisma/client'
import { BorrowService } from '../borrow/borrow.service'
import { OutboxWriter } from '../events/outbox-writer'
import { PrismaService } from '../prisma/prisma.service'
import { createTestPrisma } from '../common/testing/integration-fixtures'
import { StorageService } from '../storage/storage.service'
import { ListingsService } from '../listings/listings.service'
import { pngBytes, pdfBytes, storageServiceForTest } from '../storage/testing/storage-fixtures'

/**
 * Proves that borrowing survives a service restart: an item photo and a
 * condition photo go into real object storage, the rows go into real
 * PostgreSQL, and a freshly constructed service instance — one that has no
 * in-memory state — reads both back.
 */
describe('Borrowing photos and evidence against PostgreSQL and object storage', () => {
  let prisma: PrismaService
  let storage: StorageService
  const storedKeys: string[] = []

  const DAY = 86_400_000
  const future = (days: number) => new Date(Date.now() + days * DAY)

  async function makeUser(prefix: string) {
    const id = randomUUID()
    await prisma.user.create({
      data: { id, email: `${prefix}-${id}@example.com`, passwordHash: '$argon2id$stub' }
    })
    await prisma.profile.create({ data: { userId: id, firstName: 'Test', lastName: 'User' } })
    return id
  }

  /** A fresh service pair, standing in for a process restart. */
  function freshServices() {
    const fresh = storageServiceForTest()
    return {
      storage: fresh,
      borrow: new BorrowService(prisma, new OutboxWriter(prisma)),
      listings: new ListingsService(prisma, fresh)
    }
  }

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
    storage = storageServiceForTest()
  })

  afterAll(async () => {
    for (const key of storedKeys) await storage.remove(key).catch(() => undefined)
    await prisma.$disconnect()
  })

  it('stores an item photo and reads it back after a restart', async () => {
    const { borrow: first } = freshServices()
    const lender = await makeUser('media-lender')
    const category = randomUUID()
    await prisma.category.create({
      data: { id: category, name: `M7 ${category.slice(0, 8)}`, slug: `m7-${category}` }
    })

    const item = await first.createItem(lender, {
      categoryId: category,
      title: 'Cordless drill',
      description: 'A reliable drill with two batteries and a charger.',
      usageInstructions: 'Return the batteries charged.'
    } as never)

    // The item is an ordinary listing, so the Milestone 4 upload path
    // applies unchanged: no duplicate media model was introduced.
    const { listings } = freshServices()
    const image = await listings.addImage(lender, item.id, {
      buffer: pngBytes(),
      mimetype: 'image/png',
      size: pngBytes().length
    })
    const key = image.objectKey
    storedKeys.push(key)
    expect(key.startsWith(`listings/${item.id}/`)).toBe(true)

    // A service constructed from nothing still resolves the item and its photo.
    const { borrow: second } = freshServices()
    const reloaded = await second.getItem(item.id, lender)
    expect(reloaded.id).toBe(item.id)
    const bytes = await storage.get(key)
    expect(bytes?.body.length).toBeGreaterThan(0)
  })

  it('stores dispute evidence privately and reads it back only for participants', async () => {
    const { borrow, storage: localStorage } = freshServices()
    const lender = await makeUser('ev-lender')
    const borrower = await makeUser('ev-borrower')
    const stranger = await makeUser('ev-stranger')
    const category = randomUUID()
    await prisma.category.create({
      data: { id: category, name: `M7 ${category.slice(0, 8)}`, slug: `m7-${category}` }
    })

    const item = await borrow.createItem(lender, {
      categoryId: category,
      title: 'Cordless drill',
      description: 'A reliable drill with two batteries and a charger.',
      usageInstructions: 'Return the batteries charged.'
    } as never)

    const request = await borrow.createRequest(borrower, item.id, {
      startAt: future(2).toISOString(),
      endAt: future(5).toISOString()
    })
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)

    const dispute = await borrow.openDispute(lender, request.id, {
      reason: 'DAMAGE',
      summary: 'The chuck is bent and will not hold the bit.'
    })

    const stored = await localStorage.putEvidence(item.id, pngBytes(), 'image/png')
    storedKeys.push(stored.objectKey)
    expect(stored.objectKey.startsWith(`evidence/${item.id}/`)).toBe(true)

    const evidence = await borrow.addEvidence(lender, dispute.id, {
      listingId: item.id,
      objectKey: stored.objectKey,
      contentType: stored.contentType,
      sizeBytes: stored.size,
      note: 'Close-up of the bent chuck'
    })

    // A fresh service reads the row back with no in-memory state.
    const { borrow: afterRestart } = freshServices()
    const listed = await afterRestart.listEvidence(lender, dispute.id)
    expect(listed.map(row => row.id)).toContain(evidence.id)

    const bytes = await localStorage.get(stored.objectKey)
    expect(bytes?.contentType).toBe('image/png')
    expect(bytes?.body.length).toBeGreaterThan(0)

    // An unrelated member cannot even resolve the object key.
    await expect(afterRestart.evidenceObjectKey(stranger, evidence.id)).rejects.toBeInstanceOf(
      NotFoundException
    )
    // A participant can.
    await expect(
      afterRestart.evidenceObjectKey(borrower, evidence.id)
    ).resolves.toBe(stored.objectKey)
  })

  it('refuses evidence whose bytes are not an accepted image', async () => {
    const { borrow, storage: localStorage } = freshServices()
    const lender = await makeUser('evbad-lender')
    const borrower = await makeUser('evbad-borrower')
    const category = randomUUID()
    await prisma.category.create({
      data: { id: category, name: `M7 ${category.slice(0, 8)}`, slug: `m7-${category}` }
    })
    const item = await borrow.createItem(lender, {
      categoryId: category,
      title: 'Cordless drill',
      description: 'A reliable drill with two batteries and a charger.',
      usageInstructions: 'Return the batteries charged.'
    } as never)
    const request = await borrow.createRequest(borrower, item.id, {
      startAt: future(2).toISOString(),
      endAt: future(5).toISOString()
    })
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)
    // A dispute exists, but the bytes are refused before any dispute matters.
    await borrow.openDispute(lender, request.id, {
      reason: 'DAMAGE',
      summary: 'The chuck is bent.'
    })

    await expect(localStorage.putEvidence(item.id, pdfBytes(), 'application/pdf')).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException
    )
    await expect(
      localStorage.putEvidence(item.id, pngBytes(), 'application/pdf')
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException)
  })

  it('keeps borrowing records intact after the whole flow completes', async () => {
    const { borrow } = freshServices()
    const lender = await makeUser('keep-lender')
    const borrower = await makeUser('keep-borrower')
    const category = randomUUID()
    await prisma.category.create({
      data: { id: category, name: `M7 ${category.slice(0, 8)}`, slug: `m7-${category}` }
    })
    const item = await borrow.createItem(lender, {
      categoryId: category,
      title: 'Extension ladder',
      description: 'A sturdy ten foot extension ladder.',
      usageInstructions: 'Please keep it dry.'
    } as never)
    const request = await borrow.createRequest(borrower, item.id, {
      startAt: future(2).toISOString(),
      endAt: future(5).toISOString()
    })
    await borrow.decide(lender, request.id, 'approve')
    await borrow.schedulePickup(lender, request.id, { scheduledAt: future(2).toISOString() })
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.PICKUP, { condition: 'good' })
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.PICKUP)
    await borrow.confirmHandoff(borrower, request.id, BorrowHandoffKind.RETURN, { condition: 'good' })
    await borrow.confirmHandoff(lender, request.id, BorrowHandoffKind.RETURN)
    await borrow.complete(lender, request.id)

    // Everything a later dispute or review would need is still there.
    const view = await borrow.getRequest(lender, request.id)
    expect(view.status).toBe('COMPLETED')
    // REQUESTED, APPROVED, PICKUP_SCHEDULED, CHECKED_OUT, RETURNED, COMPLETED.
    expect(view.events.length).toBe(6)
    expect(view.conditionReports).toHaveLength(2)
    const reservation = await prisma.borrowReservation.findUniqueOrThrow({
      where: { borrowRequestId: request.id }
    })
    expect(reservation.releasedAt).not.toBeNull()
  })
})
