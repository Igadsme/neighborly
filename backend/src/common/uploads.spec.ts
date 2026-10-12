import { PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { allowMultipartForListingImages, assertImageUpload } from './uploads'

describe('upload restrictions', () => {
  const previousSize = process.env.MAX_UPLOAD_SIZE_MB
  const previousTypes = process.env.ALLOWED_IMAGE_TYPES

  afterAll(() => {
    if (previousSize === undefined) delete process.env.MAX_UPLOAD_SIZE_MB
    else process.env.MAX_UPLOAD_SIZE_MB = previousSize
    if (previousTypes === undefined) delete process.env.ALLOWED_IMAGE_TYPES
    else process.env.ALLOWED_IMAGE_TYPES = previousTypes
  })

  it('accepts a small jpeg and rejects other types and oversized files', () => {
    process.env.MAX_UPLOAD_SIZE_MB = '1'
    process.env.ALLOWED_IMAGE_TYPES = 'image/jpeg,image/png,image/webp'
    expect(() => assertImageUpload({ mimetype: 'image/jpeg', size: 1024 })).not.toThrow()
    expect(() => assertImageUpload({ mimetype: 'image/svg+xml', size: 1024 })).toThrow(UnsupportedMediaTypeException)
    expect(() => assertImageUpload({ mimetype: 'image/png', size: 2 * 1024 * 1024 })).toThrow(PayloadTooLargeException)
  })

  it('rejects multipart bodies because no upload route is mounted', () => {
    const json = jest.fn()
    const res = { status: jest.fn(() => ({ json })) } as unknown as Response
    const next = jest.fn()
    // Multipart is now accepted, but only on the listing image route.
    allowMultipartForListingImages(
      {
        method: 'POST',
        originalUrl: '/api/v1/listings/11111111-1111-4111-8111-111111111111/images',
        headers: { 'content-type': 'multipart/form-data; boundary=abc' }
      } as Request,
      res,
      next
    )
    expect(next).toHaveBeenCalled()
    expect(json).not.toHaveBeenCalled()

    const denied = jest.fn() as NextFunction
    const deniedJson = jest.fn()
    allowMultipartForListingImages(
      {
        method: 'POST',
        originalUrl: '/api/v1/listings/11111111-1111-4111-8111-111111111111/favorite',
        headers: { 'content-type': 'multipart/form-data; boundary=abc' }
      } as Request,
      { status: jest.fn(() => ({ json: deniedJson })) } as unknown as Response,
      denied
    )
    expect(denied).not.toHaveBeenCalled()
    expect(deniedJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 415,
        message: 'File uploads are only accepted for listing images and dispute evidence'
      })
    )

    // A GET to the upload path is still refused.
    const getDenied = jest.fn() as NextFunction
    allowMultipartForListingImages(
      {
        method: 'GET',
        originalUrl: '/api/v1/listings/11111111-1111-4111-8111-111111111111/images',
        headers: { 'content-type': 'multipart/form-data' }
      } as Request,
      { status: jest.fn(() => ({ json: jest.fn() })) } as unknown as Response,
      getDenied
    )
    expect(getDenied).not.toHaveBeenCalled()

    const pass = jest.fn()
    allowMultipartForListingImages(
      { method: 'POST', originalUrl: '/api/v1/listings', headers: { 'content-type': 'application/json' } } as Request,
      res,
      pass
    )
    expect(pass).toHaveBeenCalled()
  })
})

describe('multipart is allowed on exactly two routes', () => {
  const next = jest.fn()
  function attempt(method: string, originalUrl: string) {
    const json = jest.fn()
    allowMultipartForListingImages(
      { method, originalUrl, headers: { 'content-type': 'multipart/form-data; boundary=abc' } } as Request,
      { status: jest.fn(() => ({ json })) } as unknown as Response,
      next as unknown as NextFunction
    )
    return { nextCalled: next.mock.calls.length > 0, json }
  }

  beforeEach(() => next.mockClear())

  it('accepts a dispute evidence upload', () => {
    const { nextCalled } = attempt(
      'POST',
      '/api/v1/borrow/disputes/11111111-1111-4111-8111-111111111111/evidence'
    )
    expect(nextCalled).toBe(true)
  })

  it('refuses a file posted to an unrelated borrow route', () => {
    const { nextCalled, json } = attempt(
      'POST',
      '/api/v1/borrow/requests/11111111-1111-4111-8111-111111111111/approve'
    )
    expect(nextCalled).toBe(false)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 415 }))
  })

  it('refuses an evidence upload whose id is not a uuid', () => {
    // A broad prefix match would let any string reach the file handler.
    const { nextCalled, json } = attempt('POST', '/api/v1/borrow/disputes/not-a-uuid/evidence')
    expect(nextCalled).toBe(false)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 415 }))
  })

  it('refuses an evidence read, since only the upload route accepts a file', () => {
    const { nextCalled, json } = attempt(
      'GET',
      '/api/v1/borrow/disputes/11111111-1111-4111-8111-111111111111/evidence'
    )
    expect(nextCalled).toBe(false)
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 415 }))
  })
})
