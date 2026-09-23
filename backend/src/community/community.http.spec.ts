import { CommunityController } from './community.controller'
import { CommunityService } from './community.service'
import { bootApi } from '../common/testing/http-app'
import { projectSelect, SelectSpec } from '../common/testing/project-prisma'

const author = {
  id: 'author-1',
  email: 'secret-author@example.com',
  passwordHash: 'author-hash',
  profile: {
    displayName: 'Priya P',
    firstName: 'Priya',
    lastName: 'Patel',
    neighborhood: 'Inman Park',
    city: 'Atlanta',
    latitude: '33.761111',
    longitude: '-84.363333',
    bio: 'Private bio'
  }
}

const claimer = {
  id: 'claimer-1',
  email: 'secret-claimer@example.com',
  passwordHash: 'claimer-hash',
  profile: { displayName: 'Marcus J', firstName: 'Marcus', lastName: 'Johnson', neighborhood: 'Decatur', city: 'Atlanta' }
}

const reactions: { postId: string; userId: string; emoji: string }[] = []

const post = {
  id: 'post-1',
  authorId: 'author-1',
  type: 'discussion',
  title: "Best farmer's markets this weekend?",
  body: 'Heading to a few markets with the kids and looking for recommendations.',
  neighborhood: 'Inman Park',
  city: 'Atlanta',
  status: 'PUBLISHED',
  createdAt: new Date('2026-09-23T10:00:00.000Z'),
  updatedAt: new Date('2026-09-23T10:00:00.000Z'),
  deletedAt: null,
  author
}

const event = {
  id: 'event-1',
  organizerId: 'author-1',
  title: 'Westside Neighborhood Cleanup',
  description: 'Gloves and bags provided.',
  neighborhood: 'Westside',
  city: 'Atlanta',
  dateLabel: 'Sat Sep 20',
  timeLabel: '9:00 AM',
  imageKey: 'photo-1566438480900-0609be27a4be',
  status: 'PUBLISHED',
  createdAt: new Date('2026-09-18T12:00:00.000Z'),
  updatedAt: new Date('2026-09-18T12:00:00.000Z'),
  deletedAt: null,
  organizer: author,
  _count: { rsvps: 34 }
}

const lost = {
  id: 'lost-1',
  authorId: 'author-1',
  kind: 'lost',
  item: 'Black Lab mix, answers to Scout',
  neighborhood: 'Candler Park',
  city: 'Atlanta',
  imageKey: 'photo-1587300003388-59208cc962cb',
  status: 'PUBLISHED',
  createdAt: new Date('2026-09-23T09:00:00.000Z'),
  updatedAt: new Date('2026-09-23T09:00:00.000Z'),
  deletedAt: null,
  author
}

const giveaway = {
  id: 'giveaway-1',
  authorId: 'author-1',
  item: '20+ potted plants',
  neighborhood: 'Grant Park',
  city: 'Atlanta',
  claimed: false,
  claimedById: null as string | null,
  status: 'PUBLISHED',
  createdAt: new Date('2026-09-23T06:00:00.000Z'),
  updatedAt: new Date('2026-09-23T06:00:00.000Z'),
  deletedAt: null,
  author,
  claimedBy: claimer
}

function postRecord() {
  return {
    ...post,
    reactions: reactions.map(reaction => ({ emoji: reaction.emoji, userId: reaction.userId, user: author })),
    comments: [{ id: 'comment-1', author }]
  }
}

function expectNoPrivate(serialized: string) {
  for (const secret of ['secret-author@example.com', 'author-hash', 'secret-claimer@example.com', 'claimer-hash', 'Patel', 'Johnson', 'Private bio', '33.761111', '-84.363333', 'passwordHash']) {
    expect(serialized).not.toContain(secret)
  }
}

describe('Community HTTP', () => {
  let claimResult = { count: 1 }
  let rsvp: { userId: string } | null = null
  const prisma = {
    blockedUser: { findFirst: jest.fn(async () => null) },
    communityPost: {
      findMany: jest.fn(async (args: { select: SelectSpec }) => [projectSelect(postRecord(), args.select)]),
      findFirst: jest.fn(async (args: { select: SelectSpec }) => projectSelect(postRecord(), args.select)),
      findUnique: jest.fn(async () => ({ authorId: 'author-1', deletedAt: null })),
      create: jest.fn(async (args: { select: SelectSpec }) => projectSelect(postRecord(), args.select)),
      update: jest.fn(async () => post)
    },
    communityReaction: {
      findUnique: jest.fn(async (args: { where: { postId_userId: { postId: string; userId: string } } }) => {
        const key = args.where.postId_userId
        return reactions.find(reaction => reaction.postId === key.postId && reaction.userId === key.userId) ?? null
      }),
      create: jest.fn(async (args: { data: { postId: string; userId: string; emoji: string } }) => {
        reactions.push(args.data)
        return args.data
      }),
      update: jest.fn(async (args: { where: { postId_userId: { userId: string } }; data: { emoji: string } }) => {
        const row = reactions.find(reaction => reaction.userId === args.where.postId_userId.userId)
        if (row) row.emoji = args.data.emoji
        return row
      }),
      delete: jest.fn(async (args: { where: { postId_userId: { userId: string } } }) => {
        const index = reactions.findIndex(reaction => reaction.userId === args.where.postId_userId.userId)
        if (index >= 0) reactions.splice(index, 1)
      })
    },
    communityComment: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async (args: { data: { body: string }; select: SelectSpec }) =>
        projectSelect({ id: 'comment-2', postId: 'post-1', body: args.data.body, createdAt: new Date('2026-09-23T12:00:00.000Z'), author }, args.select)
      )
    },
    communityEvent: {
      findMany: jest.fn(async (args: { select: SelectSpec }) => [projectSelect(event, args.select)]),
      findFirst: jest.fn(async (args: { select: SelectSpec }) => projectSelect(event, args.select)),
      findUnique: jest.fn(async () => ({ organizerId: 'author-1', deletedAt: null })),
      create: jest.fn(),
      update: jest.fn()
    },
    communityEventRsvp: {
      findUnique: jest.fn(async () => rsvp),
      create: jest.fn(async () => {
        rsvp = { userId: 'user-1' }
        event._count.rsvps += 1
        return rsvp
      }),
      delete: jest.fn(async () => {
        rsvp = null
        event._count.rsvps -= 1
      })
    },
    lostFoundItem: {
      findMany: jest.fn(async (args: { select: SelectSpec }) => [projectSelect(lost, args.select)]),
      findFirst: jest.fn(async (args: { select: SelectSpec }) => projectSelect(lost, args.select)),
      findUnique: jest.fn(async () => ({ authorId: 'author-1', deletedAt: null })),
      create: jest.fn(),
      update: jest.fn()
    },
    giveaway: {
      findMany: jest.fn(async (args: { select: SelectSpec }) => [projectSelect(giveaway, args.select)]),
      findFirst: jest.fn(async (args: { select: SelectSpec }) => projectSelect(giveaway, args.select)),
      findUnique: jest.fn(async (args: { select?: SelectSpec }) => {
        if (args.select && 'claimed' in args.select) {
          return { claimed: giveaway.claimed, claimedById: giveaway.claimedById, deletedAt: null, status: 'PUBLISHED' }
        }
        return projectSelect(giveaway, args.select ?? {})
      }),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(async () => {
        if (claimResult.count === 1) {
          giveaway.claimed = true
          giveaway.claimedById = 'user-1'
        }
        return claimResult
      })
    }
  }

  let baseUrl = ''
  let token = ''
  let app: { close: () => Promise<void> }

  beforeAll(async () => {
    const booted = await bootApi({ controller: CommunityController, service: CommunityService, prisma })
    app = booted.app
    baseUrl = booted.baseUrl
    token = booted.token
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    reactions.splice(0, reactions.length, { postId: 'post-1', userId: 'other', emoji: '👍' }, { postId: 'post-1', userId: 'other-2', emoji: '❤️' })
    event._count.rsvps = 34
    rsvp = null
    giveaway.claimed = false
    giveaway.claimedById = null
    claimResult = { count: 1 }
    jest.clearAllMocks()
  })

  it('GET /api/v1/community/posts returns reaction counts and a public author card', async () => {
    const response = await fetch(`${baseUrl}/api/v1/community/posts`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as Array<{ reactions: { like: number; love: number; wow: number }; replies: number; author: unknown }>
    expect(body[0].reactions).toEqual({ like: 1, love: 1, wow: 0 })
    expect(body[0].replies).toBe(1)
    expect(body[0].author).toEqual({
      id: 'author-1',
      profile: { displayName: 'Priya P', firstName: 'Priya', neighborhood: 'Inman Park', city: 'Atlanta' }
    })
    expectNoPrivate(JSON.stringify(body))
  })

  it('POST /api/v1/community/posts without a token is 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/community/posts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'discussion', title: 'Hello neighborhood', body: 'Sharing a note with neighbors today.', neighborhood: 'Inman Park' })
    })
    expect(response.status).toBe(401)
    expect(prisma.communityPost.create).not.toHaveBeenCalled()
  })

  it('POST /api/v1/community/posts/:id/reactions without a token is 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/community/posts/post-1/reactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ emoji: '👍' })
    })
    expect(response.status).toBe(401)
    expect(prisma.communityReaction.create).not.toHaveBeenCalled()
  })

  it('POST /api/v1/community/posts/:id/reactions toggles one emoji per person', async () => {
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    const first = await fetch(`${baseUrl}/api/v1/community/posts/post-1/reactions`, { method: 'POST', headers, body: JSON.stringify({ emoji: '👍' }) })
    expect(first.status).toBe(201)
    expect((await first.json() as { reactions: { like: number } }).reactions.like).toBe(2)
    const second = await fetch(`${baseUrl}/api/v1/community/posts/post-1/reactions`, { method: 'POST', headers, body: JSON.stringify({ emoji: '👍' }) })
    expect(second.status).toBe(201)
    expect((await second.json() as { reactions: { like: number } }).reactions.like).toBe(1)
  })

  it('GET /api/v1/community/events returns the attending count without organizer secrets', async () => {
    const response = await fetch(`${baseUrl}/api/v1/community/events`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as Array<{ title: string; dateLabel: string; timeLabel: string; image: string; attending: number }>
    expect(body[0]).toMatchObject({ title: 'Westside Neighborhood Cleanup', dateLabel: 'Sat Sep 20', timeLabel: '9:00 AM', image: 'photo-1566438480900-0609be27a4be', attending: 34 })
    expectNoPrivate(JSON.stringify(body))
  })

  it('POST /api/v1/community/events/:id/rsvp without a token is 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/community/events/event-1/rsvp`, { method: 'POST' })
    expect(response.status).toBe(401)
    expect(prisma.communityEventRsvp.create).not.toHaveBeenCalled()
  })

  it('POST /api/v1/community/events/:id/rsvp toggles attendance', async () => {
    const headers = { authorization: `Bearer ${token}` }
    const going = await fetch(`${baseUrl}/api/v1/community/events/event-1/rsvp`, { method: 'POST', headers })
    expect(going.status).toBe(201)
    expect(await going.json()).toEqual({ attending: true, attendingCount: 35 })
  })

  it('GET /api/v1/community/lost-found uses the screen type and a public author card', async () => {
    const response = await fetch(`${baseUrl}/api/v1/community/lost-found`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as Array<{ type: string; item: string; image: string }>
    expect(body[0]).toMatchObject({ type: 'lost', item: 'Black Lab mix, answers to Scout', image: 'photo-1587300003388-59208cc962cb' })
    expectNoPrivate(JSON.stringify(body))
  })

  it('GET /api/v1/community/giveaways does not include the claimer', async () => {
    const response = await fetch(`${baseUrl}/api/v1/community/giveaways`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as Array<{ claimed: boolean; claimedBy?: unknown }>
    expect(body[0].claimed).toBe(false)
    expect(body[0].claimedBy).toBeUndefined()
    expectNoPrivate(JSON.stringify(body))
  })

  it('POST /api/v1/community/giveaways/:id/claim without a token is 401', async () => {
    const response = await fetch(`${baseUrl}/api/v1/community/giveaways/giveaway-1/claim`, { method: 'POST' })
    expect(response.status).toBe(401)
    expect(prisma.giveaway.updateMany).not.toHaveBeenCalled()
  })

  it('POST /api/v1/community/giveaways/:id/claim claims once', async () => {
    const headers = { authorization: `Bearer ${token}` }
    const response = await fetch(`${baseUrl}/api/v1/community/giveaways/giveaway-1/claim`, { method: 'POST', headers })
    expect(response.status).toBe(201)
    const body = (await response.json()) as { claimed: boolean; giveaway: { claimed: boolean } }
    expect(body.claimed).toBe(true)
    expect(body.giveaway.claimed).toBe(true)
    expectNoPrivate(JSON.stringify(body))

    claimResult = { count: 0 }
    giveaway.claimed = true
    giveaway.claimedById = 'someone-else'
    const conflict = await fetch(`${baseUrl}/api/v1/community/giveaways/giveaway-1/claim`, { method: 'POST', headers })
    expect(conflict.status).toBe(409)
  })
})
