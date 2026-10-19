import { ServiceUnavailableException } from '@nestjs/common'

export type DependencyState = 'up' | 'down' | 'skipped' | 'unknown'

export async function collectReadiness(deps: {
  postgres: () => Promise<unknown>
  redisUrl?: string
  ping: (url: string) => Promise<void>
}) {
  const redisUrl = deps.redisUrl?.trim()
  try {
    await deps.postgres()
  } catch {
    throw new ServiceUnavailableException({
      status: 'not_ready',
      dependencies: { postgres: 'down' satisfies DependencyState, redis: redisUrl ? 'unknown' : 'skipped' }
    })
  }

  if (!redisUrl) {
    return { status: 'ready' as const, dependencies: { postgres: 'up' as const, redis: 'skipped' as const } }
  }

  try {
    await deps.ping(redisUrl)
  } catch {
    throw new ServiceUnavailableException({
      status: 'not_ready',
      dependencies: { postgres: 'up' satisfies DependencyState, redis: 'down' }
    })
  }

  return { status: 'ready' as const, dependencies: { postgres: 'up' as const, redis: 'up' as const } }
}

export async function pingRedis(url: string) {
  const { default: Redis } = await import('ioredis')
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 1000,
    enableOfflineQueue: false,
    lazyConnect: true
  })
  try {
    await client.connect()
    const reply = await client.ping()
    if (reply !== 'PONG') throw new Error('Redis ping failed')
  } finally {
    client.disconnect()
  }
}
