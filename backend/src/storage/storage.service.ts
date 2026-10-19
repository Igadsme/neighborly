import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutBucketPolicyCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { randomUUID } from 'node:crypto'

export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_MULTIPART_BODY_BYTES = MAX_IMAGE_SIZE_BYTES + 64 * 1024
export const MAX_LISTING_IMAGES = 5
export const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const

@Injectable()
export class StorageService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name)
  private client?: S3Client

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    if (this.config.get<boolean>('S3_AUTO_CREATE_BUCKET') !== true) return
    const { client, bucket } = this.configuration()
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }))
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: bucket }))
      this.logger.log(`Created local object-storage bucket ${bucket}`)
    }
    await client.send(new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [{
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'HEAD', 'POST'],
          AllowedOrigins: this.config.get<string>('CORS_ORIGIN')
            ?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3600,
        }],
      },
    }))
    await client.send(new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{
          Sid: 'PublicReadPublishedListingImages',
          Effect: 'Allow',
          Principal: '*',
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucket}/listings/*`],
        }],
      }),
    }))
  }

  async createImageUpload(userId: string, listingId: string, contentType: string) {
    const extension =
      ALLOWED_IMAGE_TYPES[contentType as keyof typeof ALLOWED_IMAGE_TYPES]
    if (!extension) throw new BadRequestException('Unsupported image type')

    const { client, bucket } = this.configuration()
    const key = `listings/${userId}/${listingId}/${randomUUID()}.${extension}`
    const post = await createPresignedPost(client, {
      Bucket: bucket,
      Key: key,
      Expires: 300,
      Fields: { 'Content-Type': contentType },
      Conditions: [
        ['content-length-range', 1, MAX_MULTIPART_BODY_BYTES],
        ['eq', '$Content-Type', contentType],
      ],
    })
    return { ...post, key, maxSizeBytes: MAX_IMAGE_SIZE_BYTES }
  }

  async verifyImage(key: string, contentType: string) {
    const { client, bucket } = this.configuration()
    const result = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    )
    if (
      result.ContentLength === undefined ||
      result.ContentLength < 1 ||
      result.ContentLength > MAX_IMAGE_SIZE_BYTES ||
      result.ContentType !== contentType ||
      !Object.prototype.hasOwnProperty.call(ALLOWED_IMAGE_TYPES, contentType)
    ) {
      throw new BadRequestException('Uploaded image metadata is invalid')
    }
    const headerResponse = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      Range: 'bytes=0-11',
    }))
    const header = await headerResponse.Body?.transformToByteArray()
    const hasBytes = (expected: number[], offset = 0) =>
      expected.every((byte, index) => header?.[offset + index] === byte)
    const validSignature = contentType === 'image/jpeg'
      ? hasBytes([0xff, 0xd8, 0xff])
      : contentType === 'image/png'
        ? hasBytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        : hasBytes([0x52, 0x49, 0x46, 0x46]) &&
          hasBytes([0x57, 0x45, 0x42, 0x50], 8)
    if (!validSignature) {
      throw new BadRequestException('File content does not match the declared image type')
    }
    return { sizeBytes: result.ContentLength, contentType: result.ContentType }
  }

  async deleteImage(key: string) {
    const { client, bucket } = this.configuration()
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
  }

  onModuleDestroy() {
    this.client?.destroy()
  }

  publicImageUrl(key: string) {
    const base = this.config.get<string>('S3_PUBLIC_URL')?.replace(/\/+$/, '')
    return base
      ? `${base}/${key.split('/').map(encodeURIComponent).join('/')}`
      : null
  }

  private configuration() {
    const endpoint = this.config.get<string>('S3_ENDPOINT')
    const bucket = this.config.get<string>('S3_BUCKET')
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY')
    const secretAccessKey = this.config.get<string>('S3_SECRET_KEY')
    const publicUrl = this.config.get<string>('S3_PUBLIC_URL')
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !publicUrl) {
      throw new ServiceUnavailableException(
        'S3-compatible image storage and its public image URL are not configured',
      )
    }
    this.client ??= new S3Client({
      endpoint,
      region: this.config.get<string>('S3_REGION') || 'us-east-1',
      forcePathStyle: this.config.get<boolean>('S3_FORCE_PATH_STYLE') ?? true,
      credentials: { accessKeyId, secretAccessKey },
    })
    return { client: this.client, bucket }
  }
}
