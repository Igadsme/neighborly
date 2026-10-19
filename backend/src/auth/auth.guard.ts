import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { readAccessToken } from './access-token'
import { accountSelect, isActiveAccount } from './account'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string }
      user?: { id: string; email: string }
    }>()
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
    if (!token) throw new UnauthorizedException('Bearer token required')

    try {
      const claims = readAccessToken(this.jwt, token)
      const account = await this.prisma.user.findUnique({ where: { id: claims.sub }, select: accountSelect })
      if (!isActiveAccount(account)) throw new UnauthorizedException('Account is not active')
      request.user = { id: claims.sub, email: claims.email }
      return true
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error
      throw new UnauthorizedException('Invalid or expired access token')
    }
  }
}
