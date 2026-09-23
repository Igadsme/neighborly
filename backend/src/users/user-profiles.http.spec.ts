import { ReviewsService } from '../reviews/reviews.service'
import { bootApi } from '../common/testing/http-app'
import { UserProfilesController } from './user-profiles.controller'
import { UsersService } from './users.service'

const userId = '11111111-1111-4111-8111-111111111111'

const user = {
  id: userId,
  createdAt: new Date('2022-01-15T00:00:00.000Z'),
  profile: {
    displayName: 'Ada L',
    firstName: 'Ada',
    lastName: 'Lovelace',
    bio: 'Builds things for neighbors.',
    neighborhood: 'Inman Park',
    city: 'Atlanta',
    emailVerified: true,
    latitude: '33.761000',
    longitude: '-84.352000'
  }
}

describe('Public profile HTTP', () => {
  let profileSelect: unknown
  let reviewSelect: unknown
  const prisma = {
    user: {
      findFirst: jest.fn(async (args: { select?: { profile?: unknown } }) => {
        if (args.select?.profile) profileSelect = args.select
        return user
      })
    },
    review: {
      aggregate: jest.fn(async () => ({ _avg: { rating: 4.66 }, _count: { _all: 3 } })),
      findMany: jest.fn(async (args: { select?: unknown }) => {
        reviewSelect = args.select
        return [
          {
            id: 'review-1',
            rating: 5,
            body: 'Smooth pickup.',
            createdAt: new Date('2026-08-01T00:00:00.000Z'),
            author: {
              id: '22222222-2222-4222-8222-222222222222',
              email: 'grace@example.com',
              passwordHash: 'hash',
              profile: {
                displayName: 'Grace H',
                firstName: 'Grace',
                neighborhood: 'Decatur',
                city: 'Atlanta',
                latitude: '33.770000',
                longitude: '-84.290000'
              }
            },
            transaction: { offerId: 'offer-1' }
          }
        ]
      })
    },
    listing: { count: jest.fn(async () => 2) },
    offerItem: {
      findMany: jest.fn(async () => [{ offerId: 'offer-1', listing: { title: 'Oak chair' } }])
    }
  }

  let baseUrl = ''
  let app: { close: () => Promise<void> }

  beforeAll(async () => {
    const booted = await bootApi({
      controller: UserProfilesController,
      service: UsersService,
      extraProviders: [ReviewsService],
      prisma
    })
    app = booted.app
    baseUrl = booted.baseUrl
  })

  afterAll(async () => {
    await app.close()
  })

  it('GET /users/:id/profile is public and omits private fields', async () => {
    const response = await fetch(`${baseUrl}/api/v1/users/${userId}/profile`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toMatchObject({
      id: userId,
      displayName: 'Ada L',
      firstName: 'Ada',
      lastName: 'Lovelace',
      bio: 'Builds things for neighbors.',
      neighborhood: 'Inman Park',
      city: 'Atlanta',
      memberSince: '2022-01-15T00:00:00.000Z',
      emailVerified: true,
      ratingAverage: 4.7,
      reviewCount: 3,
      soldCount: 2
    })
    expect(body.email).toBeUndefined()
    expect(body.passwordHash).toBeUndefined()
    expect(body.latitude).toBeUndefined()
    expect(body.longitude).toBeUndefined()
    expect(body.status).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('33.761')
    expect(JSON.stringify(profileSelect)).not.toContain('latitude')
    expect(JSON.stringify(profileSelect)).not.toContain('passwordHash')
    expect(JSON.stringify(profileSelect)).not.toContain('"email"')
  })

  it('GET /users/:id/reviews returns public author cards and an item title', async () => {
    const response = await fetch(`${baseUrl}/api/v1/users/${userId}/reviews`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as Array<Record<string, unknown>>
    expect(body).toEqual([
      {
        id: 'review-1',
        rating: 5,
        body: 'Smooth pickup.',
        createdAt: '2026-08-01T00:00:00.000Z',
        itemTitle: 'Oak chair',
        author: {
          id: '22222222-2222-4222-8222-222222222222',
          profile: {
            displayName: 'Grace H',
            firstName: 'Grace',
            neighborhood: 'Decatur',
            city: 'Atlanta'
          }
        }
      }
    ])
    expect(JSON.stringify(body)).not.toContain('grace@example.com')
    expect(JSON.stringify(body)).not.toContain('passwordHash')
    expect(JSON.stringify(body)).not.toContain('33.770')
    expect(JSON.stringify(reviewSelect)).not.toContain('passwordHash')
    expect(JSON.stringify(reviewSelect)).not.toContain('latitude')
  })

  it('returns 404 for a missing profile and 400 for a bad id', async () => {
    ;(prisma.user.findFirst as unknown as jest.Mock).mockResolvedValueOnce(null)
    const missing = await fetch(`${baseUrl}/api/v1/users/${userId}/profile`)
    expect(missing.status).toBe(404)

    const invalid = await fetch(`${baseUrl}/api/v1/users/not-a-uuid/reviews`)
    expect(invalid.status).toBe(400)
  })
})
