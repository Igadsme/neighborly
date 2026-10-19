import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { TransactionStatus } from '@prisma/client'
import { TransactionsService } from './transactions.service'
import { PrismaService } from '../prisma/prisma.service'
import { createOfferFixture, createTestPrisma, INTEGRATION_IDS } from '../common/testing/integration-fixtures'

describe('Transaction state transitions against real PostgreSQL', () => {
  let prisma: PrismaService
  let service: TransactionsService

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
    service = new TransactionsService(prisma)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function createTransaction(status: TransactionStatus, id: string) {
    // Offer ids use the a6… range so they never collide with the
    // 60… range used by the offer-acceptance integration specs.
    const offer = await createOfferFixture(prisma, `a6000000-0000-4000-8000-${id.slice(24)}`)
    return prisma.transaction.create({
      data: {
        id,
        offerId: offer.id,
        status,
        participants: {
          create: [
            { userId: INTEGRATION_IDS.requester, role: 'REQUESTER' },
            { userId: INTEGRATION_IDS.offerer, role: 'OFFERER' }
          ]
        }
      },
      include: { participants: true }
    })
  }

  it('walks every legal transition along the happy path', async () => {
    const id = '80000000-0000-4000-8000-000000000001'
    await createTransaction(TransactionStatus.ACCEPTED, id)

    for (const next of [TransactionStatus.SCHEDULED, TransactionStatus.IN_PROGRESS]) {
      const updated = await service.transition(INTEGRATION_IDS.requester, id, { status: next })
      expect(updated.status).toBe(next)
    }
    const pending = await service.transition(INTEGRATION_IDS.requester, id, { status: TransactionStatus.COMPLETED })
    expect(pending.status).toBe(TransactionStatus.IN_PROGRESS)
    expect(pending).toMatchObject({ awaitingConfirmation: true, completionConfirmedBy: [INTEGRATION_IDS.requester] })
    const completed = await service.transition(INTEGRATION_IDS.offerer, id, { status: TransactionStatus.COMPLETED })
    expect(completed.status).toBe(TransactionStatus.COMPLETED)

    const milestones = await prisma.transactionMilestone.findMany({
      where: { transactionId: id },
      orderBy: { createdAt: 'asc' }
    })
    expect(milestones.map(row => row.toStatus)).toEqual([
      TransactionStatus.SCHEDULED,
      TransactionStatus.IN_PROGRESS,
      TransactionStatus.COMPLETED
    ])
  })

  it('rejects illegal transitions and leaves state unchanged', async () => {
    const id = '80000000-0000-4000-8000-000000000002'
    await createTransaction(TransactionStatus.ACCEPTED, id)

    await expect(
      service.transition(INTEGRATION_IDS.requester, id, { status: TransactionStatus.COMPLETED })
    ).rejects.toThrow('Invalid transaction transition: ACCEPTED -> COMPLETED')

    const reloaded = await prisma.transaction.findUniqueOrThrow({ where: { id } })
    expect(reloaded.status).toBe(TransactionStatus.ACCEPTED)
  })

  it('commits exactly one of two concurrent conflicting transitions', async () => {
    const id = '80000000-0000-4000-8000-000000000003'
    await createTransaction(TransactionStatus.ACCEPTED, id)

    const outcomes = await Promise.allSettled([
      service.transition(INTEGRATION_IDS.requester, id, { status: TransactionStatus.SCHEDULED }),
      service.transition(INTEGRATION_IDS.offerer, id, { status: TransactionStatus.CANCELLED })
    ])

    const fulfilled = outcomes.filter(outcome => outcome.status === 'fulfilled')
    const rejected = outcomes.filter(outcome => outcome.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestException)

    const reloaded = await prisma.transaction.findUniqueOrThrow({ where: { id } })
    expect([TransactionStatus.SCHEDULED, TransactionStatus.CANCELLED]).toContain(reloaded.status)
    const milestones = await prisma.transactionMilestone.findMany({ where: { transactionId: id } })
    expect(milestones).toHaveLength(1)
  })

  it('rejects a stale transition after a newer state committed', async () => {
    const id = '80000000-0000-4000-8000-000000000004'
    await createTransaction(TransactionStatus.ACCEPTED, id)

    // A newer request moves the state forward first.
    const committed = await service.transition(INTEGRATION_IDS.requester, id, { status: TransactionStatus.SCHEDULED })
    expect(committed.status).toBe(TransactionStatus.SCHEDULED)

    // A client that read ACCEPTED before that commit must not be
    // able to overwrite SCHEDULED: the conditional update matches
    // zero rows and the newer state survives.
    const stale = await prisma.transaction.updateMany({
      where: { id, status: TransactionStatus.ACCEPTED },
      data: { status: TransactionStatus.IN_PROGRESS }
    })
    expect(stale.count).toBe(0)

    const reloaded = await prisma.transaction.findUniqueOrThrow({ where: { id } })
    expect(reloaded.status).toBe(TransactionStatus.SCHEDULED)
  })

  it('treats a duplicate completion request as idempotent', async () => {
    const id = '80000000-0000-4000-8000-000000000005'
    await createTransaction(TransactionStatus.COMPLETED, id)

    const again = await service.transition(INTEGRATION_IDS.requester, id, { status: TransactionStatus.COMPLETED })
    expect(again.status).toBe(TransactionStatus.COMPLETED)

    const milestones = await prisma.transactionMilestone.findMany({ where: { transactionId: id } })
    expect(milestones).toHaveLength(0)
  })

  it('rejects transitions by non-participants', async () => {
    const id = '80000000-0000-4000-8000-000000000006'
    await createTransaction(TransactionStatus.ACCEPTED, id)

    await expect(
      service.transition(INTEGRATION_IDS.outsider, id, { status: TransactionStatus.SCHEDULED })
    ).rejects.toBeInstanceOf(ForbiddenException)

    const reloaded = await prisma.transaction.findUniqueOrThrow({ where: { id } })
    expect(reloaded.status).toBe(TransactionStatus.ACCEPTED)
  })

  it('reports 404 for unknown transactions', async () => {
    await expect(
      service.transition(INTEGRATION_IDS.requester, '90000000-0000-4000-8000-000000000001', { status: TransactionStatus.SCHEDULED })
    ).rejects.toThrow('Transaction not found')
  })
})
