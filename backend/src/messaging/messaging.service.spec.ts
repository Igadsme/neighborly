import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PrismaService } from '../prisma/prisma.service'
import { MessagingGateway } from './messaging.gateway'
import { MessagingService } from './messaging.service'

describe('MessagingService sendMessage', () => {
  const userId = 'user-1'
  const conversationId = 'conversation-1'
  const message = { id: 'message-1', conversationId, senderId: userId, body: 'On my way' }
  const prisma = {
    conversationParticipant: { findUnique: jest.fn(), findMany: jest.fn() },
    blockedUser: { findFirst: jest.fn() },
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
    prisma.conversationParticipant.findMany.mockResolvedValue([])
    prisma.blockedUser.findFirst.mockResolvedValue(null)
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

  it('does not publish when either person has blocked the other', async () => {
    prisma.conversationParticipant.findUnique.mockResolvedValue({ userId, conversationId })
    prisma.conversationParticipant.findMany.mockResolvedValue([{ userId: 'user-2' }])
    prisma.blockedUser.findFirst.mockResolvedValue({ id: 'block-1' })

    await expect(service.sendMessage(userId, conversationId, 'hello')).rejects.toThrow('You cannot interact with this person')
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(realtime.publishMessage).not.toHaveBeenCalled()
  })

  it('does not publish when the sender is not a participant', async () => {
    prisma.conversationParticipant.findUnique.mockResolvedValue(null)

    await expect(service.sendMessage(userId, conversationId, 'hello')).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(realtime.publishMessage).not.toHaveBeenCalled()
  })
})

describe('MessagingService createConversation', () => {
  const callerId = '11111111-1111-4111-8111-111111111111'
  const sellerId = '22222222-2222-4222-8222-222222222222'
  const listingId = '33333333-3333-4333-8333-333333333333'
  const conversationId = '44444444-4444-4444-8444-444444444444'
  const pairwiseWhere = {
    AND: [
      { participants: { some: { userId: callerId } } },
      { participants: { some: { userId: sellerId } } },
      { participants: { every: { userId: { in: [callerId, sellerId] } } } }
    ]
  }
  const prisma = {
    user: { findUnique: jest.fn() },
    listing: { findUnique: jest.fn() },
    conversation: { findFirst: jest.fn(), create: jest.fn() },
    conversationParticipant: { findUnique: jest.fn(), findMany: jest.fn() },
    blockedUser: { findFirst: jest.fn() },
    $transaction: jest.fn()
  }
  const conversationUpdate = jest.fn()
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
    prisma.user.findUnique.mockResolvedValue({ id: sellerId, status: 'ACTIVE', deletedAt: null })
    prisma.listing.findUnique.mockResolvedValue({
      id: listingId,
      sellerId,
      status: 'PUBLISHED',
      deletedAt: null
    })
    prisma.conversation.findFirst.mockResolvedValue(null)
    prisma.conversation.create.mockResolvedValue({ id: conversationId })
    prisma.conversationParticipant.findUnique.mockResolvedValue({ userId: callerId, conversationId })
    prisma.conversationParticipant.findMany.mockResolvedValue([])
    prisma.blockedUser.findFirst.mockResolvedValue(null)
    conversationUpdate.mockResolvedValue({ id: conversationId })
    prisma.$transaction.mockImplementation(async (work: (tx: {
      conversation: { findFirst: typeof prisma.conversation.findFirst; create: typeof prisma.conversation.create; update: typeof conversationUpdate }
      message: { create: (args: { data: { body: string; conversationId: string; senderId: string } }) => Promise<unknown> }
    }) => Promise<unknown>) => work({
      conversation: {
        findFirst: prisma.conversation.findFirst,
        create: prisma.conversation.create,
        update: conversationUpdate
      },
      message: {
        create: async args => ({
          id: 'message-1',
          conversationId: args.data.conversationId,
          senderId: args.data.senderId,
          body: args.data.body
        })
      }
    }))
  })

  it('creates a pairwise conversation and persists the trimmed first message', async () => {
    const result = await service.createConversation(callerId, {
      participantId: sellerId,
      listingId,
      body: '  Is this still available?  '
    })

    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({ where: pairwiseWhere, orderBy: { updatedAt: 'desc' } })
    expect(prisma.conversation.create).toHaveBeenCalledTimes(1)
    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: { participants: { create: [{ userId: callerId }, { userId: sellerId }] } }
    })
    expect(conversationUpdate).toHaveBeenCalledWith({
      where: { id: conversationId },
      data: { updatedAt: expect.any(Date) }
    })
    expect(result).toEqual({
      conversation: { id: conversationId },
      message: {
        id: 'message-1',
        conversationId,
        senderId: callerId,
        body: 'Is this still available?'
      },
      reused: false
    })
    expect(realtime.publishMessage).toHaveBeenCalledWith(conversationId, result.message)
  })

  it('reuses an existing pairwise conversation and does not create a second one', async () => {
    prisma.conversation.findFirst.mockResolvedValue({ id: 'existing-conversation' })

    const result = await service.createConversation(callerId, {
      participantId: sellerId,
      listingId,
      body: 'Hello again'
    })

    expect(prisma.conversation.create).not.toHaveBeenCalled()
    expect(result.conversation).toEqual({ id: 'existing-conversation' })
    expect(result.reused).toBe(true)
    expect(result.message).toMatchObject({ conversationId: 'existing-conversation', body: 'Hello again' })
    expect(realtime.publishMessage).toHaveBeenCalledTimes(1)
  })

  it('reuses a pairwise conversation found inside the create transaction', async () => {
    prisma.conversation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'raced-conversation' })

    const result = await service.createConversation(callerId, {
      participantId: sellerId,
      body: 'Still there?'
    })

    expect(prisma.listing.findUnique).not.toHaveBeenCalled()
    expect(prisma.conversation.create).not.toHaveBeenCalled()
    expect(result.reused).toBe(true)
    expect(result.conversation.id).toBe('raced-conversation')
  })

  it('rejects a message to yourself', async () => {
    await expect(service.createConversation(callerId, { participantId: callerId, body: 'hi' })).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.createConversation(callerId, { participantId: callerId, body: 'hi' })).rejects.toThrow('You cannot message yourself')
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(prisma.conversation.create).not.toHaveBeenCalled()
    expect(realtime.publishMessage).not.toHaveBeenCalled()
  })

  it('rejects a missing, deleted, or unmessageable user', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null)
    await expect(service.createConversation(callerId, { participantId: sellerId, body: 'hi' })).rejects.toBeInstanceOf(NotFoundException)

    prisma.user.findUnique.mockResolvedValueOnce({ id: sellerId, status: 'DELETED', deletedAt: null })
    await expect(service.createConversation(callerId, { participantId: sellerId, body: 'hi' })).rejects.toThrow('User not found')

    prisma.user.findUnique.mockResolvedValueOnce({ id: sellerId, status: 'ACTIVE', deletedAt: new Date() })
    await expect(service.createConversation(callerId, { participantId: sellerId, body: 'hi' })).rejects.toThrow('User not found')

    prisma.user.findUnique.mockResolvedValueOnce({ id: sellerId, status: 'SUSPENDED', deletedAt: null })
    await expect(service.createConversation(callerId, { participantId: sellerId, body: 'hi' })).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.conversation.create).not.toHaveBeenCalled()
  })

  it('rejects a missing, deleted, draft, or mismatched listing', async () => {
    prisma.listing.findUnique.mockResolvedValueOnce(null)
    await expect(service.createConversation(callerId, { participantId: sellerId, listingId, body: 'hi' })).rejects.toThrow('Listing not found')

    prisma.listing.findUnique.mockResolvedValueOnce({ id: listingId, sellerId, status: 'DELETED', deletedAt: null })
    await expect(service.createConversation(callerId, { participantId: sellerId, listingId, body: 'hi' })).rejects.toBeInstanceOf(NotFoundException)

    prisma.listing.findUnique.mockResolvedValueOnce({ id: listingId, sellerId, status: 'PUBLISHED', deletedAt: new Date() })
    await expect(service.createConversation(callerId, { participantId: sellerId, listingId, body: 'hi' })).rejects.toThrow('Listing not found')

    prisma.listing.findUnique.mockResolvedValueOnce({ id: listingId, sellerId, status: 'DRAFT', deletedAt: null })
    await expect(service.createConversation(callerId, { participantId: sellerId, listingId, body: 'hi' })).rejects.toThrow('This listing is not available')

    prisma.listing.findUnique.mockResolvedValueOnce({ id: listingId, sellerId: callerId, status: 'PUBLISHED', deletedAt: null })
    await expect(service.createConversation(callerId, { participantId: sellerId, listingId, body: 'hi' })).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.conversation.create).not.toHaveBeenCalled()
    expect(realtime.publishMessage).not.toHaveBeenCalled()
  })

  it('allows a sold listing when the other user is its seller', async () => {
    prisma.listing.findUnique.mockResolvedValue({ id: listingId, sellerId, status: 'SOLD', deletedAt: null })

    const result = await service.createConversation(callerId, { participantId: sellerId, listingId, body: 'Is pickup still ok?' })

    expect(result.reused).toBe(false)
    expect(result.message.body).toBe('Is pickup still ok?')
  })
})
