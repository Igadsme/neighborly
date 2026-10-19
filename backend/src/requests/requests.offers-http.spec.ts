import { RequestsController } from './requests.controller'
import { RequestsService } from './requests.service'
import { bootApi } from '../common/testing/http-app'
import { publicUserSelect } from '../common/public-user.select'

const requester = {
  id: 'user-1',
  email: 'requester-secret@example.com',
  passwordHash: 'secret-hash',
  profile: { displayName: 'Ada L', firstName: 'Ada', lastName: 'Lovelace', neighborhood: 'Inman Park', city: 'Atlanta' }
}

const offerer = {
  id: 'offerer-1',
  email: 'offerer-secret@example.com',
  passwordHash: 'other-hash',
  profile: { displayName: 'Grace H', firstName: 'Grace', lastName: 'Hopper', neighborhood: 'Decatur', city: 'Atlanta' }
}

const offer = {
  id: 'offer-1',
  amountCents: 4000,
  message: 'I can bring it tomorrow.',
  status: 'PENDING',
  createdAt: new Date('2026-09-22T12:00:00.000Z'),
  offerer,
  items: [],
  request: {
    id: 'request-1',
    title: 'Need a desk',
    description: 'Looking for a standing desk nearby.',
    budgetCents: 50000,
    status: 'PUBLISHED',
    mode: 'BUY',
    createdAt: new Date('2026-09-21T12:00:00.000Z'),
    category: { id: 'cat-1', name: 'Furniture', slug: 'furniture' },
    requester
  }
}

describe('Requester offers HTTP', () => {
  let where: unknown
  let include: { offerer?: unknown; request?: { select?: { requester?: unknown } } } | undefined
  const prisma = {
    requestOffer: {
      findMany: jest.fn(async (args: { where: unknown; include?: typeof include }) => {
        where = args.where
        include = args.include
        return [
          {
            ...offer,
            offerer: { id: 'offerer-1', profile: { displayName: 'Grace H', firstName: 'Grace', neighborhood: 'Decatur', city: 'Atlanta' } },
            request: {
              ...offer.request,
              requester: { id: 'user-1', profile: { displayName: 'Ada L', firstName: 'Ada', neighborhood: 'Inman Park', city: 'Atlanta' } }
            }
          }
        ]
      })
    }
  }

  let baseUrl = ''
  let token = ''
  let app: { close: () => Promise<void> }

  beforeAll(async () => {
    const booted = await bootApi({ controller: RequestsController, service: RequestsService, prisma, userId: 'user-1' })
    app = booted.app
    baseUrl = booted.baseUrl
    token = booted.token
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    where = undefined
    include = undefined
    jest.clearAllMocks()
  })

  it('GET /api/v1/requests/offers defaults to the caller as requester', async () => {
    const response = await fetch(`${baseUrl}/api/v1/requests/offers`, {
      headers: { authorization: `Bearer ${token}` }
    })
    expect(response.status).toBe(200)
    const body = (await response.json()) as Array<{ offerer?: { email?: string }; request?: { requester?: { email?: string } } }>
    expect(where).toEqual({
      request: { status: 'PUBLISHED', deletedAt: null, requesterId: 'user-1' }
    })
    expect(include?.offerer).toEqual({ select: publicUserSelect })
    expect(include?.request?.select?.requester).toEqual({ select: publicUserSelect })
    expect(body[0].offerer).toEqual({
      id: 'offerer-1',
      profile: { displayName: 'Grace H', firstName: 'Grace', neighborhood: 'Decatur', city: 'Atlanta' }
    })
    expect(body[0].request?.requester).toEqual({
      id: 'user-1',
      profile: { displayName: 'Ada L', firstName: 'Ada', neighborhood: 'Inman Park', city: 'Atlanta' }
    })
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('requester-secret@example.com')
    expect(serialized).not.toContain('offerer-secret@example.com')
    expect(serialized).not.toContain('passwordHash')
    expect(serialized).not.toContain('Lovelace')
    expect(serialized).not.toContain('Hopper')
  })

  it('GET /api/v1/requests/offers?scope=sent filters to offers the caller made', async () => {
    const response = await fetch(`${baseUrl}/api/v1/requests/offers?scope=sent`, {
      headers: { authorization: `Bearer ${token}` }
    })
    expect(response.status).toBe(200)
    expect(where).toEqual({
      offererId: 'user-1',
      request: { status: 'PUBLISHED', deletedAt: null }
    })
  })

  it('GET /api/v1/requests/offers without a token is 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/requests/offers`)
    expect(response.status).toBe(401)
    expect(prisma.requestOffer.findMany).not.toHaveBeenCalled()
  })

})
