import { BadRequestException } from '@nestjs/common'
import { TransactionStatus } from '@prisma/client'

const transitions: Record<TransactionStatus, readonly TransactionStatus[]> = {
  DRAFT: ['PUBLISHED', 'CANCELLED'],
  PUBLISHED: ['OFFER_RECEIVED', 'CANCELLED', 'EXPIRED'],
  OFFER_RECEIVED: ['NEGOTIATING', 'ACCEPTED', 'CANCELLED', 'EXPIRED'],
  NEGOTIATING: ['OFFER_RECEIVED', 'ACCEPTED', 'CANCELLED', 'EXPIRED'],
  ACCEPTED: ['SCHEDULED', 'CANCELLED', 'DISPUTED'],
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED', 'DISPUTED'],
  IN_PROGRESS: ['COMPLETED', 'DISPUTED'],
  COMPLETED: [],
  CANCELLED: [],
  DISPUTED: ['REFUNDED', 'COMPLETED', 'CANCELLED'],
  REFUNDED: [],
  EXPIRED: []
}

export function assertTransactionTransition(from: TransactionStatus, to: TransactionStatus) {
  if (!transitions[from].includes(to)) {
    throw new BadRequestException(`Invalid transaction transition: ${from} -> ${to}`)
  }
}
