import { ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/** Either person blocking the other stops the interaction. */
export async function assertNotBlocked(prisma: PrismaService, actorId: string, otherUserId: string) {
  if (!otherUserId || actorId === otherUserId) return
  const row = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { blockerId: actorId, blockedId: otherUserId },
        { blockerId: otherUserId, blockedId: actorId }
      ]
    },
    select: { id: true }
  })
  if (row) throw new ForbiddenException('You cannot interact with this person')
}
