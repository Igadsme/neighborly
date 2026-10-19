import { BadRequestException } from '@nestjs/common'
import { TransactionStatus } from '@prisma/client'
import { assertTransactionTransition } from './transaction-state'

describe('transaction state machine', () => {
  it('allows the request-first happy path', () => {
    expect(() => assertTransactionTransition(TransactionStatus.DRAFT, TransactionStatus.PUBLISHED)).not.toThrow()
    expect(() => assertTransactionTransition(TransactionStatus.PUBLISHED, TransactionStatus.OFFER_RECEIVED)).not.toThrow()
    expect(() => assertTransactionTransition(TransactionStatus.OFFER_RECEIVED, TransactionStatus.ACCEPTED)).not.toThrow()
    expect(() => assertTransactionTransition(TransactionStatus.ACCEPTED, TransactionStatus.SCHEDULED)).not.toThrow()
    expect(() => assertTransactionTransition(TransactionStatus.SCHEDULED, TransactionStatus.IN_PROGRESS)).not.toThrow()
    expect(() => assertTransactionTransition(TransactionStatus.IN_PROGRESS, TransactionStatus.COMPLETED)).not.toThrow()
  })

  it('rejects terminal-state and skipped transitions', () => {
    expect(() => assertTransactionTransition(TransactionStatus.DRAFT, TransactionStatus.COMPLETED)).toThrow(BadRequestException)
    expect(() => assertTransactionTransition(TransactionStatus.COMPLETED, TransactionStatus.CANCELLED)).toThrow(BadRequestException)
  })
})
