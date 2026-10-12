import { PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'

const DEFAULT_TYPES = 'image/jpeg,image/png,image/webp'
const LISTING_IMAGE_UPLOAD = /^\/api\/v1\/listings\/[0-9a-f-]{36}\/images$/i
const DEFAULT_MAX_MB = 5

export function allowedImageTypes(raw = process.env.ALLOWED_IMAGE_TYPES) {
  const source = raw?.trim() ? raw : DEFAULT_TYPES
  return source.split(',').map(value => value.trim().toLowerCase()).filter(Boolean)
}

export function maxUploadBytes(raw = process.env.MAX_UPLOAD_SIZE_MB) {
  const parsed = Number(raw)
  const megabytes = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_MB
  return megabytes * 1024 * 1024
}

/** Gate for a future image upload route. No upload route is mounted in this release. */
export function assertImageUpload(file: { mimetype?: string; size?: number }) {
  const type = file.mimetype?.toLowerCase() ?? ''
  if (!allowedImageTypes().includes(type)) {
    throw new UnsupportedMediaTypeException('Only JPEG, PNG, and WebP images are accepted')
  }
  if (!file.size || file.size < 1 || file.size > maxUploadBytes()) {
    throw new PayloadTooLargeException('Image exceeds the upload size limit')
  }
}

/**
 * Multipart is accepted only for the listing image upload route. Every other
 * route still refuses it, so the JSON body parser limits and the upload
 * path limits cannot be bypassed by posting a file to an unrelated endpoint.
 */
export function allowMultipartForListingImages(req: Request, res: Response, next: NextFunction) {
  const header = req.headers['content-type']
  const type = Array.isArray(header) ? header.join(';') : header
  if (!type?.toLowerCase().includes('multipart/form-data')) return next()

  const path = (req.originalUrl ?? req.url ?? '').split('?')[0]
  if (req.method !== 'POST' || !LISTING_IMAGE_UPLOAD.test(path)) {
    res.status(415).json({
      statusCode: 415,
      message: 'File uploads are only accepted for listing images',
      error: 'Unsupported Media Type'
    })
    return
  }
  next()
}
