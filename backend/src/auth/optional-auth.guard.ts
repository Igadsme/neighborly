import { ExecutionContext, Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { PrismaService } from '../prisma/prisma.service'
import { AuthGuard } from './auth.guard'

/**
 * Same validation as AuthGuard, but a missing or invalid token degrades to
 * an anonymous request instead of a 401. Used by public reads that expose
 * additional owner-only fields when a valid token is present.
 */
@Injectable()
export class OptionalAuthGuard extends AuthGuard {
  constructor(jwt: JwtService, prisma: PrismaService) {
    super(jwt, prisma)
  }

  async canActivate(context: ExecutionContext) {
    try {
      return await super.canActivate(context)
    } catch {
      return true
    }
  }
}
