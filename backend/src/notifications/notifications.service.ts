import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { audit } from '../common/logger'
import { PrismaService } from '../prisma/prisma.service'

/** Notification preferences, persisted per member. */
export interface PreferenceUpdate {
  newListings?: boolean
  priceDrops?: boolean
  messages?: boolean
  events?: boolean
  community?: boolean
  offers?: boolean
  matches?: boolean
  savedSearches?: boolean
  requestUpdates?: boolean
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, options: { unreadOnly?: boolean; limit?: number; offset?: number } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100)
    const where = { userId, ...(options.unreadOnly ? { readAt: null } : {}) }
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: options.offset ?? 0
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } })
    ])
    return { items, total, unread, limit, offset: options.offset ?? 0 }
  }

  async unreadCount(userId: string) {
    const [notifications, messages] = await Promise.all([
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.prisma.conversationParticipant.aggregate({
        where: { userId, unreadCount: { gt: 0 } },
        _sum: { unreadCount: true }
      })
    ])
    return { notifications, messages: messages._sum.unreadCount ?? 0 }
  }

  /** Scoped by userId, so one member can never mark another's notification. */
  async markRead(userId: string, id: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() }
    })
    if (result.count === 0) {
      const exists = await this.prisma.notification.findFirst({ where: { id, userId }, select: { id: true } })
      if (!exists) throw new NotFoundException('Notification not found')
    }
    return { read: true }
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() }
    })
    audit('notifications.mark_all_read', { userId, count: result.count })
    return { updated: result.count }
  }

  async preferences(userId: string) {
    const existing = await this.prisma.notificationPreference.findUnique({ where: { userId } })
    if (existing) return existing
    // Materialize defaults on first read so the screen has a row to edit.
    return this.prisma.notificationPreference.create({ data: { userId } })
  }

  async updatePreferences(userId: string, input: PreferenceUpdate) {
    const data: Record<string, unknown> = {}
    for (const key of [
      'newListings',
      'priceDrops',
      'messages',
      'events',
      'community',
      'offers',
      'matches',
      'savedSearches',
      'requestUpdates',
    ] as const) {
      if (input[key] !== undefined) data[key] = input[key]
    }
    if (Object.keys(data).length === 0) throw new BadRequestException('No preferences to update')
    await this.preferences(userId)
    const updated = await this.prisma.notificationPreference.update({ where: { userId }, data })
    audit('notifications.preferences_updated', { userId, fields: Object.keys(data) })
    return updated
  }

  async listSavedSearchAlerts(userId: string, limit = 50) {
    return this.prisma.savedSearchAlert.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            priceCents: true,
            neighborhood: true,
            status: true,
            deletedAt: true
          }
        }
      }
    })
  }

  async markSavedSearchAlertRead(userId: string, id: string) {
    const result = await this.prisma.savedSearchAlert.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() }
    })
    if (result.count === 0) {
      const exists = await this.prisma.savedSearchAlert.findFirst({ where: { id, userId }, select: { id: true } })
      if (!exists) throw new NotFoundException('Alert not found')
    }
    return { read: true }
  }
}
