import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { TransactionStatus, OfferStatus } from '@prisma/client'
import { OutboxWriter } from '../events/outbox-writer'
import { RequestsService } from './requests.service'
import { PrismaService } from '../prisma/prisma.service'
import {
  createCompetingOffersFixture,
  createOfferFixture,
  createTestPrisma,
  INTEGRATION_IDS
} from '../common/testing/integration-fixtures'

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

/**
 * Regression coverage for a data-integrity defect found in Milestone 11.
 *
 * `acceptOffer` guarded only the offer row. Two different offers on the same
 * request are two independent rows, so accepting both in parallel let each one
 * claim itself: two transactions and two conversations were created for a
 * single request and both offers were left ACCEPTED. The request status update
 * used `updateMany`, so the second acceptance was a silent no-op instead of a
 * failure and nothing reported the duplicate.
 *
 * The existing tests above accept the *same* offer twice, which the per-offer
 * guard does handle. These cover the case it did not.
 */
describe('two different offers racing to be accepted', () => {
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

  it('produces exactly one exchange when two offers are accepted in parallel', async () => {
    const { requestId, first, second } = await createCompetingOffersFixture(prisma)

    const outcomes = await Promise.allSettled([
      service.acceptOffer(INTEGRATION_IDS.requester, first.id, requestId),
      service.acceptOffer(INTEGRATION_IDS.requester, second.id, requestId)
    ])

    const accepted = outcomes.filter(o => o.status === 'fulfilled')
    const refused = outcomes.filter(o => o.status === 'rejected')
    expect(accepted).toHaveLength(1)
    expect(refused).toHaveLength(1)

    // Exactly one transaction may exist for this request's offers. Two would
    // send two counterparties to a handoff for one request.
    const exchanges = await prisma.transaction.findMany({
      where: { offerId: { in: [first.id, second.id] } }
    })
    expect(exchanges).toHaveLength(1)

    // Only the winning offer is ACCEPTED; the loser must never also be marked
    // accepted.
    const reloaded = await prisma.requestOffer.findMany({
      where: { id: { in: [first.id, second.id] } }
    })
    expect(reloaded.filter(o => o.status === OfferStatus.ACCEPTED)).toHaveLength(1)

    // A single conversation: two would duplicate the thread the counterparties
    // use to arrange the handoff.
    const conversationIds = new Set(exchanges.map(e => e.conversationId))
    expect(conversationIds.size).toBe(1)
  })

  it('reports the second acceptance as a failure rather than silently succeeding', async () => {
    const { requestId, first, second } = await createCompetingOffersFixture(
      prisma,
      '50000000-0000-4000-8000-00000000000a',
      '60000000-0000-4000-8000-00000000001a',
      '60000000-0000-4000-8000-00000000001b'
    )

    await service.acceptOffer(INTEGRATION_IDS.requester, first.id, requestId)

    // A later, sequential accept must fail loudly. Before the fix this quietly
    // created a second exchange.
    await expect(service.acceptOffer(INTEGRATION_IDS.requester, second.id, requestId)).rejects.toThrow(
      'already been fulfilled'
    )
    const exchanges = await prisma.transaction.findMany({
      where: { offerId: { in: [first.id, second.id] } }
    })
    expect(exchanges).toHaveLength(1)
  })
})
