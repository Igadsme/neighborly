import { Test } from '@nestjs/testing'
import { OutboxWriter } from '../events/outbox-writer'
import { PrismaService } from '../prisma/prisma.service'
import { CommunityService } from '../community/community.service'
import { HousingService } from '../housing/housing.service'
import { JobsService } from '../jobs/jobs.service'
import { ListingsService } from '../listings/listings.service'
import { RequestLifecycleService } from '../requests/request-lifecycle.service'
import { RequestsService } from '../requests/requests.service'
import { ServicesService } from '../services/services.service'
import { activeAccountWhere } from './active-account'
import { stubStorage } from './testing/stub-storage'

/**
 * Suspended (and deleted) accounts stay out of public discovery. The query
 * joins the owner, so restoring the account to ACTIVE shows the same
 * published rows again without a republish.
 */
describe('suspended accounts are omitted from public reads', () => {
  const outbox = { provide: OutboxWriter, useValue: { record: async () => undefined } }

  it('omits a suspended seller from the public listing list and detail', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const findFirst = jest.fn().mockResolvedValue(null)
    const groupBy = jest.fn().mockResolvedValue([])
    const moduleRef = await Test.createTestingModule({
      providers: [
        ListingsService,
        stubStorage().provider,
        { provide: PrismaService, useValue: { listing: { findMany, findFirst, count: async () => 0, groupBy } } }
      ]
    }).compile()
    const service = moduleRef.get(ListingsService)

    await service.list({ limit: 24, offset: 0 })
    await expect(service.get('listing-1')).rejects.toThrow('Listing not found')
    await service.neighborhoodCounts()

    expect(findMany.mock.calls[0][0].where.seller).toEqual(activeAccountWhere)
    expect(findMany.mock.calls[0][0].where.status).toBe('PUBLISHED')
    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: 'listing-1',
      deletedAt: null,
      status: { in: ['PUBLISHED', 'SOLD'] },
      seller: activeAccountWhere
    })
    expect(groupBy.mock.calls[0][0].where).toEqual({
      status: 'PUBLISHED',
      deletedAt: null,
      seller: activeAccountWhere
    })
  })

  it('omits a suspended owner from housing, jobs, and services public reads', async () => {
    const housingFindMany = jest.fn().mockResolvedValue([])
    const housingFindFirst = jest.fn().mockResolvedValue(null)
    const jobsFindMany = jest.fn().mockResolvedValue([])
    const jobsFindFirst = jest.fn().mockResolvedValue(null)
    const servicesFindMany = jest.fn().mockResolvedValue([])
    const servicesFindFirst = jest.fn().mockResolvedValue(null)

    const housing = await Test.createTestingModule({
      providers: [HousingService, { provide: PrismaService, useValue: { housingListing: { findMany: housingFindMany, findFirst: housingFindFirst } } }]
    }).compile()
    const jobs = await Test.createTestingModule({
      providers: [JobsService, { provide: PrismaService, useValue: { jobListing: { findMany: jobsFindMany, findFirst: jobsFindFirst } } }]
    }).compile()
    const services = await Test.createTestingModule({
      providers: [ServicesService, { provide: PrismaService, useValue: { serviceListing: { findMany: servicesFindMany, findFirst: servicesFindFirst } } }]
    }).compile()

    await housing.get(HousingService).list({ limit: 24, offset: 0, sort: 'newest' })
    await expect(housing.get(HousingService).get('housing-1')).rejects.toThrow('Housing listing not found')
    await jobs.get(JobsService).list({ limit: 24, offset: 0 })
    await expect(jobs.get(JobsService).get('job-1')).rejects.toThrow('Job not found')
    await services.get(ServicesService).list({ limit: 24, offset: 0 })
    await expect(services.get(ServicesService).get('service-1')).rejects.toThrow('Service not found')

    for (const where of [
      housingFindMany.mock.calls[0][0].where,
      housingFindFirst.mock.calls[0][0].where,
      jobsFindMany.mock.calls[0][0].where,
      jobsFindFirst.mock.calls[0][0].where,
      servicesFindMany.mock.calls[0][0].where,
      servicesFindFirst.mock.calls[0][0].where
    ]) {
      expect(where.owner).toEqual(activeAccountWhere)
      expect(where.status).toBe('PUBLISHED')
      expect(where.deletedAt).toBeNull()
    }
  })

  it('omits a suspended author from community public reads', async () => {
    const postFindMany = jest.fn().mockResolvedValue([])
    const postFindFirst = jest.fn().mockResolvedValue(null)
    const postCount = jest.fn().mockResolvedValue(0)
    const eventFindMany = jest.fn().mockResolvedValue([])
    const eventFindFirst = jest.fn().mockResolvedValue(null)
    const eventCount = jest.fn().mockResolvedValue(0)
    const lostFindMany = jest.fn().mockResolvedValue([])
    const lostFindFirst = jest.fn().mockResolvedValue(null)
    const giveawayFindMany = jest.fn().mockResolvedValue([])
    const giveawayFindFirst = jest.fn().mockResolvedValue(null)
    const commentFindMany = jest.fn().mockResolvedValue([])
    const moduleRef = await Test.createTestingModule({
      providers: [
        CommunityService,
        {
          provide: PrismaService,
          useValue: {
            user: { count: async () => 0 },
            communityPost: { findMany: postFindMany, findFirst: postFindFirst, count: postCount },
            communityEvent: { findMany: eventFindMany, findFirst: eventFindFirst, count: eventCount },
            lostFoundItem: { findMany: lostFindMany, findFirst: lostFindFirst },
            giveaway: { findMany: giveawayFindMany, findFirst: giveawayFindFirst },
            communityComment: { findMany: commentFindMany }
          }
        }
      ]
    }).compile()
    const service = moduleRef.get(CommunityService)

    await service.summary()
    await service.listPosts({ limit: 24, offset: 0 })
    await expect(service.getPost('post-1')).rejects.toThrow('Community post not found')
    await service.listEvents({ limit: 24, offset: 0 })
    await expect(service.getEvent('event-1')).rejects.toThrow('Event not found')
    await service.listLostFound({ limit: 24, offset: 0 })
    await expect(service.getLostFound('lost-1')).rejects.toThrow('Lost and found item not found')
    await service.listGiveaways({ limit: 24, offset: 0 })
    await expect(service.getGiveaway('give-1')).rejects.toThrow('Giveaway not found')
    await service.listComments('post-1')

    expect(postCount.mock.calls[0][0].where.author).toEqual(activeAccountWhere)
    expect(postFindMany.mock.calls[0][0].where.author).toEqual(activeAccountWhere)
    expect(postFindFirst.mock.calls[0][0].where.author).toEqual(activeAccountWhere)
    expect(eventCount.mock.calls[0][0].where.organizer).toEqual(activeAccountWhere)
    expect(eventFindMany.mock.calls[0][0].where.organizer).toEqual(activeAccountWhere)
    expect(eventFindFirst.mock.calls[0][0].where.organizer).toEqual(activeAccountWhere)
    expect(lostFindMany.mock.calls[0][0].where.author).toEqual(activeAccountWhere)
    expect(lostFindFirst.mock.calls[0][0].where.author).toEqual(activeAccountWhere)
    expect(giveawayFindMany.mock.calls[0][0].where.author).toEqual(activeAccountWhere)
    expect(giveawayFindFirst.mock.calls[0][0].where.author).toEqual(activeAccountWhere)
    expect(commentFindMany.mock.calls[0][0].where.author).toEqual(activeAccountWhere)
    expect(commentFindMany.mock.calls[0][0].where.post.author).toEqual(activeAccountWhere)
  })

  it('omits a suspended requester from the public request list and detail', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const findFirst = jest.fn().mockResolvedValue(null)
    const count = jest.fn().mockResolvedValue(0)
    const lifecycle = await Test.createTestingModule({
      providers: [
        RequestLifecycleService,
        outbox,
        { provide: PrismaService, useValue: { needRequest: { findMany, findFirst, count } } }
      ]
    }).compile()
    const requests = await Test.createTestingModule({
      providers: [
        RequestsService,
        outbox,
        { provide: PrismaService, useValue: { needRequest: { findMany } } }
      ]
    }).compile()

    await lifecycle.get(RequestLifecycleService).list({ limit: 24, offset: 0 })
    await expect(lifecycle.get(RequestLifecycleService).get('request-1')).rejects.toThrow('Request not found')
    await requests.get(RequestsService).list()

    expect(findMany.mock.calls[0][0].where.requester).toEqual(activeAccountWhere)
    expect(findFirst.mock.calls[0][0].where.requester).toEqual(activeAccountWhere)
    expect(findMany.mock.calls[1][0].where.requester).toEqual(activeAccountWhere)
  })
})
