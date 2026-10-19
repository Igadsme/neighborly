import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { audit } from '../common/logger'
import { PrismaService } from '../prisma/prisma.service'
import { DomainEventType, dedupeKey } from './domain-events'

/**
 * Transactional outbox writer.
 *
 * `record` must be called with the same Prisma transaction client as the
 * state change it describes. That is what makes delivery reliable: the
 * event row and the business row commit together, so there is no window in
 * which one exists and the other does not.
 *
 * Deduplication is enforced by the unique index on `dedupeKey`. A duplicate
 * insert is swallowed rather than thrown, so retrying a request that
 * already produced its event is safe.
 */
@Injectable()
export class OutboxWriter {
  private readonly logger = new Logger(OutboxWriter.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Accepts either the root client or a transaction client, so a caller
   * inside `prisma.$transaction` does not accidentally write outside it.
   */
  async record(
    type: DomainEventType,
    payload: Prisma.InputJsonValue,
    options: { actorId?: string; dedupe?: string[] } = {},
    client: Prisma.TransactionClient | PrismaService = this.prisma
  ): Promise<boolean> {
    const key = options.dedupe ? dedupeKey(type, ...options.dedupe) : null
    try {
      await client.domainEventOutbox.create({
        data: {
          type,
          payload,
          actorId: options.actorId,
          ...(key ? { dedupeKey: key } : {})
        }
      })
      return true
    } catch (error) {
      if (isUniqueViolation(error)) {
        // The event already exists, which is exactly the desired outcome.
        audit('event.deduplicated', { type, dedupeKey: key })
        return false
      }
      // An outbox failure must not silently swallow a business change, but
      // it also must not roll back a completed transaction. Log loudly.
      this.logger.error(`failed to record ${type}`, error as Error)
      throw error
    }
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: string }).code === 'P2002'
  )
}