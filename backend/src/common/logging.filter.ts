import { ArgumentsHost, Catch, HttpException } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { captureException } from './logger'

@Catch()
export class LoggingExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') return
    const status = exception instanceof HttpException ? exception.getStatus() : 500
    if (status >= 500) {
      const request = host.switchToHttp().getRequest<{ originalUrl?: string; method?: string }>()
      captureException(exception, { method: request.method, path: request.originalUrl?.split('?')[0] })
    }
    super.catch(exception, host)
  }
}
