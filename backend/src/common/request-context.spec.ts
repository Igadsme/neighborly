import type { NextFunction, Request, Response } from 'express'
import { requestContextMiddleware } from './request-context'
import { currentRequestId } from './logger'

describe('requestContextMiddleware', () => {
  it('keeps a safe inbound id and logs the path without the query string', () => {
    const lines: string[] = []
    const log = jest.spyOn(console, 'log').mockImplementation(line => {
      lines.push(String(line))
    })
    const headers: Record<string, string> = {}
    let finish: () => void = () => undefined
    const req = {
      headers: { 'x-request-id': 'req-1234.safe' },
      method: 'GET',
      originalUrl: '/api/v1/health?token=secret',
      url: '/api/v1/health?token=secret'
    } as unknown as Request
    const res = {
      setHeader: (name: string, value: string) => {
        headers[name] = value
      },
      on: (_event: string, listener: () => void) => {
        finish = listener
      },
      statusCode: 200
    } as unknown as Response
    let seen = ''
    const next = (() => {
      seen = currentRequestId() ?? ''
    }) as NextFunction

    requestContextMiddleware(req, res, next)
    finish()

    expect(headers['x-request-id']).toBe('req-1234.safe')
    expect(seen).toBe('req-1234.safe')
    expect(lines[0]).toContain('"path":"/api/v1/health"')
    expect(lines[0]).not.toContain('token=secret')
    log.mockRestore()
  })

  it('replaces a short or odd inbound id', () => {
    const headers: Record<string, string> = {}
    const req = { headers: { 'x-request-id': 'no' }, method: 'GET', originalUrl: '/api/v1/health', url: '/api/v1/health' } as unknown as Request
    const res = {
      setHeader: (name: string, value: string) => {
        headers[name] = value
      },
      on: () => undefined,
      statusCode: 200
    } as unknown as Response
    requestContextMiddleware(req, res, (() => undefined) as NextFunction)
    expect(headers['x-request-id']).not.toBe('no')
    expect(headers['x-request-id']?.length).toBeGreaterThan(8)
  })
})
