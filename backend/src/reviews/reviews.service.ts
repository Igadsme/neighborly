import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { TransactionStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CreateReviewDto } from './dto'

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async createReview(authorId: string, input: CreateReviewDto) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: input.transactionId },
      include: { participants: true }
    })
    if (!transaction) throw new NotFoundException('Transaction not found')
    if (!transaction.participants.some(participant => participant.userId === authorId)) {
      throw new ForbiddenException('You are not a participant in this transaction')
    }
    if (transaction.status !== TransactionStatus.COMPLETED) {
      throw new BadRequestException('Reviews are only allowed when the transaction is COMPLETED')
    }
    const body = input.body.trim()
    if (!body) throw new BadRequestException('Review body is required')
    return this.prisma.review.create({
      data: {
        transactionId: input.transactionId,
        authorId,
        subjectId: input.subjectId,
        rating: input.rating,
        body
      }
    })
  }
}
