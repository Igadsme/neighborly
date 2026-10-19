import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import type { NextFunction, Request, Response } from 'express'
import { setRequestIdProvider, writeLog } from './logger'

const store = new AsyncLocalStorage<{ requestId: string }>()

setRequestIdProvider(() => store.getStore()?.requestId)

const incomingId = /^[A-Za-z0-9._-]{8,64}$/

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers['x-request-id']
  const raw = Array.isArray(header) ? header[0] : header
  const requestId = raw && incomingId.test(raw) ? raw : randomUUID()
  res.setHeader('x-request-id', requestId)
  const started = Date.now()
  res.on('finish', () => {
    const path = (req.originalUrl || req.url || '').split('?')[0]
    writeLog('info', 'http.request', {
      requestId,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs: Date.now() - started
    })
  })
  store.run({ requestId }, () => next())
}
