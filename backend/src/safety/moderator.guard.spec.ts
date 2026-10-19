import { ForbiddenException } from '@nestjs/common'
import { ModeratorGuard } from './moderator.guard'

describe('ModeratorGuard', () => {
  const context = { switchToHttp: () => ({ getRequest: () => ({ user: { id: 'user-1' } }) }) } as any

  it('rejects a suspended moderator', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ role: 'MODERATOR', status: 'SUSPENDED' }) } } as any
    await expect(new ModeratorGuard(prisma).canActivate(context)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects a regular user even when active', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ role: 'USER', status: 'ACTIVE' }) } } as any
    await expect(new ModeratorGuard(prisma).canActivate(context)).rejects.toBeInstanceOf(ForbiddenException)
  })
})
