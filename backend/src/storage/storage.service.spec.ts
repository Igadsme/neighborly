import { BadRequestException, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { StorageService } from './storage.service'

describe('StorageService', () => {
  it('requires configured S3 storage before issuing an upload form', async () => {
    const config = {
      get: () => undefined,
    } as unknown as ConfigService
    const storage = new StorageService(config)
    await expect(
      storage.createImageUpload('user-1', 'listing-1', 'image/jpeg'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('rejects unsupported image formats before contacting storage', async () => {
    const config = {
      get: () => undefined,
    } as unknown as ConfigService
    const storage = new StorageService(config)
    await expect(
      storage.createImageUpload('user-1', 'listing-1', 'image/svg+xml'),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('creates a short-lived form constrained to accepted image content and size', async () => {
    const values: Record<string, string> = {
      S3_ENDPOINT: 'http://localhost:9000',
      S3_BUCKET: 'neighborly-media',
      S3_ACCESS_KEY: 'local-user',
      S3_SECRET_KEY: 'local-secret',
      S3_REGION: 'us-east-1',
      S3_PUBLIC_URL: 'http://localhost:9000/neighborly-media',
    }
    const config = {
      get: (key: string) => values[key],
    } as unknown as ConfigService
    const storage = new StorageService(config)
    const form = await storage.createImageUpload(
      'user-id',
      'listing-id',
      'image/png',
    )
    expect(form.url).toBe('http://localhost:9000/neighborly-media')
    expect(form.fields['Content-Type']).toBe('image/png')
    expect(form.fields.key).toMatch(/^listings\/user-id\/listing-id\/.+\.png$/)
    expect(form.fields.Policy).toBeDefined()
  })

  it('constructs public URLs from a configured base and object key', () => {
    const config = {
      get: (key: string) =>
        key === 'S3_PUBLIC_URL' ? 'https://images.example.test/bucket/' : undefined,
    } as unknown as ConfigService
    const storage = new StorageService(config)
    expect(
      storage.publicImageUrl('listings/user/listing/photo one.jpg'),
    ).toBe('https://images.example.test/bucket/listings/user/listing/photo%20one.jpg')
  })
})
