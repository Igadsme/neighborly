import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { TransactionStatus, OfferStatus } from '@prisma/client'
import { OutboxWriter } from '../events/outbox-writer'
import { RequestsService } from './requests.service'
import { PrismaService } from '../prisma/prisma.service'
import { createOfferFixture, createTestPrisma, INTEGRATION_IDS } from '../common/testing/integration-fixtures'

describe('Offer acceptance against real PostgreSQL', () => {
  let prisma: PrismaService
  let service: RequestsService

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
    service = new RequestsService(prisma, new OutboxWriter(prisma))
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  it('accepts a single valid offer and creates exactly one exchange', async () => {
    const offer = await createOfferFixture(prisma)
    const result = await service.acceptOffer(INTEGRATION_IDS.requester, offer.id, INTEGRATION_IDS.request)

    expect(result.transaction.offerId).toBe(offer.id)
    expect(result.transaction.status).toBe(TransactionStatus.ACCEPTED)
    expect(result.conversation.id).toBe(result.transaction.conversationId)

    const reloaded = await prisma.requestOffer.findUniqueOrThrow({ where: { id: offer.id } })
    expect(reloaded.status).toBe(OfferStatus.ACCEPTED)

    const exchanges = await prisma.transaction.findMany({ where: { offerId: offer.id } })
    expect(exchanges).toHaveLength(1)
  })

  it('rejects a duplicate acceptance with a conflict', async () => {
    const offer = await createOfferFixture(prisma, '60000000-0000-4000-8000-000000000002')
    await service.acceptOffer(INTEGRATION_IDS.requester, offer.id)

    await expect(service.acceptOffer(INTEGRATION_IDS.requester, offer.id)).rejects.toThrow(
      'Offer is no longer acceptable'
    )
    const exchanges = await prisma.transaction.findMany({ where: { offerId: offer.id } })
    expect(exchanges).toHaveLength(1)
  })

  it('produces exactly one successful exchange from two concurrent accepts', async () => {
    const offer = await createOfferFixture(prisma, '60000000-0000-4000-8000-000000000003')
    const attempts = await Promise.allSettled([
      service.acceptOffer(INTEGRATION_IDS.requester, offer.id),
      service.acceptOffer(INTEGRATION_IDS.requester, offer.id)
    ])

    const fulfilled = attempts.filter(outcome => outcome.status === 'fulfilled')
    const rejected = attempts.filter(outcome => outcome.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(BadRequestException)

    const exchanges = await prisma.transaction.findMany({ where: { offerId: offer.id } })
    expect(exchanges).toHaveLength(1)
    const reloaded = await prisma.requestOffer.findUniqueOrThrow({ where: { id: offer.id } })
    expect(reloaded.status).toBe(OfferStatus.ACCEPTED)
  })

  it('rejects acceptance by anyone other than the requester', async () => {
    const offer = await createOfferFixture(prisma, '60000000-0000-4000-8000-000000000004')
    await expect(service.acceptOffer(INTEGRATION_IDS.offerer, offer.id)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.acceptOffer(INTEGRATION_IDS.outsider, offer.id)).rejects.toBeInstanceOf(ForbiddenException)
    const reloaded = await prisma.requestOffer.findUniqueOrThrow({ where: { id: offer.id } })
    expect(reloaded.status).toBe(OfferStatus.PENDING)
  })

  it('rejects acceptance of a terminal offer', async () => {
    const offer = await createOfferFixture(prisma, '60000000-0000-4000-8000-000000000005')
    await prisma.requestOffer.update({ where: { id: offer.id }, data: { status: OfferStatus.ACCEPTED } })
    await expect(service.acceptOffer(INTEGRATION_IDS.requester, offer.id)).rejects.toThrow(
      'Offer is no longer acceptable'
    )
  })

  it('enforces the unique Transaction.offerId constraint at the database level', async () => {
    const offer = await createOfferFixture(prisma, '60000000-0000-4000-8000-000000000006')
    const { conversation, transaction } = await service.acceptOffer(INTEGRATION_IDS.requester, offer.id)

    const duplicate = prisma.transaction.create({
      data: {
        offerId: offer.id,
        conversationId: conversation.id,
        status: TransactionStatus.ACCEPTED,
        participants: {
          create: [
            { userId: INTEGRATION_IDS.requester, role: 'REQUESTER' },
            { userId: INTEGRATION_IDS.offerer, role: 'OFFERER' }
          ]
        }
      }
    })
    await expect(duplicate).rejects.toMatchObject({ code: 'P2002' })
    expect(transaction.id).toBeTruthy()
  })

  it('rolls back the offer claim when the exchange write fails', async () => {
    const offer = await createOfferFixture(prisma, '60000000-0000-4000-8000-000000000007')

    await expect(
      prisma.$transaction(async tx => {
        const claimed = await tx.requestOffer.updateMany({
          where: { id: offer.id, status: { in: [OfferStatus.PENDING, OfferStatus.COUNTERED] } },
          data: { status: OfferStatus.ACCEPTED }
        })
        expect(claimed.count).toBe(1)
        throw new Error('simulated failure after the claim')
      })
    ).rejects.toThrow('simulated failure after the claim')

    const reloaded = await prisma.requestOffer.findUniqueOrThrow({ where: { id: offer.id } })
    expect(reloaded.status).toBe(OfferStatus.PENDING)
    const exchanges = await prisma.transaction.findMany({ where: { offerId: offer.id } })
    expect(exchanges).toHaveLength(0)
  })

  it('rejects an offer that belongs to a different request', async () => {
    const offer = await createOfferFixture(prisma, '60000000-0000-4000-8000-000000000008')
    await expect(
      service.acceptOffer(INTEGRATION_IDS.requester, offer.id, '70000000-0000-4000-8000-000000000001')
    ).rejects.toThrow('Offer not found')
  })

  it('counters while the offer is negotiable and stops once accepted', async () => {
    const offer = await createOfferFixture(prisma, '60000000-0000-4000-8000-000000000009')
    await service.counterOffer(INTEGRATION_IDS.offerer, offer.id, { message: 'Can you do $35?' })
    await service.counterOffer(INTEGRATION_IDS.requester, offer.id, { message: 'Deal at $35?' })
    let counters = await prisma.counterOffer.findMany({ where: { offerId: offer.id } })
    expect(counters).toHaveLength(2)

    await service.acceptOffer(INTEGRATION_IDS.requester, offer.id)
    await expect(
      service.counterOffer(INTEGRATION_IDS.offerer, offer.id, { message: 'Too late' })
    ).rejects.toThrow('Offer is no longer negotiable')
    counters = await prisma.counterOffer.findMany({ where: { offerId: offer.id } })
    expect(counters).toHaveLength(2)

    const reloaded = await prisma.requestOffer.findUniqueOrThrow({ where: { id: offer.id } })
    expect(reloaded.status).toBe(OfferStatus.ACCEPTED)
  })
})
