import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { SafetyService } from './safety.service'

describe('SafetyService', () => {
  const user = { findFirst: jest.fn(), findUnique: jest.fn() }
  const blockedUser = { upsert: jest.fn(), findFirst: jest.fn() }
  const report = { findFirst: jest.fn(), create: jest.fn() }
  const service = new SafetyService({ user, blockedUser, report } as unknown as PrismaService)

  beforeEach(() => jest.clearAllMocks())

  it('prevents self-blocking', async () => {
    await expect(service.block('same-user', 'same-user')).rejects.toBeInstanceOf(BadRequestException)
    expect(blockedUser.upsert).not.toHaveBeenCalled()
  })

  it('checks blocks in both directions before allowing interaction', async () => {
    blockedUser.findFirst.mockResolvedValue({ blockerId: 'second' })
    await expect(service.assertInteractionAllowed('first', 'second')).rejects.toBeInstanceOf(ForbiddenException)
    expect(blockedUser.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { OR: [
      { blockerId: 'first', blockedId: 'second' },
      { blockerId: 'second', blockedId: 'first' },
    ] } }))
  })

  it('prevents duplicate open reports for the same target', async () => {
    user.findUnique.mockResolvedValue({ id: 'target' })
    report.findFirst.mockResolvedValue({ id: 'existing' })
    await expect(service.report('reporter', {
      targetType: 'USER',
      targetId: 'target',
      reason: 'Repeated unsafe behavior',
    })).rejects.toBeInstanceOf(ConflictException)
    expect(report.create).not.toHaveBeenCalled()
  })
})

