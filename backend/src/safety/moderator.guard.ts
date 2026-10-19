import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuthenticatedRequest } from '../auth/auth.types'

@Injectable()
export class ModeratorGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const user = await this.prisma.user.findUnique({
      where: { id: request.user.id },
      select: { role: true, status: true },
    })
    if (!user || user.status !== 'ACTIVE' || !['MODERATOR', 'ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Moderator access required')
    }
    return true
  }
}
