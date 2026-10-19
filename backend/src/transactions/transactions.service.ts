import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { CreateReviewDto, ScheduleAppointmentDto, TransitionTransactionDto } from './dto'
import { assertTransactionTransition } from './transaction-state'

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.transaction.findMany({
      where: { participants: { some: { userId } } },
      include: { participants: true, milestones: { orderBy: { createdAt: 'asc' } }, appointments: true, reviews: true },
      orderBy: { updatedAt: 'desc' }
    })
  }

  async transition(userId: string, id: string, input: TransitionTransactionDto) {
    const transaction = await this.prisma.transaction.findUnique({ where: { id }, include: { participants: true } })
    if (!transaction) throw new NotFoundException('Transaction not found')
    if (!transaction.participants.some(participant => participant.userId === userId)) throw new ForbiddenException()
    if (input.status === 'SCHEDULED') {
      throw new BadRequestException('Create an appointment to schedule an exchange')
    }
    assertTransactionTransition(transaction.status, input.status)
    return this.prisma.$transaction(async tx => {
      const changed = await tx.transaction.updateMany({
        where: { id, status: transaction.status, participants: { some: { userId } } },
        data: { status: input.status },
      })
      if (changed.count !== 1) throw new ConflictException('Transaction status changed; refresh and try again')
      await tx.transactionMilestone.create({ data: { transactionId: id, fromStatus: transaction.status, toStatus: input.status } })
      return tx.transaction.findUniqueOrThrow({ where: { id } })
    })
  }

  async schedule(userId: string, id: string, input: ScheduleAppointmentDto) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: { participants: true },
    })
    if (!transaction) throw new NotFoundException('Transaction not found')
    if (!transaction.participants.some(participant => participant.userId === userId)) {
      throw new ForbiddenException()
    }
    assertTransactionTransition(transaction.status, 'SCHEDULED')
    const startsAt = new Date(input.startsAt)
    if (startsAt <= new Date()) throw new ConflictException('Appointment must be in the future')

    return this.prisma.$transaction(async tx => {
      const claimed = await tx.transaction.updateMany({
        where: { id, status: 'ACCEPTED', participants: { some: { userId } } },
        data: { status: 'SCHEDULED' },
      })
      if (claimed.count !== 1) throw new ConflictException('Transaction status changed; refresh and try again')
      const appointment = await tx.appointment.create({
        data: {
          transactionId: id,
          startsAt,
          locationNote: input.locationNote?.trim(),
        },
      })
      await tx.transactionMilestone.create({
        data: { transactionId: id, fromStatus: 'ACCEPTED', toStatus: 'SCHEDULED' },
      })
      return { transaction: await tx.transaction.findUniqueOrThrow({ where: { id } }), appointment }
    })
  }

  async review(userId: string, id: string, input: CreateReviewDto) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id },
      include: { participants: true },
    })
    if (!transaction) throw new NotFoundException('Transaction not found')
    const participantIds = transaction.participants.map(participant => participant.userId)
    if (!participantIds.includes(userId)) throw new ForbiddenException()
    if (transaction.status !== 'COMPLETED') {
      throw new ConflictException('Reviews are available after a completed exchange')
    }
    if (!participantIds.includes(input.subjectId) || input.subjectId === userId) {
      throw new ForbiddenException('Reviews must be for the other transaction participant')
    }
    const existing = await this.prisma.review.findFirst({
      where: { transactionId: id, authorId: userId, subjectId: input.subjectId },
    })
    if (existing) throw new ConflictException('You have already reviewed this participant')
    try {
      return await this.prisma.review.create({
        data: {
          transactionId: id,
          authorId: userId,
          subjectId: input.subjectId,
          rating: input.rating,
          body: input.body.trim(),
        },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('You have already reviewed this participant')
      }
      throw error
    }
  }
}
