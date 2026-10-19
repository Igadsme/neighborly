import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { noteSlowQuery } from '../common/slow-query'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super(process.env.SLOW_QUERY_LOG === '1' ? { log: [{ emit: 'event', level: 'query' }] } : {})
    if (process.env.SLOW_QUERY_LOG === '1') {
      const threshold = Number(process.env.SLOW_QUERY_MS ?? 200)
      ;(this as unknown as { $on: (event: 'query', cb: (event: { duration: number; query: string }) => void) => void }).$on(
        'query',
        event => noteSlowQuery(event, Number.isFinite(threshold) ? threshold : 200)
      )
    }
  }

  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
