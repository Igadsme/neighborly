import { Global, Module } from '@nestjs/common'
import { PrismaModule } from '../prisma/prisma.module'
import { OutboxWriter } from './outbox-writer'

/**
 * Global because the outbox is used by any module that commits a state
 * change another module may need to hear about.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [OutboxWriter],
  exports: [OutboxWriter]
})
export class EventsModule {}
