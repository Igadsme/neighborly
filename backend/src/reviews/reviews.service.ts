import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { TransactionStatus } from '@prisma/client'
import { assertNotBlocked } from '../common/blocks'
import { publicUserSelect } from '../common/public-user.select'
import { sanitizeText } from '../common/text'
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
    if (input.subjectId === authorId) throw new BadRequestException('You cannot review yourself')
    if (!transaction.participants.some(participant => participant.userId === input.subjectId)) {
      throw new ForbiddenException('You can only review the other person in this transaction')
    }
    await assertNotBlocked(this.prisma, authorId, input.subjectId)
    const body = sanitizeText(input.body, 4000)
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

  async listForSubject(subjectId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: subjectId, status: 'ACTIVE', deletedAt: null },
      select: { id: true }
    })
    if (!user) throw new NotFoundException('Profile not found')

    const reviews = await this.prisma.review.findMany({
      where: { subjectId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        rating: true,
        body: true,
        createdAt: true,
        author: { select: publicUserSelect },
        transaction: { select: { offerId: true } }
      }
    })

    const offerIds = [...new Set(reviews.map(review => review.transaction.offerId).filter((id): id is string => Boolean(id)))]
    const items = offerIds.length
      ? await this.prisma.offerItem.findMany({
          where: { offerId: { in: offerIds } },
          select: { offerId: true, listing: { select: { title: true } } },
          orderBy: { id: 'asc' }
        })
      : []
    const titleByOffer = new Map<string, string>()
    for (const item of items) {
      if (!titleByOffer.has(item.offerId)) titleByOffer.set(item.offerId, item.listing.title)
    }

    return reviews.map(review => ({
      id: review.id,
      rating: review.rating,
      body: review.body,
      createdAt: review.createdAt,
      itemTitle: review.transaction.offerId ? titleByOffer.get(review.transaction.offerId) ?? null : null,
      author: {
        id: review.author.id,
        profile: review.author.profile
          ? {
              displayName: review.author.profile.displayName,
              firstName: review.author.profile.firstName,
              neighborhood: review.author.profile.neighborhood,
              city: review.author.profile.city
            }
          : null
      }
    }))
  }
}
