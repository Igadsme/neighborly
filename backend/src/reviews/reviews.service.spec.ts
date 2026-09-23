import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { TransactionStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { ReviewsService } from './reviews.service'

describe('ReviewsService', () => {
  const authorId = 'author-1'
  const input = {
    transactionId: 'tx-1',
    subjectId: 'subject-1',
    rating: 5,
    body: '  Smooth pickup.  '
  }
  const prisma = {
    transaction: { findUnique: jest.fn() },
    review: { create: jest.fn() }
  }
  let service: ReviewsService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ReviewsService, { provide: PrismaService, useValue: prisma }]
    }).compile()
    service = moduleRef.get(ReviewsService)
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each([
    TransactionStatus.DRAFT,
    TransactionStatus.PUBLISHED,
    TransactionStatus.OFFER_RECEIVED,
    TransactionStatus.NEGOTIATING,
    TransactionStatus.ACCEPTED,
    TransactionStatus.SCHEDULED,
    TransactionStatus.IN_PROGRESS,
    TransactionStatus.CANCELLED,
    TransactionStatus.DISPUTED,
    TransactionStatus.REFUNDED,
    TransactionStatus.EXPIRED
  ])('rejects a review when the transaction is %s', async status => {
    prisma.transaction.findUnique.mockResolvedValue({
      id: input.transactionId,
      status,
      participants: [{ userId: authorId }]
    })

    await expect(service.createReview(authorId, input)).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.createReview(authorId, input)).rejects.toThrow(
      'Reviews are only allowed when the transaction is COMPLETED'
    )
    expect(prisma.review.create).not.toHaveBeenCalled()
  })

  it('rejects a review from someone who is not a transaction participant', async () => {
    prisma.transaction.findUnique.mockResolvedValue({
      id: input.transactionId,
      status: TransactionStatus.COMPLETED,
      participants: [{ userId: 'someone-else' }]
    })

    await expect(service.createReview(authorId, input)).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.review.create).not.toHaveBeenCalled()
  })

  it('creates a review once a participant rates a completed transaction', async () => {
    prisma.transaction.findUnique.mockResolvedValue({
      id: input.transactionId,
      status: TransactionStatus.COMPLETED,
      participants: [{ userId: authorId }, { userId: input.subjectId }]
    })
    prisma.review.create.mockResolvedValue({ id: 'review-1' })

    await service.createReview(authorId, input)

    expect(prisma.review.create).toHaveBeenCalledWith({
      data: {
        transactionId: input.transactionId,
        authorId,
        subjectId: input.subjectId,
        rating: input.rating,
        body: 'Smooth pickup.'
      }
    })
  })
})
