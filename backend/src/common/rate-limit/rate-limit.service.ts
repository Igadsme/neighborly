import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'

interface LocalCounter {
  count: number
  expiresAt: number
}

@Injectable()
export class RateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name)
  private readonly local = new Map<string, LocalCounter>()
  private redis?: Redis

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('REDIS_URL')
    if (!url) return
    this.redis = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
    this.redis.on('error', (error) => this.logger.warn(`Redis rate-limit connection error: ${error.message}`))
    try {
      await this.redis.connect()
      await this.redis.ping()
      this.logger.log('Redis-backed rate limiting is active')
    } catch (error) {
      this.logger.warn(`Using in-process rate limiting: ${error instanceof Error ? error.message : error}`)
      this.redis.disconnect()
      this.redis = undefined
    }
  }

  async increment(key: string, windowMs: number) {
    if (this.redis) {
      try {
        const value = await this.redis.eval(
          "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return n",
          1,
          key,
          windowMs,
        )
        return Number(value)
      } catch (error) {
        this.logger.warn(`Redis rate-limit operation failed; using local fallback: ${error instanceof Error ? error.message : error}`)
      }
    }
    const now = Date.now()
    const current = this.local.get(key)
    if (!current || current.expiresAt <= now) {
      this.local.set(key, { count: 1, expiresAt: now + windowMs })
      this.pruneLocal(now)
      return 1
    }
    current.count += 1
    return current.count
  }

  async isRedisReady() {
    if (!this.redis) return this.config.get<string>('REDIS_URL') ? false : null
    try {
      return (await this.redis.ping()) === 'PONG'
    } catch {
      return false
    }
  }

  onModuleDestroy() {
    this.redis?.disconnect()
  }

  private pruneLocal(now: number) {
    if (this.local.size < 10_000) return
    for (const [key, value] of this.local) {
      if (value.expiresAt <= now) this.local.delete(key)
    }
  }
}
