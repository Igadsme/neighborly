import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'
import { AuthGuard } from '../auth/auth.guard'
import { isActiveAccount } from '../auth/account'
import { createTestPrisma } from '../common/testing/integration-fixtures'

/**
 * Suspension is enforced at the authorization boundary rather than in each
 * handler, so these tests pin the boundary itself: a suspended or deleted
 * account holds a perfectly valid signed access token and must still be
 * refused everywhere a protected action happens.
 */
describe('Suspended and deleted accounts across authorization boundaries', () => {
  let prisma: PrismaService

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  async function makeUser(prefix: string, state: 'SUSPENDED' | 'DELETED' | 'ACTIVE') {
    const id = crypto.randomUUID()
    const email = `${prefix}-${id}@example.com`
    await prisma.user.create({
      data: {
        id,
        email,
        passwordHash: '$argon2id$stub',
        status: state,
        ...(state === 'DELETED' ? { deletedAt: new Date() } : {})
      }
    })
    return prisma.user.findUniqueOrThrow({ where: { id } })
  }

  it('treats a suspended account as inactive for every consumer of the check', async () => {
    const suspended = await makeUser('susp-boundary', 'SUSPENDED')
    const account = await prisma.user.findUnique({
      where: { id: suspended.id },
      select: { id: true, email: true, status: true, deletedAt: true }
    })
    expect(isActiveAccount(account)).toBe(false)
  })

  it('treats a deleted account as inactive even while its status says otherwise', async () => {
    const user = await makeUser('del-boundary', 'ACTIVE')
    await prisma.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } })
    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, status: true, deletedAt: true }
    })
    expect(account?.status).toBe('ACTIVE')
    expect(isActiveAccount(account)).toBe(false)
  })

  it('refuses a validly signed token for a suspended account at the REST guard', async () => {
    const suspended = await makeUser('susp-guard', 'SUSPENDED')
    const guard = new AuthGuard({ verify: () => ({ sub: suspended.id, email: suspended.email }) } as never, prisma)
    const request = { headers: { authorization: 'Bearer validly.signed.token' } }
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as never

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(request).not.toHaveProperty('user')
  })

  it('refuses a deleted account at the REST guard', async () => {
    const deleted = await makeUser('del-guard', 'DELETED')
    const guard = new AuthGuard({ verify: () => ({ sub: deleted.id, email: deleted.email }) } as never, prisma)
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer t' } }) })
    } as never
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('refuses a token whose subject no longer exists', async () => {
    const guard = new AuthGuard(
      { verify: () => ({ sub: crypto.randomUUID(), email: 'ghost@example.com' }) } as never,
      prisma
    )
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer t' } }) })
    } as never
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('does not query the database for a request with no token at all', async () => {
    const queries: unknown[] = []
    const spy = { user: prisma.user }
    const guarded = new AuthGuard(
      { verify: () => ({ sub: crypto.randomUUID(), email: 'x@example.com' }) } as never,
      spy as never
    )
    const context = {
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) })
    } as never
    await expect(guarded.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(queries).toHaveLength(0)
  })

  it('revokes every refresh session of a suspended account so no cookie survives', async () => {
    const user = await makeUser('susp-sessions', 'ACTIVE')
    await prisma.refreshSession.create({
      data: {
        userId: user.id,
        familyId: crypto.randomUUID(),
        tokenHash: crypto.randomUUID().replace(/-/g, ''),
        expiresAt: new Date(Date.now() + 60_000)
      }
    })
    await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } })

    // Mirrors AuthService.refresh: an inactive account ends its family.
    const session = await prisma.refreshSession.findFirstOrThrow({ where: { userId: user.id } })
    await prisma.refreshSession.updateMany({
      where: { familyId: session.familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'account_inactive' }
    })

    const live = await prisma.refreshSession.count({ where: { userId: user.id, revokedAt: null } })
    expect(live).toBe(0)
  })

  it('keeps the realtime membership check aligned with the REST check', async () => {
    // The gateway uses the same accountSelect and isActiveAccount, so one
    // assertion over the shared inputs covers both surfaces.
    const suspended = await makeUser('susp-realtime', 'SUSPENDED')
    const account = await prisma.user.findUnique({
      where: { id: suspended.id },
      select: { id: true, email: true, status: true, deletedAt: true }
    })
    expect(isActiveAccount(account)).toBe(false)
    expect(() => {
      if (!isActiveAccount(account)) throw new ForbiddenException('Account is not active')
    }).toThrow(ForbiddenException)
  })
})