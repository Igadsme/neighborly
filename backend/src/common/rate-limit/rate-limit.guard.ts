import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request, Response } from 'express'
import { RateLimitService } from './rate-limit.service'

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly limits: RateLimitService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (context.getType() !== 'http') return true
    const request = context.switchToHttp().getRequest<Request>()
    const response = context.switchToHttp().getResponse<Response>()
    const path = request.path
    if (path.endsWith('/health') || path.endsWith('/ready') || path.startsWith('/docs')) return true

    const windowMs = this.config.get<number>('RATE_LIMIT_WINDOW_MS') ?? 60_000
    const defaultLimit = this.config.get<number>('RATE_LIMIT_MAX') ?? 300
    const limit = /\/auth\/(login|register|forgot-password|reset-password)$/.test(path)
      ? 10
      : path.endsWith('/auth/refresh')
        ? 60
        : request.method === 'POST' && path.includes('/messages')
          ? 60
          : request.method === 'GET'
            ? defaultLimit
            : Math.min(defaultLimit, 120)
    const forwarded = request.headers['x-forwarded-for']
    const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0])?.trim()
      || request.ip
      || request.socket.remoteAddress
      || 'unknown'
    const routeKey = path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id')
    const count = await this.limits.increment(`neighborly:rate:${ip}:${request.method}:${routeKey}`, windowMs)
    response.setHeader('RateLimit-Limit', String(limit))
    response.setHeader('RateLimit-Remaining', String(Math.max(0, limit - count)))
    response.setHeader('RateLimit-Reset', String(Math.ceil((Date.now() + windowMs) / 1000)))
    if (count > limit) {
      throw new HttpException('Too many requests. Please try again shortly.', HttpStatus.TOO_MANY_REQUESTS)
    }
    return true
  }
}
