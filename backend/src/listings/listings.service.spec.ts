import { ForbiddenException, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { ListingsService } from './listings.service'

describe('ListingsService', () => {
  const listing = {
    findFirst: jest.fn(),
  }
  const listingImage = {
    count: jest.fn(),
  }
  const savedSearch = {
    findUnique: jest.fn(),
    delete: jest.fn(),
  }
  const storage = {
    createImageUpload: jest.fn(),
    verifyImage: jest.fn(),
    publicImageUrl: jest.fn(),
    deleteImage: jest.fn(),
  }
  const service = new ListingsService(
    { listing, listingImage, savedSearch } as unknown as PrismaService,
    storage as unknown as StorageService,
  )

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('does not return draft listings through the public detail lookup', async () => {
    listing.findFirst.mockResolvedValue(null)
    await expect(service.get('draft-id')).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(listing.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'draft-id', deletedAt: null, status: 'PUBLISHED' },
      }),
    )
  })

  it('does not issue image upload grants to a non-owner', async () => {
    listing.findFirst.mockResolvedValue({
      id: 'listing-id',
      sellerId: 'owner-id',
    })
    await expect(
      service.createImageUpload('attacker-id', 'listing-id', {
        contentType: 'image/jpeg',
        sizeBytes: 100,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(listingImage.count).not.toHaveBeenCalled()
    expect(storage.createImageUpload).not.toHaveBeenCalled()
  })

  it('enforces the image count limit before issuing upload grants', async () => {
    listing.findFirst.mockResolvedValue({
      id: 'listing-id',
      sellerId: 'owner-id',
    })
    listingImage.count.mockResolvedValue(5)
    await expect(
      service.createImageUpload('owner-id', 'listing-id', {
        contentType: 'image/png',
        sizeBytes: 100,
      }),
    ).rejects.toThrow('at most 5 images')
    expect(storage.createImageUpload).not.toHaveBeenCalled()
  })

  it('rejects an image key belonging to another user before reading storage', async () => {
    listing.findFirst.mockResolvedValue({
      id: 'listing-id',
      sellerId: 'owner-id',
    })
    await expect(
      service.completeImageUpload('owner-id', 'listing-id', {
        key: 'listings/other-user/listing-id/some-id.jpg',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(storage.verifyImage).not.toHaveBeenCalled()
  })

  it('prevents deleting another user’s saved search', async () => {
    savedSearch.findUnique.mockResolvedValue({
      id: 'search-id',
      userId: 'owner-id',
    })
    await expect(
      service.deleteSavedSearch('attacker-id', 'search-id'),
    ).rejects.toBeInstanceOf(ForbiddenException)
    expect(savedSearch.delete).not.toHaveBeenCalled()
  })

  it('deletes a saved search owned by the requesting user', async () => {
    savedSearch.findUnique.mockResolvedValue({
      id: 'search-id',
      userId: 'user-id',
    })
    savedSearch.delete.mockResolvedValue({ id: 'search-id' })
    await expect(
      service.deleteSavedSearch('user-id', 'search-id'),
    ).resolves.toEqual({ deleted: true })
    expect(savedSearch.delete).toHaveBeenCalledWith({
      where: { id: 'search-id' },
    })
  })
})
