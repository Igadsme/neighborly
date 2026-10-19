import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { StorageController } from './storage.controller'
import { StorageService } from './storage.service'

describe('Media HTTP', () => {
  const get = jest.fn()
  let app: INestApplication
  let baseUrl = ''

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [{ provide: StorageService, useValue: { get } }]
    }).compile()
    app = moduleRef.createNestApplication({ forceCloseConnections: true })
    app.setGlobalPrefix('api/v1')
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    if (!address || typeof address === 'string') throw new Error('HTTP server is not listening')
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /api/v1/media/listings/:listingId/:file rejects a non-UUID with 400 before storage', async () => {
    const response = await fetch(`${baseUrl}/api/v1/media/listings/not-a-uuid/photo.jpg`)
    expect(response.status).toBe(400)
    expect(get).not.toHaveBeenCalled()
  })
})
