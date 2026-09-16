import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { TransitionTransactionDto } from './dto'
import { assertTransactionTransition } from './transaction-state'

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.transaction.findMany({
      where: { participants: { some: { userId } } },
      include: { participants: true, milestones: { orderBy: { createdAt: 'asc' } }, appointments: true },
      orderBy: { updatedAt: 'desc' }
    })
  }

  async transition(userId: string, id: string, input: TransitionTransactionDto) {
    const transaction = await this.prisma.transaction.findUnique({ where: { id }, include: { participants: true } })
    if (!transaction) throw new NotFoundException('Transaction not found')
    if (!transaction.participants.some(participant => participant.userId === userId)) throw new ForbiddenException()
    assertTransactionTransition(transaction.status, input.status)
    return this.prisma.$transaction(async tx => {
      const updated = await tx.transaction.update({ where: { id }, data: { status: input.status } })
      await tx.transactionMilestone.create({ data: { transactionId: id, fromStatus: transaction.status, toStatus: input.status } })
      return updated
    })
  }
}
