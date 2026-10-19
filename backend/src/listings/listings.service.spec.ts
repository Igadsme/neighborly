import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PrismaService } from '../prisma/prisma.service'
import { ListingsService } from './listings.service'
import { stubStorage } from '../common/testing/stub-storage'

const publicSeller = {
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

function expectPublicSeller(seller: unknown) {
  expect(seller).toEqual(publicSeller)
  const serialized = JSON.stringify(seller)
  expect(serialized).not.toContain('passwordHash')
  expect(serialized).not.toContain('email')
  expect(serialized).not.toContain('latitude')
  expect(serialized).not.toContain('longitude')
  expect(serialized).not.toContain('phoneVerified')
  expect(serialized).not.toContain('emailVerified')
  expect(seller).not.toHaveProperty('select.passwordHash')
  expect(seller).not.toHaveProperty('select.status')
}

describe('ListingsService public reads', () => {
  it('selects a public seller card for the published listing list', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const moduleRef = await Test.createTestingModule({
      providers: [ListingsService, stubStorage().provider, { provide: PrismaService, useValue: { listing: { findMany, count: async () => 1 } } }]
    }).compile()

    await moduleRef.get(ListingsService).list({ limit: 24, offset: 0 })

    const query = findMany.mock.calls[0][0]
    expect(query.where.status).toBe('PUBLISHED')
    expectPublicSeller(query.select.seller)
    expect(JSON.stringify(query)).not.toContain('passwordHash')

    // Coordinates are read for distance math but never returned.
    const page = await moduleRef.get(ListingsService).list({})
    expect(JSON.stringify(page)).not.toContain('latitude')
  })

  it('selects a public seller card for listing detail', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'listing-1' })
    const moduleRef = await Test.createTestingModule({
      providers: [ListingsService, stubStorage().provider, { provide: PrismaService, useValue: { listing: { findFirst } } }]
    }).compile()

    const detail = await moduleRef.get(ListingsService).get('listing-1')

    const query = findFirst.mock.calls[0][0]
    expect(query.where).toEqual({
      id: 'listing-1',
      deletedAt: null,
      status: { in: ['PUBLISHED', 'SOLD'] },
      seller: { status: 'ACTIVE', deletedAt: null }
    })
    expectPublicSeller(query.select.seller)
    expect(query.select.images).toEqual({ orderBy: { sortOrder: 'asc' } })
    expect(JSON.stringify(query)).not.toContain('passwordHash')
    // Read for distance math, then stripped: the response never carries them.
    expect(detail).not.toHaveProperty('latitude')
    expect(detail).not.toHaveProperty('longitude')
  })

  it('returns 404 for a paused listing that the old public filter would return', async () => {
    const paused = {
      id: 'listing-1',
      status: 'ARCHIVED',
      deletedAt: null,
      latitude: null,
      longitude: null,
      images: []
    }
    const findFirst = jest.fn(async (args: { where: { status?: { not?: string; in?: string[] } } }) => {
      const status = args.where.status
      // Today's get() asks for every non-draft, which includes a pause.
      if (status?.not === 'DRAFT' || status?.in?.includes('ARCHIVED')) return paused
      return null
    })
    const moduleRef = await Test.createTestingModule({
      providers: [ListingsService, stubStorage().provider, { provide: PrismaService, useValue: { listing: { findFirst } } }]
    }).compile()

    await expect(moduleRef.get(ListingsService).get('listing-1')).rejects.toBeInstanceOf(NotFoundException)
  })

  it('still returns a paused listing from the owner manage read', async () => {
    const paused = {
      id: 'listing-1',
      sellerId: 'user-1',
      status: 'ARCHIVED',
      deletedAt: null,
      latitude: null,
      longitude: null,
      images: []
    }
    const findFirst = jest.fn().mockResolvedValue(paused)
    const moduleRef = await Test.createTestingModule({
      providers: [ListingsService, stubStorage().provider, { provide: PrismaService, useValue: { listing: { findFirst } } }]
    }).compile()

    const detail = await moduleRef.get(ListingsService).getForOwner('user-1', 'listing-1')
    expect(detail).toMatchObject({ id: 'listing-1', status: 'ARCHIVED', deletedAt: null })
    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: 'listing-1',
      sellerId: 'user-1',
      status: { not: 'DELETED' }
    })
  })

  it('selects a public seller card for favorites', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const moduleRef = await Test.createTestingModule({
      providers: [ListingsService, stubStorage().provider, { provide: PrismaService, useValue: { favorite: { findMany } } }]
    }).compile()

    await moduleRef.get(ListingsService).listFavorites('user-1')

    const query = findMany.mock.calls[0][0]
    // Only listings a buyer could still act on stay in the saved list.
    expect(query.where).toEqual({
      userId: 'user-1',
      listing: { deletedAt: null, status: { in: ['PUBLISHED', 'SOLD'] } }
    })
    expectPublicSeller(query.include.listing.select.seller)
    expect(query.include.listing.select.latitude).toBeUndefined()
    expect(query.include.listing.select.longitude).toBeUndefined()
    expect(JSON.stringify(query)).not.toContain('passwordHash')
  })

  it('can list a seller’s published or sold cards without coordinates', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const moduleRef = await Test.createTestingModule({
      providers: [ListingsService, stubStorage().provider, { provide: PrismaService, useValue: { listing: { findMany, count: async () => 1 } } }]
    }).compile()
    const service = moduleRef.get(ListingsService)
    const sellerId = '11111111-1111-4111-8111-111111111111'

    const page = await service.list({ sellerId, limit: 24, offset: 0 })
    expect(findMany.mock.calls[0][0].where).toMatchObject({ status: 'PUBLISHED', sellerId })
    expect(JSON.stringify(page.items)).not.toContain('latitude')

    await service.list({ sellerId, status: 'SOLD', limit: 24, offset: 0 })
    expect(findMany.mock.calls[1][0].where).toMatchObject({ status: 'SOLD', deletedAt: null, sellerId })
  })
})

describe('ListingsService owner actions', () => {
  const listing = {
    id: 'listing-1',
    sellerId: 'user-1',
    status: 'PUBLISHED' as 'PUBLISHED' | 'ARCHIVED' | 'SOLD' | 'DRAFT',
    deletedAt: null,
    title: 'Oak chair',
    description: 'Solid oak dining chair'
  }

  function serviceWith(listingRow: typeof listing | null, update = jest.fn(async ({ data }: { data: object }) => ({ ...listingRow, ...data }))) {
    const findUnique = jest.fn().mockResolvedValue(listingRow)
    const prisma = { listing: { findUnique, update, findMany: jest.fn(), groupBy: jest.fn() } }
    return Test.createTestingModule({
      providers: [ListingsService, stubStorage().provider, { provide: PrismaService, useValue: prisma }]
    })
      .compile()
      .then((moduleRef) => ({ service: moduleRef.get(ListingsService), update, prisma }))
  }

  it('pauses a published listing without deleting it', async () => {
    const { service, update } = await serviceWith(listing)
    await service.pause('user-1', 'listing-1')
    // Pausing is reversible, so it must not stamp deletedAt.
    expect(update).toHaveBeenCalledWith({ where: { id: 'listing-1' }, data: { status: 'ARCHIVED', deletedAt: null } })
  })

  it('archives by stamping deletedAt, which pause does not', async () => {
    const { service, update } = await serviceWith(listing)
    await service.archive('user-1', 'listing-1')
    const data = update.mock.calls[0][0].data as { status: string; deletedAt: Date | null }
    expect(data.status).toBe('ARCHIVED')
    expect(data.deletedAt).toBeInstanceOf(Date)

    update.mockClear()
    await service.pause('user-1', 'listing-1')
    expect(update).toHaveBeenCalledWith({ where: { id: 'listing-1' }, data: { status: 'ARCHIVED', deletedAt: null } })
  })

  it('refuses to pause a listing the caller does not own', async () => {
    const { service } = await serviceWith(listing)
    await expect(service.pause('someone-else', 'listing-1')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('marks a published listing sold', async () => {
    const { service, update } = await serviceWith(listing)
    await service.markSold('user-1', 'listing-1')
    expect(update).toHaveBeenCalledWith({ where: { id: 'listing-1' }, data: { status: 'SOLD', deletedAt: null } })
  })

  it('republishes a paused listing and still rejects a sold one', async () => {
    const paused = { ...listing, status: 'ARCHIVED' as const }
    const { service, update } = await serviceWith(paused)
    await service.publish('user-1', 'listing-1')
    // Restoring clears deletedAt so the row is publicly visible again.
    expect(update).toHaveBeenCalledWith({ where: { id: 'listing-1' }, data: { status: 'PUBLISHED', deletedAt: null } })

    const sold = await serviceWith({ ...listing, status: 'SOLD' })
    await expect(sold.service.publish('user-1', 'listing-1')).rejects.toBeInstanceOf(ConflictException)
    await expect(sold.service.markSold('user-1', 'listing-1')).resolves.toMatchObject({ status: 'SOLD' })
  })

  it('counts published listings by neighborhood', async () => {
    const groupBy = jest.fn().mockResolvedValue([
      { neighborhood: 'Decatur', _count: { _all: 2 } },
      { neighborhood: null, _count: { _all: 1 } },
      { neighborhood: 'Inman Park', _count: { _all: 4 } }
    ])
    const moduleRef = await Test.createTestingModule({
      providers: [ListingsService, stubStorage().provider, { provide: PrismaService, useValue: { listing: { groupBy } } }]
    }).compile()
    await expect(moduleRef.get(ListingsService).neighborhoodCounts()).resolves.toEqual([
      { neighborhood: 'Inman Park', count: 4 },
      { neighborhood: 'Decatur', count: 2 }
    ])
  })
})
