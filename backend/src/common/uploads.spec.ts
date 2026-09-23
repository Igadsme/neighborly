import { PayloadTooLargeException, UnsupportedMediaTypeException } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { assertImageUpload, rejectMultipart } from './uploads'

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
    const next = jest.fn() as NextFunction
    rejectMultipart({ headers: { 'content-type': 'multipart/form-data; boundary=abc' } } as Request, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 415, message: 'File uploads are not accepted' }))

    const pass = jest.fn()
    rejectMultipart({ headers: { 'content-type': 'application/json' } } as Request, res, pass)
    expect(pass).toHaveBeenCalled()
  })
})
