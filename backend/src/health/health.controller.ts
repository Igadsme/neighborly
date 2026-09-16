import { Controller, Get, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'neighborly-api', timestamp: new Date().toISOString() }
  }

  @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return { status: 'ready', dependencies: { postgres: 'up' } }
    } catch {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        dependencies: { postgres: 'down' }
      })
    }
  }
}
