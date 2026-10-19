import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common'
import { createAdapter } from '@socket.io/redis-adapter'

export type RedisClient = {
  quit: () => Promise<unknown>
  disconnect: () => void
  ping: () => Promise<unknown>
  on: (event: string, listener: (...args: unknown[]) => void) => unknown
}

export type SocketRedisConnection = {
  mode: 'single' | 'redis'
  pub?: RedisClient
  sub?: RedisClient
}

export type RedisFactory = (url: string) => Promise<{ pub: RedisClient; sub: RedisClient }>

/**
 * Opens the pub/sub pair Socket.IO uses to fan out across API processes.
 * With no REDIS_URL, or when Redis cannot be reached outside production,
 * the process stays on Socket.IO's single-node adapter.
 */
export async function openSocketRedis(url: string | undefined, nodeEnv: string, factory: RedisFactory): Promise<SocketRedisConnection> {
  const trimmed = url?.trim()
  if (!trimmed) return { mode: 'single' }
  let pub: RedisClient | undefined
  let sub: RedisClient | undefined
  try {
    const opened = await factory(trimmed)
    pub = opened.pub
    sub = opened.sub
    await pub.ping()
    return { mode: 'redis', pub, sub }
  } catch (error) {
    await safeQuit(pub)
    await safeQuit(sub)
    if (nodeEnv === 'production') throw error
    return { mode: 'single' }
  }
}

export async function closeSocketRedis(connection: SocketRedisConnection): Promise<void> {
  await safeQuit(connection.pub)
  await safeQuit(connection.sub)
  connection.pub = undefined
  connection.sub = undefined
  connection.mode = 'single'
}

async function safeQuit(client: RedisClient | undefined) {
  if (!client) return
  try {
    await client.quit()
  } catch {
    client.disconnect()
  }
}

export async function connectIoredis(url: string): Promise<{ pub: RedisClient; sub: RedisClient }> {
  const { default: Redis } = await import('ioredis')
  const pub = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true })
  const sub = pub.duplicate()
  await pub.connect()
  await sub.connect()
  return { pub, sub }
}

@Injectable()
export class SocketRedis implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(SocketRedis.name)
  connection: SocketRedisConnection = { mode: 'single' }
  /** Tests swap this for an in-memory pub/sub pair. The app uses ioredis. */
  factory: RedisFactory = connectIoredis
  private opening?: Promise<void>

  /**
   * Opens the pub/sub pair. Idempotent: a second call waits on the first
   * attempt instead of opening another pair. main.ts must finish this before
   * Nest builds the Socket.IO server, which happens before onModuleInit.
   */
  async connect() {
    if (!this.opening) this.opening = this.open()
    return this.opening
  }

  /**
   * Nest calls this after the Socket.IO server already exists. If connect()
   * has started, do nothing so a late hook cannot replace the clients the
   * adapter is already using.
   */
  async onModuleInit() {
    if (this.opening) return
    await this.connect()
  }

  private async open() {
    try {
      this.connection = await openSocketRedis(process.env.REDIS_URL, process.env.NODE_ENV ?? 'development', this.factory)
    } catch (error) {
      this.opening = undefined
      throw error
    }
    if (this.connection.mode === 'single') {
      this.logger.log('REDIS_URL unset or unavailable; Socket.IO is single-node')
    }
  }

  adapter() {
    if (this.connection.mode !== 'redis' || !this.connection.pub || !this.connection.sub) return undefined
    return createAdapter(this.connection.pub as never, this.connection.sub as never)
  }

  async onApplicationShutdown() {
    await closeSocketRedis(this.connection)
  }
}
