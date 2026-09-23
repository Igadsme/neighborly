import { BadRequestException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { TransactionStatus } from '@prisma/client'
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
