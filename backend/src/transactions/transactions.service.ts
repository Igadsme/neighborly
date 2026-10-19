import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, TransactionStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { TransitionTransactionDto } from './dto'
import { assertTransactionTransition } from './transaction-state'

type Tx = Prisma.TransactionClient

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

  /**
   * Participants may walk the ordinary edges. Leaving `IN_PROGRESS` for
   * `COMPLETED` records this caller's confirmation and changes status only
   * when every participant has confirmed. Leaving `DISPUTED` is staff-only,
   * using the same staff-role gate as borrow dispute review.
   */
  async transition(userId: string, id: string, input: TransitionTransactionDto) {
    const transaction = await this.prisma.transaction.findUnique({ where: { id }, include: { participants: true } })
    if (!transaction) throw new NotFoundException('Transaction not found')

    const isParticipant = transaction.participants.some(participant => participant.userId === userId)
    if (!isParticipant) {
      const staffResolvingDispute =
        transaction.status === TransactionStatus.DISPUTED &&
        input.status !== transaction.status &&
        (await this.isStaff(userId))
      if (!staffResolvingDispute) throw new ForbiddenException()
    }

    // Idempotent: re-requesting the current status returns the
    // current state instead of writing a duplicate milestone.
    if (transaction.status === input.status) return transaction

    assertTransactionTransition(transaction.status, input.status)

    if (transaction.status === TransactionStatus.DISPUTED) {
      await this.assertStaff(userId)
      return this.writeStatus(id, transaction.status, input.status)
    }

    if (transaction.status === TransactionStatus.IN_PROGRESS && input.status === TransactionStatus.COMPLETED) {
      return this.confirmCompletion(userId, id)
    }

    return this.writeStatus(id, transaction.status, input.status)
  }

  /**
   * One side of an explicit two-step confirm. The row stays `IN_PROGRESS`
   * until every participant has a confirmation timestamp, so a review cannot
   * be opened from a one-sided write.
   */
  private async confirmCompletion(userId: string, transactionId: string) {
    return this.prisma.$transaction(async (tx: Tx) => {
      await tx.transactionParticipant.update({
        where: { transactionId_userId: { transactionId, userId } },
        data: { completionConfirmedAt: new Date() }
      })
      const participants = await tx.transactionParticipant.findMany({ where: { transactionId } })
      const completionConfirmedBy = participants
        .filter(participant => participant.completionConfirmedAt)
        .map(participant => participant.userId)
      const everyoneConfirmed = participants.length >= 2 && completionConfirmedBy.length === participants.length
      if (!everyoneConfirmed) {
        const current = await tx.transaction.findUniqueOrThrow({
          where: { id: transactionId },
          include: { participants: true }
        })
        return { ...current, awaitingConfirmation: true as const, completionConfirmedBy }
      }

      const claimed = await tx.transaction.updateMany({
        where: { id: transactionId, status: TransactionStatus.IN_PROGRESS },
        data: { status: TransactionStatus.COMPLETED }
      })
      if (claimed.count === 0) {
        const fresh = await tx.transaction.findUnique({ where: { id: transactionId } })
        if (!fresh) throw new NotFoundException('Transaction not found')
        if (fresh.status === TransactionStatus.COMPLETED) return fresh
        throw new BadRequestException(
          `Transaction state changed: expected ${TransactionStatus.IN_PROGRESS}, found ${fresh.status}`
        )
      }
      await tx.transactionMilestone.create({
        data: {
          transactionId,
          fromStatus: TransactionStatus.IN_PROGRESS,
          toStatus: TransactionStatus.COMPLETED
        }
      })
      return tx.transaction.findUniqueOrThrow({ where: { id: transactionId } })
    })
  }

  private async writeStatus(transactionId: string, from: TransactionStatus, to: TransactionStatus) {
    return this.prisma.$transaction(async (tx: Tx) => {
      // Conditional update keyed on the expected current status. A
      // concurrent transition that already committed makes this a
      // no-op, so stale requests can never overwrite a newer state.
      const claimed = await tx.transaction.updateMany({
        where: { id: transactionId, status: from },
        data: { status: to }
      })
      if (claimed.count === 0) {
        const fresh = await tx.transaction.findUnique({ where: { id: transactionId } })
        if (!fresh) throw new NotFoundException('Transaction not found')
        throw new BadRequestException(`Transaction state changed: expected ${from}, found ${fresh.status}`)
      }
      await tx.transactionMilestone.create({
        data: { transactionId, fromStatus: from, toStatus: to }
      })
      return tx.transaction.findUniqueOrThrow({ where: { id: transactionId } })
    })
  }

  /** Borrow's staff gate: any staff-role assignment, not a participant vote. */
  private async assertStaff(userId: string) {
    if (await this.isStaff(userId)) return
    throw new ForbiddenException('Only staff can take that action')
  }

  private async isStaff(userId: string) {
    const assignment = await this.prisma.staffRoleAssignment.findFirst({
      where: { userId },
      select: { id: true }
    })
    return assignment !== null
  }
}
