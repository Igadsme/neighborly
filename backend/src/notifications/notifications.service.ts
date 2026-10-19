import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'

const notificationFields = {
  id: true,
  type: true,
  title: true,
  body: true,
  data: true,
  readAt: true,
  createdAt: true,
} as const

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: notificationFields,
    })
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    })
    return { count }
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { userId: true, readAt: true },
    })
    if (!notification) throw new NotFoundException('Notification not found')
    if (notification.userId !== userId) throw new ForbiddenException()
    if (notification.readAt) {
      return this.prisma.notification.findUniqueOrThrow({
        where: { id: notificationId },
        select: notificationFields,
      })
    }
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: new Date() },
      select: notificationFields,
    })
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    })
    return { updated: result.count }
  }

  createInTransaction(
    tx: Prisma.TransactionClient,
    input: {
      userId: string
      type: string
      title: string
      body: string
      data?: Prisma.InputJsonValue
    },
  ) {
    return tx.notification.create({ data: input })
  }
}
