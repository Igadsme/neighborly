import { INestApplication, ValidationPipe } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { AuthGuard } from '../auth/auth.guard'
import { LoggingExceptionFilter } from './logging.filter'
import { resetRateLimitsForTests } from './rate-limit'
import { testJwtSecret } from './testing/http-app'
import { PrismaService } from '../prisma/prisma.service'
import { CommunityController } from '../community/community.controller'
import { CommunityService } from '../community/community.service'
import { HousingController } from '../housing/housing.controller'
import { HousingService } from '../housing/housing.service'
import { JobsController } from '../jobs/jobs.controller'
import { JobsService } from '../jobs/jobs.service'
import { ServicesController } from '../services/services.controller'
import { ServicesService } from '../services/services.service'
import { TransactionsController } from '../transactions/transactions.controller'
import { TransactionsService } from '../transactions/transactions.service'
import { AccountService } from '../users/account.service'
import { UsersController } from '../users/users.controller'
import { UsersService } from '../users/users.service'

const userId = '11111111-1111-4111-8111-111111111111'

describe('write routes use named rate limits', () => {
  let app: INestApplication
  let baseUrl = ''
  let token = ''
  const housing = { create: jest.fn(async () => ({ id: 'housing-1' })) }
  const jobs = { create: jest.fn(async () => ({ id: 'job-1' })) }
  const services = { create: jest.fn(async () => ({ id: 'service-1' })) }
  const community = { createPost: jest.fn(async () => ({ id: 'post-1' })) }
  const transactions = { transition: jest.fn(async () => ({ id: 'tx-1', status: 'SCHEDULED' })) }
  const account = { updateProfile: jest.fn(async () => ({ id: userId })), requestEmailChange: jest.fn(async () => ({ pending: true })) }
  const users = { completeOnboarding: jest.fn() }

  beforeAll(async () => {
    process.env.JWT_SECRET = testJwtSecret
    process.env.RATE_LIMIT_ENFORCE = '1'
    for (const name of ['HOUSING', 'JOBS', 'SERVICES', 'COMMUNITY', 'TRANSACTIONS', 'PROFILE', 'ACCOUNT_EMAIL']) {
      process.env[`RATE_LIMIT_${name}`] = '1'
    }
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      controllers: [
        HousingController,
        JobsController,
        ServicesController,
        CommunityController,
        TransactionsController,
        UsersController
      ],
      providers: [
        AuthGuard,
        { provide: HousingService, useValue: housing },
        { provide: JobsService, useValue: jobs },
        { provide: ServicesService, useValue: services },
        { provide: CommunityService, useValue: community },
        { provide: TransactionsService, useValue: transactions },
        { provide: AccountService, useValue: account },
        { provide: UsersService, useValue: users },
        {
          provide: PrismaService,
          useValue: {
            user: {
              findUnique: async (args: { where?: { id?: string } }) => ({
                id: args?.where?.id ?? userId,
                email: 'ada@example.com',
                status: 'ACTIVE',
                deletedAt: null
              })
            }
          }
        }
      ]
    }).compile()
    app = moduleRef.createNestApplication({ forceCloseConnections: true })
    app.setGlobalPrefix('api/v1')
    app.useGlobalFilters(new LoggingExceptionFilter(app.get(HttpAdapterHost).httpAdapter))
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
    await app.listen(0, '127.0.0.1')
    const address = app.getHttpServer().address()
    if (!address || typeof address === 'string') throw new Error('HTTP server is not listening')
    baseUrl = `http://127.0.0.1:${address.port}`
    token = moduleRef.get(JwtService).sign({ sub: userId, email: 'ada@example.com' }, { secret: testJwtSecret })
  })

  afterAll(async () => {
    await app.close()
    resetRateLimitsForTests()
    delete process.env.RATE_LIMIT_ENFORCE
    for (const name of ['HOUSING', 'JOBS', 'SERVICES', 'COMMUNITY', 'TRANSACTIONS', 'PROFILE', 'ACCOUNT_EMAIL']) {
      delete process.env[`RATE_LIMIT_${name}`]
    }
  })

  beforeEach(() => {
    resetRateLimitsForTests()
    jest.clearAllMocks()
  })

  async function twice(path: string, method: string, body: unknown) {
    const init = {
      method,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    }
    const first = await fetch(`${baseUrl}${path}`, init)
    const second = await fetch(`${baseUrl}${path}`, init)
    return [first, second] as const
  }

  async function expectLimited(path: string, method: string, body: unknown, called: jest.Mock) {
    const [first, second] = await twice(path, method, body)
    expect(first.status).toBeLessThan(300)
    expect(second.status).toBe(429)
    expect(second.headers.get('retry-after')).toMatch(/^[1-9]\d*$/)
    expect(await second.json()).toMatchObject({ message: 'Too many requests' })
    expect(called).toHaveBeenCalledTimes(1)
  }

  it('limits housing, jobs, services, community, transactions, profile, and email writes', async () => {
    await expectLimited('/api/v1/housing', 'POST', {
      title: 'Sunny flat',
      description: 'Bright two-bedroom near the park.',
      type: 'Apartment',
      listingType: 'rent',
      priceCents: 180000,
      beds: 2,
      baths: 1,
      neighborhood: 'Inman Park'
    }, housing.create)

    await expectLimited('/api/v1/jobs', 'POST', {
      title: 'Baker',
      company: 'Corner Oven',
      description: 'Early morning baking for the neighborhood.',
      type: 'Part-time',
      level: 'Mid',
      salary: '$20/hr',
      location: 'Inman Park',
      remote: 'On-site'
    }, jobs.create)

    await expectLimited('/api/v1/services', 'POST', {
      title: 'House cleaning',
      businessName: 'Spark',
      description: 'Weekly cleaning for apartments and houses.',
      category: 'Cleaning',
      startingPriceCents: 8000,
      location: 'Inman Park',
      availability: 'Weekdays'
    }, services.create)

    await expectLimited('/api/v1/community/posts', 'POST', {
      type: 'discussion',
      title: 'Block party',
      body: 'Saturday afternoon on the corner, bring a chair.',
      neighborhood: 'Inman Park'
    }, community.createPost)

    await expectLimited(
      '/api/v1/transactions/33333333-3333-4333-8333-333333333333/status',
      'PATCH',
      { status: 'SCHEDULED' },
      transactions.transition
    )

    await expectLimited('/api/v1/users/me/profile', 'PATCH', { displayName: 'Ada' }, account.updateProfile)
    await expectLimited(
      '/api/v1/users/me/email',
      'POST',
      { email: 'ada.next@example.com', currentPassword: 'correct-horse' },
      account.requestEmailChange
    )
  })
})
