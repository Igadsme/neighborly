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
  offer: '60000000-0000-4000-8000-000000000001'
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
    update: {},
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
