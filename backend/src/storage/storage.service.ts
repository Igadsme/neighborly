import { BadRequestException, Injectable, PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3'
import { allowedImageTypes, maxUploadBytes } from '../common/uploads'

/**
 * Object storage for listing images.
 *
 * Deliberately built on the AWS SDK's S3 client so it speaks to MinIO and
 * to any S3-compatible production store without a second code path. No
 * credential is ever returned to a caller: the browser either receives a
 * short-lived presigned read URL or an API-served redirect.
 */

export interface StoredObject {
  objectKey: string
  contentType: string
  size: number
}

export interface StorageConfig {
  bucket: string
  region: string
  endpoint?: string
  accessKeyId: string
  secretAccessKey: string
  forcePathStyle: boolean
}

/**
 * Reads the S3 settings once. A partially configured set is rejected by
 * env validation, so this either has everything or fails loudly.
 */
export function storageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig | null {
  const endpoint = env.S3_ENDPOINT?.trim()
  const bucket = env.S3_BUCKET?.trim()
  const accessKeyId = env.S3_ACCESS_KEY?.trim()
  const secretAccessKey = env.S3_SECRET_KEY?.trim()
  if (!bucket || !accessKeyId || !secretAccessKey) return null
  return {
    bucket,
    endpoint: endpoint || undefined,
    region: env.S3_REGION?.trim() || 'us-east-1',
    accessKeyId,
    secretAccessKey,
    // MinIO requires path-style addressing; real AWS does not use it.
    forcePathStyle: Boolean(endpoint)
  }
}

/**
 * Magic-number detection. The declared MIME type from a multipart part is
 * attacker-controlled, so the bytes decide. Each signature is checked at a
 * fixed offset and the length is validated before the buffer is read.
 */
const SIGNATURES: Array<{ type: string; offset: number; bytes: number[]; mask?: number[] }> = [
  // JPEG: FF D8 FF
  { type: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  { type: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  // WebP: "RIFF" .... "WEBP"
  { type: 'image/webp', offset: 0, bytes: [0x52, 0x49, 0x46, 0x46] },
  // GIF: "GIF87a" / "GIF89a"
  { type: 'image/gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] }
]

export function detectImageType(buffer: Buffer): string | undefined {
  for (const signature of SIGNATURES) {
    if (buffer.length < signature.offset + signature.bytes.length) continue
    const slice = buffer.subarray(signature.offset, signature.offset + signature.bytes.length)
    if (signature.bytes.every((byte, index) => slice[index] === byte)) {
      if (signature.type === 'image/webp') {
        // RIFF alone is ambiguous; the WEBP tag must follow at offset 8.
        const tag = buffer.subarray(8, 12).toString('ascii')
        if (tag !== 'WEBP') continue
      }
      return signature.type
    }
  }
  return undefined
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

@Injectable()
export class StorageService {
  private cachedClient?: S3Client
  private config: StorageConfig | null = storageConfig()

  isConfigured() {
    return this.config !== null
  }

  /**
   * Validates and stores one image. The listing id is part of the key so a
   * leaked bucket listing cannot be used to enumerate other users' media,
   * and the key is random so a filename is never reflected into storage.
   */
  async putListingImage(listingId: string, buffer: Buffer, declaredType?: string): Promise<StoredObject> {
    const config = this.require()
    const detected = detectImageType(buffer)
    if (!detected) {
      throw new UnsupportedMediaTypeException('That file is not a JPEG, PNG, WebP, or GIF image')
    }
    // The bytes are the authority. A declared type that disagrees is
    // rejected rather than silently trusted, which blocks a renamed .exe.
    if (declaredType && declaredType.toLowerCase().split(';')[0].trim() !== detected) {
      throw new UnsupportedMediaTypeException('File content does not match its declared type')
    }
    if (!allowedImageTypes().includes(detected)) {
      throw new UnsupportedMediaTypeException('That image type is not accepted')
    }
    if (buffer.length < 1) throw new BadRequestException('File is empty')
    if (buffer.length > maxUploadBytes()) throw new PayloadTooLargeException('Image exceeds the upload size limit')

    const objectKey = `listings/${listingId}/${randomUUID()}.${EXTENSIONS[detected] ?? 'bin'}`
    await this.s3().send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        // Never trust a client-supplied content type on the stored object.
        ContentType: detected,
        Body: buffer,
        // Listing media is served to anonymous readers, so it is public-read
        // on the object while the bucket itself stays private.
        ACL: 'public-read'
      })
    )
    return { objectKey, contentType: detected, size: buffer.length }
  }

  /**
   * Stores one dispute or condition photo.
   *
   * Unlike listing media this object is **not** public-read: a condition
   * photo can show the inside of someone's home or damage to their property,
   * so it is only reachable through the authenticated evidence route. The
   * listing id is still part of the key so a leaked bucket listing cannot be
   * used to enumerate another item's evidence, and the filename is random so
   * nothing the client supplied is reflected into storage.
   */
  async putEvidence(listingId: string, buffer: Buffer, declaredType?: string): Promise<StoredObject> {
    const config = this.require()
    const detected = detectImageType(buffer)
    if (!detected) {
      throw new UnsupportedMediaTypeException('That file is not a JPEG, PNG, WebP, or GIF image')
    }
    if (declaredType && declaredType.toLowerCase().split(';')[0].trim() !== detected) {
      throw new UnsupportedMediaTypeException('File content does not match its declared type')
    }
    if (!allowedImageTypes().includes(detected)) {
      throw new UnsupportedMediaTypeException('That image type is not accepted')
    }
    if (buffer.length < 1) throw new BadRequestException('File is empty')
    if (buffer.length > maxUploadBytes()) throw new PayloadTooLargeException('Image exceeds the upload size limit')

    const objectKey = `evidence/${listingId}/${randomUUID()}.${EXTENSIONS[detected] ?? 'bin'}`
    await this.s3().send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        ContentType: detected,
        Body: buffer,
        // Private by design: the evidence route authorizes every read.
        ACL: 'private'
      })
    )
    return { objectKey, contentType: detected, size: buffer.length }
  }

  async remove(objectKey: string) {
    const config = this.require()
    await this.s3().send(new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }))
  }

  async removeMany(objectKeys: string[]) {
    await Promise.all(objectKeys.map(objectKey => this.remove(objectKey)))
  }

  /** Reads an object back for the media route. Returns undefined if absent. */
  async get(objectKey: string): Promise<{ body: Buffer; contentType: string } | undefined> {
    const config = this.require()
    const result = await this.s3()
      .send(new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }))
      .catch(() => undefined)
    if (!result?.Body) return undefined
    const bytes = await result.Body.transformToByteArray()
    return {
      body: Buffer.from(bytes),
      contentType: result.ContentType ?? 'application/octet-stream'
    }
  }

  async exists() {
    const config = this.require()
    await this.s3().send(new HeadBucketCommand({ Bucket: config.bucket }))
    return true
  }

  private s3(): S3Client {
    const config = this.require()
    this.cachedClient ??= new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: config.forcePathStyle,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
    })
    return this.cachedClient
  }

  private require() {
    if (!this.config) {
      throw new BadRequestException(
        'Image storage is not configured on this deployment. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, and S3_SECRET_KEY.'
      )
    }
    return this.config
  }

}

export { GetObjectCommand }