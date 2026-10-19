import { Test } from '@nestjs/testing'
import { publicUserSelect } from '../common/public-user.select'
import { PrismaService } from '../prisma/prisma.service'
import { MessagingGateway } from './messaging.gateway'
import { MessagingService } from './messaging.service'

describe('MessagingService privacy', () => {
  const prisma = {
    conversation: { findMany: jest.fn() },
    conversationParticipant: { findUnique: jest.fn() },
    message: { findMany: jest.fn() }
  }
  let service: MessagingService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: PrismaService, useValue: prisma },
        { provide: MessagingGateway, useValue: { publishMessage: jest.fn() } }
      ]
    }).compile()
    service = moduleRef.get(MessagingService)
  })

  beforeEach(() => jest.clearAllMocks())

  it('returns the public participant card and redacts a hidden message', async () => {
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: 'thread-1',
        participants: [{ userId: 'user-2', user: { id: 'user-2', email: 'secret@example.com', passwordHash: 'hash' } }],
        messages: [{ id: 'message-1', body: 'secret insult', hiddenAt: new Date(), senderId: 'user-2', conversationId: 'thread-1', createdAt: new Date() }]
      }
    ])

    const [thread] = await service.listConversations('user-1')

    const query = JSON.stringify(prisma.conversation.findMany.mock.calls[0][0])
    expect(query).not.toContain('passwordHash')
    expect(prisma.conversation.findMany.mock.calls[0][0].select.participants.select.user.select).toEqual(publicUserSelect)
    expect(thread.messages[0].body).toBe('This message was removed')
    expect(thread.messages[0]).not.toHaveProperty('hiddenAt')
  })

  it('redacts hidden messages for a participant and still requires membership', async () => {
    prisma.conversationParticipant.findUnique.mockResolvedValue(null)
    await expect(service.listMessages('user-1', 'thread-1')).rejects.toThrow('You are not a participant in this conversation')
    expect(prisma.message.findMany).not.toHaveBeenCalled()

    prisma.conversationParticipant.findUnique.mockResolvedValue({ userId: 'user-1' })
    prisma.message.findMany.mockResolvedValue([
      { id: 'message-1', body: 'kept', hiddenAt: null, senderId: 'user-1', conversationId: 'thread-1', createdAt: new Date() },
      { id: 'message-2', body: 'removed text', hiddenAt: new Date(), senderId: 'user-2', conversationId: 'thread-1', createdAt: new Date() }
    ])
    const rows = await service.listMessages('user-1', 'thread-1')
    expect(rows.map(row => row.body)).toEqual(['kept', 'This message was removed'])
  })
})
