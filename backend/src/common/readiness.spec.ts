import { ServiceUnavailableException } from '@nestjs/common'
import { collectReadiness } from './readiness'

describe('collectReadiness', () => {
  it('reports postgres up and skips redis when REDIS_URL is empty', async () => {
    await expect(collectReadiness({ postgres: async () => 1, redisUrl: '', ping: async () => undefined })).resolves.toEqual({
      status: 'ready',
      dependencies: { postgres: 'up', redis: 'skipped' }
    })
  })

  it('reports redis up when the ping succeeds', async () => {
    await expect(
      collectReadiness({ postgres: async () => 1, redisUrl: 'redis://localhost:6379', ping: async () => undefined })
    ).resolves.toEqual({ status: 'ready', dependencies: { postgres: 'up', redis: 'up' } })
  })

  it('is not ready when postgres is down', async () => {
    await expect(
      collectReadiness({
        postgres: async () => {
          throw new Error('down')
        },
        redisUrl: 'redis://localhost:6379',
        ping: async () => undefined
      })
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('is not ready when redis is configured and the ping fails', async () => {
    try {
      await collectReadiness({
        postgres: async () => 1,
        redisUrl: 'redis://localhost:6379',
        ping: async () => {
          throw new Error('down')
        }
      })
      throw new Error('expected readiness to fail')
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException)
      expect((error as ServiceUnavailableException).getResponse()).toMatchObject({
        status: 'not_ready',
        dependencies: { postgres: 'up', redis: 'down' }
      })
    }
  })
})
