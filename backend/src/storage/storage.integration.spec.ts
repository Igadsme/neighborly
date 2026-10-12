import { randomUUID } from 'node:crypto'
import { detectImageType, StorageService } from './storage.service'
import {
  gifBytes,
  jpegBytes,
  pdfBytes,
  pngBytes,
  polyglotBytes,
  rawS3Client,
  readStoredObject,
  storageServiceForTest,
  testStorageConfig,
  webpBytes
} from './testing/storage-fixtures'

/**
 * These tests put real objects into a disposable MinIO and read them back.
 * Nothing is mocked: a passing run proves the bytes survived the round trip
 * through S3, not just that a function was called.
 */
describe('Listing image storage against real MinIO', () => {
  let storage: StorageService
  let listingId: string

  beforeAll(async () => {
    storage = storageServiceForTest()
    await expect(storage.exists()).resolves.toBe(true)
  })

  beforeEach(() => {
    listingId = randomUUID()
  })

  it('stores a real PNG and reads back identical bytes', async () => {
    const source = pngBytes()
    const stored = await storage.putListingImage(listingId, source)

    expect(stored.contentType).toBe('image/png')
    expect(stored.size).toBe(source.length)
    expect(stored.objectKey).toContain(`listings/${listingId}/`)

    const read = await readStoredObject(stored.objectKey)
    expect(read.equals(source)).toBe(true)
  })

  it('stores JPEG and WebP and detects each by content', async () => {
    const cases: Array<[Buffer, string]> = [
      [jpegBytes(), 'image/jpeg'],
      [webpBytes(), 'image/webp']
    ]
    for (const [bytes, expected] of cases) {
      expect(detectImageType(bytes)).toBe(expected)
      const stored = await storage.putListingImage(listingId, bytes)
      expect(stored.contentType).toBe(expected)
      expect((await readStoredObject(stored.objectKey)).equals(bytes)).toBe(true)
    }
  })

  it('detects GIF but refuses it unless the allow-list includes it', async () => {
    // Detection and acceptance are separate decisions: a valid GIF is
    // still refused under the default JPEG/PNG/WebP policy.
    expect(detectImageType(gifBytes())).toBe('image/gif')
    await expect(storage.putListingImage(listingId, gifBytes())).rejects.toThrow('not accepted')

    const previous = process.env.ALLOWED_IMAGE_TYPES
    process.env.ALLOWED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif'
    try {
      const stored = await storage.putListingImage(listingId, gifBytes())
      expect(stored.contentType).toBe('image/gif')
      expect((await readStoredObject(stored.objectKey)).equals(gifBytes())).toBe(true)
    } finally {
      if (previous === undefined) delete process.env.ALLOWED_IMAGE_TYPES
      else process.env.ALLOWED_IMAGE_TYPES = previous
    }
  })

  it('gives every upload a distinct object key', async () => {
    const first = await storage.putListingImage(listingId, pngBytes())
    const second = await storage.putListingImage(listingId, pngBytes())
    expect(first.objectKey).not.toBe(second.objectKey)
    // Both objects really exist; keys are unique rather than overwritten.
    expect((await readStoredObject(first.objectKey)).length).toBeGreaterThan(0)
    expect((await readStoredObject(second.objectKey)).length).toBeGreaterThan(0)
  })

  it('scopes the object key to the listing', async () => {
    const mine = await storage.putListingImage(randomUUID(), pngBytes())
    const other = await storage.putListingImage(randomUUID(), pngBytes())
    expect(mine.objectKey.split('/')[1]).not.toBe(other.objectKey.split('/')[1])
  })

  it('rejects a non-image file by its content', async () => {
    await expect(storage.putListingImage(listingId, pdfBytes())).rejects.toThrow(
      'not a JPEG, PNG, WebP, or GIF image'
    )
  })

  it('rejects a file whose bytes contradict its declared type', async () => {
    // A PNG signature followed by an MZ header: detected as a PNG, but the
    // caller claims it is a JPEG, so it is refused rather than trusted.
    await expect(storage.putListingImage(listingId, polyglotBytes(), 'image/jpeg')).rejects.toThrow(
      'does not match its declared type'
    )
  })

  it('rejects an empty file and a file over the size limit', async () => {
    await expect(storage.putListingImage(listingId, Buffer.alloc(0))).rejects.toThrow()
    const previous = process.env.MAX_UPLOAD_SIZE_MB
    process.env.MAX_UPLOAD_SIZE_MB = '1'
    try {
      const oversize = Buffer.concat([pngBytes(), Buffer.alloc(1024 * 1024 + 64)])
      await expect(storage.putListingImage(listingId, oversize)).rejects.toThrow('exceeds the upload size limit')
    } finally {
      if (previous === undefined) delete process.env.MAX_UPLOAD_SIZE_MB
      else process.env.MAX_UPLOAD_SIZE_MB = previous
    }
  })

  it('honors a narrowed allowed-types list', async () => {
    const previous = process.env.ALLOWED_IMAGE_TYPES
    process.env.ALLOWED_IMAGE_TYPES = 'image/png'
    try {
      await expect(storage.putListingImage(listingId, jpegBytes())).rejects.toThrow('not accepted')
      await expect(storage.putListingImage(listingId, pngBytes())).resolves.toBeTruthy()
    } finally {
      if (previous === undefined) delete process.env.ALLOWED_IMAGE_TYPES
      else process.env.ALLOWED_IMAGE_TYPES = previous
    }
  })

  it('deletes a stored object and stops it resolving', async () => {
    const stored = await storage.putListingImage(listingId, pngBytes())
    await storage.remove(stored.objectKey)
    await expect(readStoredObject(stored.objectKey)).rejects.toThrow()
  })

  it('removes several objects at once', async () => {
    const keys = await Promise.all([
      storage.putListingImage(listingId, pngBytes()),
      storage.putListingImage(listingId, jpegBytes()),
      storage.putListingImage(listingId, webpBytes())
    ])
    await storage.removeMany(keys.map(entry => entry.objectKey))
    for (const key of keys) {
      await expect(readStoredObject(key.objectKey)).rejects.toThrow()
    }
  })

  it('survives a service restart pointing at the same bucket', async () => {
    const stored = await storage.putListingImage(listingId, jpegBytes())
    // A second instance stands in for a later process or a redeploy.
    const afterRestart = storageServiceForTest()
    expect((await readStoredObject(stored.objectKey)).equals(jpegBytes())).toBe(true)
    await afterRestart.remove(stored.objectKey)
  })

  it('never returns credentials to a caller', async () => {
    const stored = await storage.putListingImage(listingId, pngBytes())
    const config = testStorageConfig()
    const serialized = JSON.stringify(stored)
    expect(serialized).not.toContain(config.secretAccessKey)
    expect(serialized).not.toContain(config.accessKeyId)
  })

  it('reports not-configured rather than throwing at construction', () => {
    const previous = process.env.S3_BUCKET
    delete process.env.S3_BUCKET
    try {
      expect(new StorageService().isConfigured()).toBe(false)
    } finally {
      if (previous !== undefined) process.env.S3_BUCKET = previous
    }
  })

  it('serves the object from the bucket the client was configured with', async () => {
    const stored = await storage.putListingImage(listingId, pngBytes())
    const objects = await rawS3Client().send(
      new (await import('@aws-sdk/client-s3')).ListObjectsV2Command({
        Bucket: testStorageConfig().bucket,
        Prefix: `listings/${listingId}/`
      })
    )
    expect(objects.Contents?.some(entry => entry.Key === stored.objectKey)).toBe(true)
  })
})