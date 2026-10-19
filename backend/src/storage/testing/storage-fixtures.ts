import { UnsupportedMediaTypeException } from '@nestjs/common'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { randomUUID } from 'node:crypto'
import { StorageService, storageConfig } from '../storage.service'

/**
 * Storage tests run only when the runner script provides a disposable MinIO.
 * The helper refuses a non-loopback endpoint for the same reason the
 * database helper does: an integration run must never touch shared infra.
 */
export function testStorageConfig() {
  const endpoint = process.env.NEIGHBORLY_TEST_S3_ENDPOINT
  if (!endpoint) {
    throw new Error(
      'NEIGHBORLY_TEST_S3_ENDPOINT is not set. Run storage tests through scripts/run-storage-tests.sh, which starts a disposable MinIO container.'
    )
  }
  const host = new URL(endpoint).hostname
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(`Refusing to run storage tests against a non-loopback endpoint: ${host}`)
  }
  return {
    endpoint,
    bucket: process.env.NEIGHBORLY_TEST_S3_BUCKET ?? 'neighborly-m4-media',
    accessKeyId: process.env.NEIGHBORLY_TEST_S3_ACCESS_KEY ?? 'neighborly-m4-local',
    secretAccessKey: process.env.NEIGHBORLY_TEST_S3_SECRET_KEY ?? 'neighborly-m4-local-only'
  }
}

export function storageServiceForTest(): StorageService {
  const config = testStorageConfig()
  process.env.S3_ENDPOINT = config.endpoint
  process.env.S3_BUCKET = config.bucket
  process.env.S3_ACCESS_KEY = config.accessKeyId
  process.env.S3_SECRET_KEY = config.secretAccessKey
  const service = new StorageService()
  // Re-read config after the environment is populated.
  Object.assign(service as unknown as Record<string, unknown>, { config: storageConfig() })
  return service
}

export function rawS3Client() {
  const config = testStorageConfig()
  return new S3Client({
    region: 'us-east-1',
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
  })
}

export async function readStoredObject(objectKey: string): Promise<Buffer> {
  const config = testStorageConfig()
  const result = await rawS3Client().send(
    new GetObjectCommand({ Bucket: config.bucket, Key: objectKey })
  )
  const bytes = await result.Body?.transformToByteArray()
  if (!bytes) throw new Error('object body was empty')
  return Buffer.from(bytes)
}

// ---------------------------------------------------------------- test images

/** Smallest valid PNG, built so the bytes are real rather than a stub. */
export function pngBytes(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
  )
}

/** Smallest valid JPEG. */
export function jpegBytes(): Buffer {
  return Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
    'base64'
  )
}

export function webpBytes(): Buffer {
  const head = Buffer.from('RIFF', 'ascii')
  const size = Buffer.alloc(4)
  size.writeUInt32LE(4, 0)
  const tag = Buffer.from('WEBP', 'ascii')
  return Buffer.concat([head, size, tag, Buffer.from([0x56, 0x50, 0x38, 0x20])])
}

export function gifBytes(): Buffer {
  return Buffer.concat([
    Buffer.from('GIF89a', 'ascii'),
    Buffer.from([0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00])
  ])
}

/** A real PDF header: must never be accepted as an image. */
export function pdfBytes(): Buffer {
  return Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.from('1 0 obj\n<<>>\nendobj\n')])
}

/** A PNG signature followed by an executable header. */
export function polyglotBytes(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('MZ\u0090\u0000\u0003\u0000\u0000\u0000\u0000\u0000\u0000\u0000\u0000')
  ])
}

export { UnsupportedMediaTypeException, randomUUID }