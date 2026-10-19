import { closeSocketRedis, openSocketRedis, SocketRedis, type RedisClient, type RedisFactory } from './socket-redis'

function client(): RedisClient & { quit: jest.Mock; disconnect: jest.Mock; ping: jest.Mock } {
  return {
    quit: jest.fn(async () => 'OK'),
    disconnect: jest.fn(),
    ping: jest.fn(async () => 'PONG'),
    on: jest.fn()
  }
}

describe('openSocketRedis', () => {
  it('stays single-node and does not open clients when REDIS_URL is unset', async () => {
    const factory = jest.fn()
    const connection = await openSocketRedis(undefined, 'development', factory as RedisFactory)
    expect(connection).toEqual({ mode: 'single' })
    expect(factory).not.toHaveBeenCalled()
    await expect(closeSocketRedis(connection)).resolves.toBeUndefined()
  })

  it('closes both pub and sub clients on shutdown', async () => {
    const pub = client()
    const sub = client()
    const connection = await openSocketRedis('redis://127.0.0.1:6379', 'test', async () => ({ pub, sub }))
    expect(connection.mode).toBe('redis')
    await closeSocketRedis(connection)
    expect(pub.quit).toHaveBeenCalledTimes(1)
    expect(sub.quit).toHaveBeenCalledTimes(1)
    expect(connection.pub).toBeUndefined()
    expect(connection.sub).toBeUndefined()
    expect(connection.mode).toBe('single')
  })

  it('disconnects a client when quit throws', async () => {
    const pub = client()
    pub.quit.mockRejectedValue(new Error('already closed'))
    const sub = client()
    const connection = await openSocketRedis('redis://127.0.0.1:6379', 'test', async () => ({ pub, sub }))
    await closeSocketRedis(connection)
    expect(pub.disconnect).toHaveBeenCalledTimes(1)
    expect(sub.quit).toHaveBeenCalledTimes(1)
  })

  it('falls back to a single node outside production when Redis cannot be reached', async () => {
    const pub = client()
    const connection = await openSocketRedis('redis://127.0.0.1:6379', 'development', async () => {
      throw new Error('ECONNREFUSED')
    })
    expect(connection.mode).toBe('single')
    expect(pub.quit).not.toHaveBeenCalled()
  })

  it('quits clients opened before a failed ping outside production', async () => {
    const pub = client()
    pub.ping.mockRejectedValue(new Error('ECONNREFUSED'))
    const sub = client()
    const connection = await openSocketRedis('redis://127.0.0.1:6379', 'development', async () => ({ pub, sub }))
    expect(connection.mode).toBe('single')
    expect(pub.quit).toHaveBeenCalledTimes(1)
    expect(sub.quit).toHaveBeenCalledTimes(1)
  })

  it('rethrows a connection failure in production', async () => {
    await expect(openSocketRedis('redis://127.0.0.1:6379', 'production', async () => {
      throw new Error('ECONNREFUSED')
    })).rejects.toThrow('ECONNREFUSED')
  })
})

describe('SocketRedis lifecycle', () => {
  const previous = process.env.REDIS_URL

  afterEach(() => {
    if (previous === undefined) delete process.env.REDIS_URL
    else process.env.REDIS_URL = previous
  })

  it('boots a single node without errors when REDIS_URL is unset', async () => {
    delete process.env.REDIS_URL
    const sockets = new SocketRedis()
    await expect(sockets.connect()).resolves.toBeUndefined()
    await expect(sockets.onModuleInit()).resolves.toBeUndefined()
    expect(sockets.connection.mode).toBe('single')
    expect(sockets.adapter()).toBeUndefined()
    await expect(sockets.onApplicationShutdown()).resolves.toBeUndefined()
  })

  it('opens Redis once when connect runs before onModuleInit', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379'
    const pub = client()
    const sub = client()
    const factory = jest.fn(async () => ({ pub, sub }))
    const sockets = new SocketRedis()
    sockets.factory = factory

    await sockets.connect()
    await sockets.connect()
    await sockets.onModuleInit()

    expect(factory).toHaveBeenCalledTimes(1)
    expect(sockets.connection.mode).toBe('redis')
    expect(sockets.adapter()).toBeDefined()
    await sockets.onApplicationShutdown()
    expect(pub.quit).toHaveBeenCalledTimes(1)
    expect(sub.quit).toHaveBeenCalledTimes(1)
  })

  it('rethrows from connect when production Redis is unreachable', async () => {
    process.env.REDIS_URL = 'redis://127.0.0.1:6379'
    const previousEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const sockets = new SocketRedis()
      sockets.factory = async () => {
        throw new Error('ECONNREFUSED')
      }
      await expect(sockets.connect()).rejects.toThrow('ECONNREFUSED')
    } finally {
      if (previousEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousEnv
    }
  })
})
