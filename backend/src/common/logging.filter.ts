import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { captureException } from './logger'

type HeaderResponse = { setHeader?: (name: string, value: string) => void }

/** Copies `retryAfter` from a 429 body onto the Retry-After response header. */
export function applyRetryAfterHeader(exception: unknown, response: HeaderResponse) {
  if (!(exception instanceof HttpException) || exception.getStatus() !== HttpStatus.TOO_MANY_REQUESTS) return
  if (typeof response.setHeader !== 'function') return
  const body = exception.getResponse()
  if (typeof body !== 'object' || body === null || !('retryAfter' in body)) return
  const retryAfter = Number((body as { retryAfter: unknown }).retryAfter)
  if (!Number.isFinite(retryAfter) || retryAfter <= 0) return
  response.setHeader('Retry-After', String(Math.max(1, Math.ceil(retryAfter))))
}

@Catch()
export class LoggingExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') return
    const http = host.switchToHttp()
    applyRetryAfterHeader(exception, http.getResponse<HeaderResponse>())
    const status = exception instanceof HttpException ? exception.getStatus() : 500
    if (status >= 500) {
      const request = http.getRequest<{ originalUrl?: string; method?: string }>()
      captureException(exception, { method: request.method, path: request.originalUrl?.split('?')[0] })
    }
    super.catch(exception, host)
  }
}
