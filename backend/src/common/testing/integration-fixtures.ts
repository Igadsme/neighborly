import { PrismaService } from '../../prisma/prisma.service'
import { integrationDatabaseUrl } from './integration-db'

/**
 * Creates a PrismaService bound to the disposable integration
 * database. Must be called before any PrismaClient in this
 * test file is instantiated.
 */
export function createTestPrisma(): PrismaService {
  process.env.DATABASE_URL = integrationDatabaseUrl()
  return new PrismaService()
}

export const INTEGRATION_IDS = {
  requester: '20000000-0000-4000-8000-000000000001',
  offerer: '20000000-0000-4000-8000-000000000002',
  outsider: '20000000-0000-4000-8000-000000000003',
  requesterProfile: '30000000-0000-4000-8000-000000000001',
  offererProfile: '30000000-0000-4000-8000-000000000002',
  outsiderProfile: '30000000-0000-4000-8000-000000000003',
  category: '40000000-0000-4000-8000-000000000001',
  request: '50000000-0000-4000-8000-000000000001',
  offer: '60000000-0000-4000-8000-000000000001',
  // A second requester-facing participant, used to build two competing offers
  // on one request. Accepting both at once must still produce one exchange.
  rivalOfferer: '20000000-0000-4000-8000-000000000004',
  rivalOffererProfile: '30000000-0000-4000-8000-000000000004',
  rivalOffer: '60000000-0000-4000-8000-000000000009',
  rivalRequest: '50000000-0000-4000-8000-000000000009'
}

/** Minimal rows for one requester/offerer pair and a published request with an offer. */
export async function createOfferFixture(prisma: PrismaService, offerId = INTEGRATION_IDS.offer) {
  const { requester, offerer, requesterProfile, offererProfile, category, request } = INTEGRATION_IDS
  await prisma.user.createMany({
    data: [
      { id: requester, email: 'integration-requester@example.com', passwordHash: 'argon2-test' },
      { id: offerer, email: 'integration-offerer@example.com', passwordHash: 'argon2-test' }
    ],
    skipDuplicates: true
  })
  await prisma.profile.createMany({
    data: [
      { id: requesterProfile, userId: requester, firstName: 'Req', lastName: 'Uester' },
      { id: offererProfile, userId: offerer, firstName: 'Off', lastName: 'Erer' }
    ],
    skipDuplicates: true
  })
  await prisma.category.upsert({
    where: { id: category },
    update: {},
    create: { id: category, name: 'Integration Furniture', slug: 'integration-furniture' }
  })
  await prisma.needRequest.upsert({
    where: { id: request },
    // Reset to PUBLISHED on reuse. Accepting an offer now fulfils the request,
    // and the fixture id is shared across cases, so a request left fulfilled by
    // an earlier case would make every later acceptance fail for the wrong
    // reason.
    update: { status: 'PUBLISHED', fulfilledAt: null },
    create: {
      id: request,
      requesterId: requester,
      categoryId: category,
      title: 'Need a desk',
      description: 'Standing desk near Decatur',
      latitude: 33.775,
      longitude: -84.296,
      mode: 'BUY',
      status: 'PUBLISHED'
    }
  })
  return prisma.requestOffer.upsert({
    where: { id: offerId },
    update: {},
    create: {
      id: offerId,
      requestId: request,
      offererId: offerer,
      amountCents: 4000,
      message: 'I can bring it tomorrow.',
      status: 'PENDING'
    }
  })
}

/**
 * Two competing offers from different members on the same published request.
 *
 * `createOfferFixture` always points at one request and one offerer, so it
 * cannot express the case where two different offers race to be accepted. That
 * is the case that exposed a real defect: the accept guard was applied to the
 * offer row, so each of two offers could claim itself.
 */
export async function createCompetingOffersFixture(
  prisma: PrismaService,
  requestId = INTEGRATION_IDS.rivalRequest,
  firstOfferId = '60000000-0000-4000-8000-000000000010',
  secondOfferId = '60000000-0000-4000-8000-000000000011'
) {
  const {
    requester,
    offerer,
    rivalOfferer,
    requesterProfile,
    offererProfile,
    rivalOffererProfile,
    category
  } = INTEGRATION_IDS

  await prisma.user.createMany({
    data: [
      { id: requester, email: 'integration-requester@example.com', passwordHash: 'argon2-test' },
      { id: offerer, email: 'integration-offerer@example.com', passwordHash: 'argon2-test' },
      { id: rivalOfferer, email: 'integration-rival@example.com', passwordHash: 'argon2-test' }
    ],
    skipDuplicates: true
  })
  await prisma.profile.createMany({
    data: [
      { id: requesterProfile, userId: requester, firstName: 'Req', lastName: 'Uester' },
      { id: offererProfile, userId: offerer, firstName: 'Off', lastName: 'Erer' },
      { id: rivalOffererProfile, userId: rivalOfferer, firstName: 'Riv', lastName: 'Aler' }
    ],
    skipDuplicates: true
  })
  await prisma.category.upsert({
    where: { id: category },
    update: {},
    create: { id: category, name: 'Integration Furniture', slug: 'integration-furniture' }
  })
  await prisma.needRequest.upsert({
    where: { id: requestId },
    update: { status: 'PUBLISHED', fulfilledAt: null },
    create: {
      id: requestId,
      requesterId: requester,
      categoryId: category,
      title: 'Need a desk, two sellers interested',
      description: 'Two neighbours are offering a desk; only one can be accepted.',
      latitude: 33.775,
      longitude: -84.296,
      mode: 'BUY',
      status: 'PUBLISHED'
    }
  })

  const [first, second] = await Promise.all([
    prisma.requestOffer.upsert({
      where: { id: firstOfferId },
      update: { status: 'PENDING' },
      create: {
        id: firstOfferId,
        requestId,
        offererId: offerer,
        amountCents: 4000,
        message: 'I can bring the first desk tomorrow.',
        status: 'PENDING'
      }
    }),
    prisma.requestOffer.upsert({
      where: { id: secondOfferId },
      update: { status: 'PENDING' },
      create: {
        id: secondOfferId,
        requestId,
        offererId: rivalOfferer,
        amountCents: 4200,
        message: 'I can bring a second desk on Saturday.',
        status: 'PENDING'
      }
    })
  ])

  return { requestId, first, second }
}
