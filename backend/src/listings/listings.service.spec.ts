import { Test } from '@nestjs/testing'
import { PrismaService } from '../prisma/prisma.service'
import { ListingsService } from './listings.service'

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
      providers: [ListingsService, { provide: PrismaService, useValue: { listing: { findMany } } }]
    }).compile()

    await moduleRef.get(ListingsService).list({ limit: 24, offset: 0 })

    const query = findMany.mock.calls[0][0]
    expect(query.where.status).toBe('PUBLISHED')
    expectPublicSeller(query.select.seller)
    expect(query.select.latitude).toBeUndefined()
    expect(query.select.longitude).toBeUndefined()
    expect(JSON.stringify(query)).not.toContain('passwordHash')
  })

  it('selects a public seller card for listing detail', async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 'listing-1' })
    const moduleRef = await Test.createTestingModule({
      providers: [ListingsService, { provide: PrismaService, useValue: { listing: { findFirst } } }]
    }).compile()

    await moduleRef.get(ListingsService).get('listing-1')

    const query = findFirst.mock.calls[0][0]
    expect(query.where).toEqual({ id: 'listing-1', deletedAt: null, status: { not: 'DRAFT' } })
    expectPublicSeller(query.select.seller)
    expect(query.select.images).toEqual({ orderBy: { sortOrder: 'asc' } })
    expect(query.select.latitude).toBeUndefined()
    expect(query.select.longitude).toBeUndefined()
    expect(JSON.stringify(query)).not.toContain('passwordHash')
  })

  it('selects a public seller card for favorites', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const moduleRef = await Test.createTestingModule({
      providers: [ListingsService, { provide: PrismaService, useValue: { favorite: { findMany } } }]
    }).compile()

    await moduleRef.get(ListingsService).listFavorites('user-1')

    const query = findMany.mock.calls[0][0]
    expect(query.where).toEqual({ userId: 'user-1', listing: { deletedAt: null, status: { not: 'DELETED' } } })
    expectPublicSeller(query.include.listing.select.seller)
    expect(query.include.listing.select.latitude).toBeUndefined()
    expect(query.include.listing.select.longitude).toBeUndefined()
    expect(JSON.stringify(query)).not.toContain('passwordHash')
  })

  it('can list a seller’s published or sold cards without coordinates', async () => {
    const findMany = jest.fn().mockResolvedValue([])
    const moduleRef = await Test.createTestingModule({
      providers: [ListingsService, { provide: PrismaService, useValue: { listing: { findMany } } }]
    }).compile()
    const service = moduleRef.get(ListingsService)
    const sellerId = '11111111-1111-4111-8111-111111111111'

    await service.list({ sellerId, limit: 24, offset: 0 })
    expect(findMany.mock.calls[0][0].where).toMatchObject({ status: 'PUBLISHED', sellerId })
    expect(findMany.mock.calls[0][0].select.latitude).toBeUndefined()

    await service.list({ sellerId, status: 'SOLD', limit: 24, offset: 0 })
    expect(findMany.mock.calls[1][0].where).toMatchObject({ status: 'SOLD', deletedAt: null, sellerId })
    expect(findMany.mock.calls[1][0].select.longitude).toBeUndefined()
  })
})
