import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { PrismaService } from '../prisma/prisma.service'
import { SafetyService } from './safety.service'

const reporterId = '11111111-1111-4111-8111-111111111111'
const ownerId = '22222222-2222-4222-8222-222222222222'
const listingId = '33333333-3333-4333-8333-333333333333'
const moderatorId = '44444444-4444-4444-8444-444444444444'
const reportId = '55555555-5555-4555-8555-555555555555'

describe('SafetyService', () => {
  const report = {
    id: reportId,
    targetType: 'LISTING',
    targetId: listingId,
    reason: 'SCAM',
    details: null,
    status: 'OPEN',
    createdAt: new Date('2026-09-23T12:00:00.000Z'),
    updatedAt: new Date('2026-09-23T12:00:00.000Z')
  }
  const prisma = {
    listing: { findFirst: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    user: { findFirst: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    message: { findUnique: jest.fn(), updateMany: jest.fn() },
    communityPost: { findFirst: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
    conversationParticipant: { findUnique: jest.fn() },
    report: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    blockedUser: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), deleteMany: jest.fn() },
    staffRoleAssignment: { findFirst: jest.fn() },
    moderationAction: { create: jest.fn() },
    $transaction: jest.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops))
  }
  let service: SafetyService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SafetyService, { provide: PrismaService, useValue: prisma }]
    }).compile()
    service = moduleRef.get(SafetyService)
  })

  beforeEach(() => {
    jest.clearAllMocks()
    prisma.$transaction.mockImplementation(async (ops: Array<Promise<unknown>>) => Promise.all(ops))
  })

  it('stores a listing report for someone else and only lists the caller’s reports', async () => {
    prisma.listing.findFirst.mockResolvedValue({ sellerId: ownerId })
    prisma.report.findUnique.mockResolvedValue(null)
    prisma.report.create.mockResolvedValue(report)
    prisma.report.findMany.mockResolvedValue([report])

    await expect(service.createReport(reporterId, {
      targetType: 'LISTING',
      targetId: listingId,
      reason: 'SCAM',
      details: '  <b>Fake</b> payment  '
    })).resolves.toEqual(report)

    expect(prisma.report.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ reporterId, details: 'Fake payment', status: 'OPEN' })
    }))

    await service.listMine(reporterId)
    expect(prisma.report.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { reporterId } }))
  })

  it('rejects a missing target, a self-report, and a duplicate', async () => {
    prisma.listing.findFirst.mockResolvedValueOnce(null)
    await expect(service.createReport(reporterId, { targetType: 'LISTING', targetId: listingId, reason: 'SPAM' })).rejects.toBeInstanceOf(NotFoundException)

    prisma.listing.findFirst.mockResolvedValueOnce({ sellerId: reporterId })
    await expect(service.createReport(reporterId, { targetType: 'LISTING', targetId: listingId, reason: 'SPAM' })).rejects.toBeInstanceOf(ConflictException)

    prisma.listing.findFirst.mockResolvedValue({ sellerId: ownerId })
    prisma.report.findUnique.mockResolvedValue({ id: reportId })
    await expect(service.createReport(reporterId, { targetType: 'LISTING', targetId: listingId, reason: 'SPAM' })).rejects.toThrow('You already reported this')
    expect(prisma.report.create).not.toHaveBeenCalled()
  })

  it('hides a message id from someone who is not in the conversation', async () => {
    prisma.message.findUnique.mockResolvedValue({ senderId: ownerId, conversationId: 'thread-1' })
    prisma.conversationParticipant.findUnique.mockResolvedValue(null)
    await expect(service.createReport(reporterId, {
      targetType: 'MESSAGE',
      targetId: '66666666-6666-4666-8666-666666666666',
      reason: 'HARASSMENT'
    })).rejects.toThrow('Report target not found')
  })

  it('blocks and unblocks another user, and refuses a self-block or a missing person', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: ownerId })
    prisma.blockedUser.findUnique.mockResolvedValue(null)
    prisma.blockedUser.create.mockResolvedValue({ blockedId: ownerId, createdAt: report.createdAt })
    await expect(service.block(reporterId, ownerId)).resolves.toEqual({ blocked: true, userId: ownerId, createdAt: report.createdAt })

    prisma.blockedUser.findUnique.mockResolvedValue({ id: 'block-1' })
    await expect(service.block(reporterId, ownerId)).rejects.toThrow('This person is already blocked')
    await expect(service.block(reporterId, reporterId)).rejects.toThrow('You cannot block yourself')

    prisma.user.findFirst.mockResolvedValue(null)
    await expect(service.block(reporterId, ownerId)).rejects.toBeInstanceOf(NotFoundException)

    prisma.blockedUser.deleteMany.mockResolvedValueOnce({ count: 1 })
    await expect(service.unblock(reporterId, ownerId)).resolves.toEqual({ blocked: false, userId: ownerId })
    prisma.blockedUser.deleteMany.mockResolvedValueOnce({ count: 0 })
    await expect(service.unblock(reporterId, ownerId)).rejects.toThrow('Block not found')
  })

  it('scopes the block list to the caller', async () => {
    prisma.blockedUser.findMany.mockResolvedValue([{ blockedId: ownerId, createdAt: report.createdAt }])
    await expect(service.listBlocks(reporterId)).resolves.toEqual([{ userId: ownerId, createdAt: report.createdAt }])
    expect(prisma.blockedUser.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { blockerId: reporterId } }))
  })

  it('refuses the moderation queue to a neighbor and hides a reported listing for staff', async () => {
    prisma.staffRoleAssignment.findFirst.mockResolvedValueOnce(null)
    await expect(service.listQueue(reporterId)).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.report.findMany).not.toHaveBeenCalled()

    prisma.staffRoleAssignment.findFirst.mockResolvedValue({ role: 'MODERATOR' })
    prisma.report.findUnique.mockResolvedValue({ id: reportId, status: 'OPEN', targetType: 'LISTING', targetId: listingId })
    prisma.listing.updateMany.mockResolvedValue({ count: 1 })
    prisma.report.update.mockResolvedValue({ ...report, status: 'RESOLVED' })
    prisma.moderationAction.create.mockResolvedValue({ id: 'action-1' })

    await expect(service.act(moderatorId, reportId, { kind: 'HIDE', note: ' <i>spam</i> ' })).resolves.toMatchObject({ status: 'RESOLVED' })
    expect(prisma.listing.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: listingId, deletedAt: null },
      data: expect.objectContaining({ status: 'ARCHIVED' })
    }))
    expect(prisma.moderationAction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'HIDE', note: 'spam', actorId: moderatorId })
    })
  })

  it('suspends the reported user and will not let staff suspend themselves', async () => {
    prisma.staffRoleAssignment.findFirst.mockResolvedValue({ role: 'ADMIN' })
    prisma.report.findUnique.mockResolvedValue({ id: reportId, status: 'OPEN', targetType: 'USER', targetId: moderatorId })
    await expect(service.act(moderatorId, reportId, { kind: 'SUSPEND_USER' })).rejects.toThrow('You cannot change your own account from this report')

    prisma.report.findUnique.mockResolvedValue({ id: reportId, status: 'OPEN', targetType: 'USER', targetId: ownerId })
    prisma.user.updateMany.mockResolvedValue({ count: 1 })
    prisma.report.update.mockResolvedValue({ ...report, status: 'RESOLVED' })
    prisma.moderationAction.create.mockResolvedValue({ id: 'action-2' })
    await service.act(moderatorId, reportId, { kind: 'SUSPEND_USER' })
    expect(prisma.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: ownerId }),
      data: { status: 'SUSPENDED' }
    }))
  })

  it('returns 409 when the report is already closed and 404 when it is missing', async () => {
    prisma.staffRoleAssignment.findFirst.mockResolvedValue({ role: 'MODERATOR' })
    prisma.report.findUnique.mockResolvedValueOnce(null)
    await expect(service.act(moderatorId, reportId, { kind: 'DISMISS' })).rejects.toBeInstanceOf(NotFoundException)

    prisma.report.findUnique.mockResolvedValueOnce({ id: reportId, status: 'DISMISSED', targetType: 'LISTING', targetId: listingId })
    await expect(service.act(moderatorId, reportId, { kind: 'DISMISS' })).rejects.toBeInstanceOf(ConflictException)
  })
})
