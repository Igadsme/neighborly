import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { RateLimitService } from '../common/rate-limit/rate-limit.service'

@Controller()
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rateLimits: RateLimitService,
  ) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'neighborly-api', timestamp: new Date().toISOString() }
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      const redis = await this.rateLimits.isRedisReady()
      if (redis === false) throw new Error('Redis is unavailable')
      return {
        status: 'ready',
        dependencies: {
          postgres: 'up',
          ...(redis === null ? {} : { redis: 'up' }),
        },
      }
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        dependencies: { postgres: 'unknown', redis: 'unknown' }
      })
    }
  }
}
