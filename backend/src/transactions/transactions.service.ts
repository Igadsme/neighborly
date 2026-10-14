import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
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

    // Idempotent: re-requesting the current status returns the
    // current state instead of writing a duplicate milestone.
    if (transaction.status === input.status) return transaction

    assertTransactionTransition(transaction.status, input.status)

    return this.prisma.$transaction(async tx => {
      // Conditional update keyed on the expected current status. A
      // concurrent transition that already committed makes this a
      // no-op, so stale requests can never overwrite a newer state.
      const claimed = await tx.transaction.updateMany({
        where: { id, status: transaction.status },
        data: { status: input.status }
      })
      if (claimed.count === 0) {
        const fresh = await tx.transaction.findUnique({ where: { id } })
        if (!fresh) throw new NotFoundException('Transaction not found')
        throw new BadRequestException(`Transaction state changed: expected ${transaction.status}, found ${fresh.status}`)
      }
      await tx.transactionMilestone.create({
        data: { transactionId: id, fromStatus: transaction.status, toStatus: input.status }
      })
      return tx.transaction.findUniqueOrThrow({ where: { id } })
    })
  }
}
