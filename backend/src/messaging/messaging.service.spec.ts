import { ForbiddenException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PrismaService } from '../prisma/prisma.service'
import { MessagingGateway } from './messaging.gateway'
import { MessagingService } from './messaging.service'

describe('MessagingService sendMessage', () => {
  const userId = 'user-1'
  const conversationId = 'conversation-1'
  const message = { id: 'message-1', conversationId, senderId: userId, body: 'On my way' }
  const prisma = {
    conversationParticipant: { findUnique: jest.fn() },
    $transaction: jest.fn()
  }
  const realtime = { publishMessage: jest.fn() }
  let service: MessagingService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: PrismaService, useValue: prisma },
        { provide: MessagingGateway, useValue: realtime }
      ]
    }).compile()
    service = moduleRef.get(MessagingService)
  })

  beforeEach(() => {
    jest.clearAllMocks()
    prisma.$transaction.mockImplementation(async (work: (tx: {
      message: { create: () => Promise<typeof message> }
      conversation: { update: () => Promise<unknown> }
    }) => Promise<typeof message>) => work({
      message: { create: async () => message },
      conversation: { update: async () => ({ id: conversationId }) }
    }))
  })

  it('publishes the message only after the sender is confirmed as a participant', async () => {
    prisma.conversationParticipant.findUnique.mockResolvedValue({ userId, conversationId })

    await expect(service.sendMessage(userId, conversationId, '  On my way  ')).resolves.toEqual(message)

    expect(realtime.publishMessage).toHaveBeenCalledTimes(1)
    expect(realtime.publishMessage).toHaveBeenCalledWith(conversationId, message)
  })

  it('does not publish when the sender is not a participant', async () => {
    prisma.conversationParticipant.findUnique.mockResolvedValue(null)

    await expect(service.sendMessage(userId, conversationId, 'hello')).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(realtime.publishMessage).not.toHaveBeenCalled()
  })
})
