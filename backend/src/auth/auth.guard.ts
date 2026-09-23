import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'

interface AccessTokenClaims {
  sub?: string
  email?: string
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string }
      user?: { id: string; email: string }
    }>()
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) throw new UnauthorizedException('Bearer token required')

    try {
      const payload = this.jwt.verify<AccessTokenClaims>(token, { secret: process.env.JWT_SECRET })
      if (!payload || typeof payload === 'string' || !payload.sub || !payload.email) {
        throw new UnauthorizedException('Invalid or expired access token')
      }
      request.user = { id: payload.sub, email: payload.email }
      return true
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error
      throw new UnauthorizedException('Invalid or expired access token')
    }
  }
}
