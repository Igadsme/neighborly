import { Controller, Get } from '@nestjs/common'
import { collectReadiness, pingRedis } from '../common/readiness'
import { PrismaService } from '../prisma/prisma.service'

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'neighborly-api', timestamp: new Date().toISOString() }
  }

  @Get('ready')
  ready() {
    return collectReadiness({
      postgres: () => this.prisma.$queryRaw`SELECT 1`,
      redisUrl: process.env.REDIS_URL,
      ping: pingRedis
    })
  }
}
