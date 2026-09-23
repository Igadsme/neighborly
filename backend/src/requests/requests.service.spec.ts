import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { OfferStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { RequestsService } from './requests.service'

type StoredOffer = {
  id: string
  requestId: string
  offererId: string
  status: OfferStatus
  request: { id: string; requesterId: string }
}

describe('RequestsService accept path', () => {
  const requesterId = 'requester-1'
  const offererId = 'offerer-1'
  const requestId = 'request-1'
  const offerId = 'offer-1'

  function createStore(status: OfferStatus) {
    const state: {
      offers: StoredOffer[]
      conversations: Array<{ id: string; participantIds: string[] }>
      transactions: Array<{ id: string; offerId: string; conversationId: string; status: string; participantIds: string[]; roles: string[] }>
      milestones: Array<{ transactionId: string; toStatus: string; fromStatus?: string }>
    } = {
      offers: [{ id: offerId, requestId, offererId, status, request: { id: requestId, requesterId } }],
      conversations: [],
      transactions: [],
      milestones: []
    }
    let sequence = 0
    const nextId = (prefix: string) => `${prefix}-${++sequence}`
    const client = {
      requestOffer: {
        findUnique: async ({ where }: { where: { id: string } }) => state.offers.find(offer => offer.id === where.id) ?? null,
        update: async ({ where, data }: { where: { id: string }; data: { status: OfferStatus } }) => {
          const offer = state.offers.find(row => row.id === where.id)
          if (!offer) return null
          offer.status = data.status
          return offer
        }
      },
      conversation: {
        create: async ({ data }: { data: { participants: { create: Array<{ userId: string }> } } }) => {
          const conversation = { id: nextId('conversation'), participantIds: data.participants.create.map(row => row.userId) }
          state.conversations.push(conversation)
          return conversation
        }
      },
      transaction: {
        create: async ({
          data
        }: {
          data: {
            offerId: string
            conversationId: string
            status: string
            participants: { create: Array<{ userId: string; role: string }> }
          }
        }) => {
          const transaction = {
            id: nextId('transaction'),
            offerId: data.offerId,
            conversationId: data.conversationId,
            status: data.status,
            participantIds: data.participants.create.map(row => row.userId),
            roles: data.participants.create.map(row => row.role)
          }
          state.transactions.push(transaction)
          return transaction
        }
      },
      transactionMilestone: {
        create: async ({ data }: { data: { transactionId: string; toStatus: string; fromStatus?: string } }) => {
          state.milestones.push(data)
          return data
        }
      }
    }
    return {
      requestOffer: client.requestOffer,
      $transaction: async (work: (tx: typeof client) => Promise<unknown>) => work(client),
      state
    }
  }

  async function serviceFor(prisma: ReturnType<typeof createStore>) {
    const moduleRef = await Test.createTestingModule({
      providers: [RequestsService, { provide: PrismaService, useValue: prisma }]
    }).compile()
    return moduleRef.get(RequestsService)
  }

  it('creates one conversation, one transaction, and the first milestone when the requester accepts', async () => {
    const prisma = createStore(OfferStatus.PENDING)
    const service = await serviceFor(prisma)

    const result = await service.acceptOffer(requesterId, offerId, requestId)

    expect(prisma.state.offers[0].status).toBe(OfferStatus.ACCEPTED)
    expect(prisma.state.conversations).toHaveLength(1)
    expect(prisma.state.transactions).toHaveLength(1)
    expect(prisma.state.milestones).toHaveLength(1)
    expect(prisma.state.conversations[0].participantIds).toEqual([requesterId, offererId])
    expect(prisma.state.transactions[0]).toMatchObject({
      offerId,
      conversationId: prisma.state.conversations[0].id,
      status: 'ACCEPTED',
      participantIds: [requesterId, offererId],
      roles: ['REQUESTER', 'OFFERER']
    })
    expect(prisma.state.milestones[0]).toEqual({
      transactionId: prisma.state.transactions[0].id,
      toStatus: 'ACCEPTED'
    })
    expect(result.conversation.id).toBe(prisma.state.conversations[0].id)
    expect(result.transaction.conversationId).toBe(result.conversation.id)
    expect(result.transaction.offerId).toBe(offerId)
  })

  it('accepts a countered offer', async () => {
    const prisma = createStore(OfferStatus.COUNTERED)
    const service = await serviceFor(prisma)

    await service.acceptOffer(requesterId, offerId)

    expect(prisma.state.offers[0].status).toBe(OfferStatus.ACCEPTED)
    expect(prisma.state.transactions).toHaveLength(1)
  })

  it('rejects acceptance from anyone other than the requester', async () => {
    const prisma = createStore(OfferStatus.PENDING)
    const service = await serviceFor(prisma)

    await expect(service.acceptOffer(offererId, offerId)).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.state.conversations).toHaveLength(0)
    expect(prisma.state.transactions).toHaveLength(0)
    expect(prisma.state.offers[0].status).toBe(OfferStatus.PENDING)
  })

  it.each([OfferStatus.ACCEPTED, OfferStatus.REJECTED, OfferStatus.WITHDRAWN, OfferStatus.EXPIRED])(
    'rejects an illegal accept transition from %s',
    async status => {
      const prisma = createStore(status)
      const service = await serviceFor(prisma)

      await expect(service.acceptOffer(requesterId, offerId)).rejects.toBeInstanceOf(BadRequestException)
      await expect(service.acceptOffer(requesterId, offerId)).rejects.toThrow('Offer is no longer acceptable')
      expect(prisma.state.conversations).toHaveLength(0)
      expect(prisma.state.transactions).toHaveLength(0)
      expect(prisma.state.milestones).toHaveLength(0)
      expect(prisma.state.offers[0].status).toBe(status)
    }
  )

  it('rejects an offer without opening a conversation', async () => {
    const prisma = createStore(OfferStatus.PENDING)
    const service = await serviceFor(prisma)

    const updated = await service.rejectOffer(requesterId, offerId, requestId)

    expect(updated.status).toBe(OfferStatus.REJECTED)
    expect(prisma.state.conversations).toHaveLength(0)
    expect(prisma.state.transactions).toHaveLength(0)
  })

  it.each([OfferStatus.ACCEPTED, OfferStatus.REJECTED, OfferStatus.WITHDRAWN, OfferStatus.EXPIRED])(
    'rejects an illegal reject transition from %s',
    async status => {
      const prisma = createStore(status)
      const service = await serviceFor(prisma)

      await expect(service.rejectOffer(requesterId, offerId)).rejects.toThrow('Offer is no longer rejectable')
      expect(prisma.state.offers[0].status).toBe(status)
    }
  )

  it('does not accept an offer that belongs to a different request', async () => {
    const prisma = createStore(OfferStatus.PENDING)
    const service = await serviceFor(prisma)

    await expect(service.acceptOffer(requesterId, offerId, 'other-request')).rejects.toBeInstanceOf(NotFoundException)
    expect(prisma.state.transactions).toHaveLength(0)
  })
})

describe('RequestsService public reads', () => {
  const publicRequester = {
    select: {
      id: true,
      profile: {
        select: {
          displayName: true,
          firstName: true,
          neighborhood: true,
          city: true
        }
      }
    }
  }

  it('strips private profile fields from the public request list', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const moduleRef = await Test.createTestingModule({
      providers: [RequestsService, { provide: PrismaService, useValue: { needRequest: { findMany } } }]
    }).compile()
    const service = moduleRef.get(RequestsService)

    await service.list()

    const query = findMany.mock.calls[0][0]
    expect(query.include.requester).toEqual(publicRequester)
    const serialized = JSON.stringify(query)
    expect(serialized).not.toContain('passwordHash')
    expect(serialized).not.toContain('email')
    expect(serialized).not.toContain('latitude')
    expect(serialized).not.toContain('longitude')
    expect(serialized).not.toContain('phoneVerified')
  })

  it('returns a request with offers for compare and a public offerer profile', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'request-1', offers: [] })
    const moduleRef = await Test.createTestingModule({
      providers: [RequestsService, { provide: PrismaService, useValue: { needRequest: { findFirst } } }]
    }).compile()
    const service = moduleRef.get(RequestsService)

    await service.get('request-1')

    const query = findFirst.mock.calls[0][0]
    expect(query.where).toEqual({ id: 'request-1', status: 'PUBLISHED', deletedAt: null })
    expect(query.include.requester).toEqual(publicRequester)
    expect(query.include.offers.include.offerer).toEqual(publicRequester)
    expect(query.include.offers.include.items.include.listing.select).toEqual({
      id: true,
      title: true,
      priceCents: true,
      status: true
    })
    expect(JSON.stringify(query)).not.toContain('passwordHash')
  })

  it('returns 404 when the request is not published', async () => {
    const findFirst = jest.fn().mockResolvedValue(null)
    const moduleRef = await Test.createTestingModule({
      providers: [RequestsService, { provide: PrismaService, useValue: { needRequest: { findFirst } } }]
    }).compile()
    const service = moduleRef.get(RequestsService)

    await expect(service.get('missing')).rejects.toBeInstanceOf(NotFoundException)
  })
})
