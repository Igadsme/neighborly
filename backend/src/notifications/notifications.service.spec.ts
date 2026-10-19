import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { NotificationsService } from './notifications.service'

describe('NotificationsService', () => {
  const notification = {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  }
  const service = new NotificationsService(
    { notification } as unknown as PrismaService,
  )

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('lists only the requesting user’s latest notifications', async () => {
    notification.findMany.mockResolvedValue([])
    await service.list('user-1')
    expect(notification.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        data: true,
        readAt: true,
        createdAt: true,
      },
    })
  })

  it('scopes unread count to the requesting user', async () => {
    notification.count.mockResolvedValue(3)
    await expect(service.unreadCount('user-1')).resolves.toEqual({ count: 3 })
    expect(notification.count).toHaveBeenCalledWith({
      where: { userId: 'user-1', readAt: null },
    })
  })

  it('does not let users mark another user’s notification as read', async () => {
    notification.findUnique.mockResolvedValue({
      id: 'notification-1',
      userId: 'user-2',
      readAt: null,
    })
    await expect(service.markRead('user-1', 'notification-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    expect(notification.update).not.toHaveBeenCalled()
  })

  it('returns not found for an unknown notification', async () => {
    notification.findUnique.mockResolvedValue(null)
    await expect(service.markRead('user-1', 'missing')).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('marks only the requesting user’s unread notifications as read', async () => {
    notification.updateMany.mockResolvedValue({ count: 2 })
    await expect(service.markAllRead('user-1')).resolves.toEqual({ updated: 2 })
    expect(notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', readAt: null },
        data: expect.objectContaining({ readAt: expect.any(Date) }),
      }),
    )
  })
})
