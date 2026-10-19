import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { TransactionStatus } from '@prisma/client'
import { ReviewsService } from '../passport/reviews.service'
import { PrismaService } from '../prisma/prisma.service'
import { TransactionsService } from './transactions.service'

describe('TransactionsService illegal transitions', () => {
  const userId = 'user-1'
  const transactionId = 'tx-1'
  const prisma = {
    transaction: {
      findUnique: jest.fn(),
      update: jest.fn()
    },
    transactionMilestone: { create: jest.fn() },
    $transaction: jest.fn()
  }
  let service: TransactionsService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TransactionsService, { provide: PrismaService, useValue: prisma }]
    }).compile()
    service = moduleRef.get(TransactionsService)
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each([
    [TransactionStatus.DRAFT, TransactionStatus.COMPLETED],
    [TransactionStatus.PUBLISHED, TransactionStatus.COMPLETED],
    [TransactionStatus.COMPLETED, TransactionStatus.CANCELLED],
    [TransactionStatus.IN_PROGRESS, TransactionStatus.CANCELLED],
    [TransactionStatus.EXPIRED, TransactionStatus.PUBLISHED],
    [TransactionStatus.REFUNDED, TransactionStatus.DISPUTED]
  ])('rejects illegal jump %s -> %s without writing a milestone', async (from, to) => {
    prisma.transaction.findUnique.mockResolvedValue({
      id: transactionId,
      status: from,
      participants: [{ userId }]
    })

    await expect(service.transition(userId, transactionId, { status: to })).rejects.toThrow(BadRequestException)
    await expect(service.transition(userId, transactionId, { status: to })).rejects.toThrow(
      `Invalid transaction transition: ${from} -> ${to}`
    )
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(prisma.transaction.update).not.toHaveBeenCalled()
    expect(prisma.transactionMilestone.create).not.toHaveBeenCalled()
  })
})

describe('TransactionsService two-sided completion and staff disputes', () => {
  const transactionId = 'tx-1'
  const participants = [
    { userId: 'user-1', role: 'REQUESTER', completionConfirmedAt: null as Date | null },
    { userId: 'user-2', role: 'OFFERER', completionConfirmedAt: null as Date | null }
  ]
  const transaction = {
    id: transactionId,
    status: TransactionStatus.IN_PROGRESS as TransactionStatus,
    participants
  }
  const prisma = {
    transaction: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn()
    },
    transactionParticipant: {
      update: jest.fn(),
      findMany: jest.fn()
    },
    transactionMilestone: { create: jest.fn() },
    staffRoleAssignment: { findFirst: jest.fn() },
    review: { create: jest.fn() },
    $transaction: jest.fn()
  }
  let service: TransactionsService
  let reviews: ReviewsService

  beforeAll(async () => {
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma))
    const moduleRef = await Test.createTestingModule({
      providers: [TransactionsService, { provide: PrismaService, useValue: prisma }]
    }).compile()
    service = moduleRef.get(TransactionsService)
    reviews = new ReviewsService(prisma as never, {} as never)
  })

  beforeEach(() => {
    jest.clearAllMocks()
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => fn(prisma))
    transaction.status = TransactionStatus.IN_PROGRESS
    participants[0].completionConfirmedAt = null
    participants[1].completionConfirmedAt = null
    prisma.transaction.findUnique.mockImplementation(async () => ({
      ...transaction,
      participants: participants.map(participant => ({ ...participant }))
    }))
    prisma.transaction.findUniqueOrThrow.mockImplementation(async () => ({
      ...transaction,
      status: transaction.status,
      participants: participants.map(participant => ({ ...participant }))
    }))
    prisma.transactionParticipant.update.mockImplementation(async ({ where, data }: {
      where: { transactionId_userId: { userId: string } }
      data: { completionConfirmedAt: Date }
    }) => {
      const row = participants.find(participant => participant.userId === where.transactionId_userId.userId)
      if (!row) throw new Error('missing participant')
      row.completionConfirmedAt = data.completionConfirmedAt
      return row
    })
    prisma.transactionParticipant.findMany.mockImplementation(async () => participants.map(participant => ({ ...participant })))
    prisma.transaction.updateMany.mockImplementation(async ({ data }: { data: { status: TransactionStatus } }) => {
      transaction.status = data.status
      return { count: 1 }
    })
    prisma.transactionMilestone.create.mockResolvedValue({ id: 'milestone-1' })
    prisma.staffRoleAssignment.findFirst.mockResolvedValue(null)
    prisma.review.create.mockResolvedValue({ id: 'review-1' })
  })

  it('does not let one participant move IN_PROGRESS to COMPLETED', async () => {
    const pending = await service.transition('user-1', transactionId, { status: TransactionStatus.COMPLETED })

    expect(pending.status).toBe(TransactionStatus.IN_PROGRESS)
    expect(pending).toMatchObject({
      awaitingConfirmation: true,
      completionConfirmedBy: ['user-1']
    })
    expect(prisma.transaction.updateMany).not.toHaveBeenCalled()
    expect(prisma.transactionMilestone.create).not.toHaveBeenCalled()
  })

  it('completes only after the other participant confirms', async () => {
    await service.transition('user-1', transactionId, { status: TransactionStatus.COMPLETED })
    const completed = await service.transition('user-2', transactionId, { status: TransactionStatus.COMPLETED })

    expect(completed.status).toBe(TransactionStatus.COMPLETED)
    expect(prisma.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: transactionId, status: TransactionStatus.IN_PROGRESS },
      data: { status: TransactionStatus.COMPLETED }
    })
    expect(prisma.transactionMilestone.create).toHaveBeenCalledTimes(1)
  })

  it.each([TransactionStatus.COMPLETED, TransactionStatus.REFUNDED, TransactionStatus.CANCELLED])(
    'rejects a participant moving DISPUTED to %s',
    async to => {
      transaction.status = TransactionStatus.DISPUTED
      await expect(service.transition('user-1', transactionId, { status: to })).rejects.toBeInstanceOf(ForbiddenException)
      await expect(service.transition('user-1', transactionId, { status: to })).rejects.toThrow('Only staff can take that action')
      expect(prisma.transaction.updateMany).not.toHaveBeenCalled()
      expect(prisma.transactionMilestone.create).not.toHaveBeenCalled()
    }
  )

  it('lets staff resolve a dispute the way borrow does', async () => {
    transaction.status = TransactionStatus.DISPUTED
    prisma.staffRoleAssignment.findFirst.mockImplementation(async ({ where }: { where: { userId: string } }) =>
      where.userId === 'staff-1' ? { id: 'role-1' } : null
    )

    const resolved = await service.transition('staff-1', transactionId, { status: TransactionStatus.REFUNDED })

    expect(resolved.status).toBe(TransactionStatus.REFUNDED)
    expect(prisma.transactionMilestone.create).toHaveBeenCalledWith({
      data: {
        transactionId,
        fromStatus: TransactionStatus.DISPUTED,
        toStatus: TransactionStatus.REFUNDED
      }
    })
  })

  it('does not open a review from a one-sided completion write', async () => {
    const pending = await service.transition('user-1', transactionId, { status: TransactionStatus.COMPLETED })
    expect(pending.status).toBe(TransactionStatus.IN_PROGRESS)

    await expect(
      reviews.createReview('user-1', {
        transactionId,
        subjectId: 'user-2',
        rating: 5,
        body: 'Smooth handoff.'
      })
    ).rejects.toThrow('You can review once the exchange is complete')
    expect(prisma.review.create).not.toHaveBeenCalled()
  })
})
