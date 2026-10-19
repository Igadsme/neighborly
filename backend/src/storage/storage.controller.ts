import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Res } from '@nestjs/common'
import type { Response } from 'express'
import { StorageService } from './storage.service'

/**
 * Serves stored listing images.
 *
 * The browser never receives storage credentials and never talks to the
 * object store directly. This route streams the object from a private bucket
 * and returns a long cache lifetime, because an image key is immutable:
 * deleting and re-uploading produces a new random key rather than reusing
 * one, so a cached response can never show a stale photo.
 */
@Controller('media')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get(':kind/:listingId/:file')
  async read(
    @Param('kind') kind: string,
    @Param('listingId', ParseUUIDPipe) listingId: string,
    @Param('file') file: string,
    @Res() response: Response
  ) {
    if (kind !== 'listings') throw new NotFoundException('Not found')
    // listingId is already a UUID from ParseUUIDPipe. The file name is still
    // checked here so `..` or an encoded slash cannot walk out of the prefix.
    if (!/^[0-9A-Za-z-]+\.(jpg|png|webp|gif)$/.test(file)) throw new NotFoundException('Not found')

    const objectKey = `listings/${listingId}/${file}`
    const body = await this.storage.get(objectKey).catch(() => undefined)
    if (!body) throw new NotFoundException('Not found')

    response.setHeader('Content-Type', body.contentType)
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.end(body.body)
  }
}