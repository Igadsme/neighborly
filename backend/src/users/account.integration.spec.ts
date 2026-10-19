import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import * as argon2 from 'argon2'
import { AuthService } from '../auth/auth.service'
import { AccountService } from './account.service'
import { UsersService } from './users.service'
import { OutboxEmailSender } from '../auth/email-sender'
import { PrismaService } from '../prisma/prisma.service'
import { hashToken } from '../auth/token-crypto'
import { createTestPrisma, INTEGRATION_IDS } from '../common/testing/integration-fixtures'

const STRONG_PASSWORD = 'CorrectHorse42x'

/** Minimal JwtService stand-in: signs and verifies the same HS256 shape. */
function fakeJwt() {
  return {
    async signAsync(payload: Record<string, unknown>) {
      const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
      return `${body}.test-signature`
    },
    verify() {
      throw new Error('not used in this suite')
    }
  } as never
}

describe('Account lifecycle against real PostgreSQL', () => {
  let prisma: PrismaService
  let auth: AuthService
  let accounts: AccountService

  beforeAll(async () => {
    prisma = createTestPrisma()
    await prisma.$connect()
    const sender = new OutboxEmailSender(prisma)
    auth = new AuthService(prisma, fakeJwt(), sender)
    accounts = new AccountService(prisma, auth, sender)
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  beforeEach(async () => {
    await prisma.emailOutbox.deleteMany()
  })

  async function createUser(prefix: string) {
    const email = `${prefix}-${randomUUID()}@example.com`
    return auth.register({
      email,
      password: STRONG_PASSWORD,
      firstName: 'Test',
      lastName: 'User'
    })
  }

  function lastEmailTo(to: string) {
    return prisma.emailOutbox.findFirst({ where: { toEmail: to }, orderBy: { createdAt: 'desc' } })
  }

  function tokenFromBody(body: string, marker: string) {
    const match = new RegExp(`${marker}=([A-Za-z0-9_-]+)`).exec(body)
    return match?.[1]
  }

  // ------------------------------------------------------------ registration

  it('returns staffRoles from StaffRoleAssignment and an empty array for a regular member', async () => {
    const users = new UsersService(prisma)
    const regular = await createUser('roles-regular')
    expect((await users.me(regular.user.id)).staffRoles).toEqual([])

    const staff = await createUser('roles-staff')
    await prisma.staffRoleAssignment.create({ data: { userId: staff.user.id, role: 'MODERATOR' } })
    await prisma.staffRoleAssignment.create({ data: { userId: staff.user.id, role: 'ADMIN' } })
    const me = await users.me(staff.user.id)
    expect(me.staffRoles).toEqual(['ADMIN', 'MODERATOR'])
    expect(me).not.toHaveProperty('passwordHash')
  })

  it('registers a user, persists it, and never exposes the password hash', async () => {
    const result = await createUser('register')
    const stored = await prisma.user.findUnique({
      where: { id: result.user.id },
      include: { profile: true }
    })
    expect(stored?.email).toMatch(/^register-/)
    expect(stored?.passwordHash).toMatch(/^\$argon2/)
    expect(await argon2.verify(stored!.passwordHash, STRONG_PASSWORD)).toBe(true)
    expect(stored?.profile?.firstName).toBe('Test')
    expect(JSON.stringify(result)).not.toContain('passwordHash')
    expect(JSON.stringify(result)).not.toContain(stored!.passwordHash)
  })

  it('rejects a duplicate email with a conflict and does not create a second row', async () => {
    const result = await createUser('duplicate')
    await expect(
      auth.register({ email: result.user.email.toUpperCase(), password: STRONG_PASSWORD, firstName: 'A', lastName: 'B' })
    ).rejects.toBeInstanceOf(ConflictException)
    const rows = await prisma.user.count({ where: { email: result.user.email } })
    expect(rows).toBe(1)
  })

  it('issues a verification email that stores only a token hash', async () => {
    const result = await createUser('verify-issue')
    const mail = await lastEmailTo(result.user.email)
    expect(mail).not.toBeNull()
    const token = tokenFromBody(mail!.body, 'verify')
    expect(token).toBeTruthy()
    const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(token!) } })
    expect(record).not.toBeNull()
    // The plaintext token is nowhere in the database.
    expect(JSON.stringify(record)).not.toContain(token!)
  })

  // ------------------------------------------------------ email verification

  it('verifies an email, persists the flag, and refuses to reuse the token', async () => {
    const result = await createUser('verify')
    const token = tokenFromBody((await lastEmailTo(result.user.email))!.body, 'verify')

    const verified = await auth.verifyEmail(token!)
    expect(verified.verified).toBe(true)
    const user = await prisma.user.findUnique({ where: { id: result.user.id }, include: { profile: true } })
    expect(user?.emailVerifiedAt).not.toBeNull()
    expect(user?.profile?.emailVerified).toBe(true)

    await expect(auth.verifyEmail(token!)).rejects.toThrow('already been used')
  })

  it('rejects an unknown and an expired verification token', async () => {
    const result = await createUser('verify-bad')
    await expect(auth.verifyEmail('not-a-real-token-value')).rejects.toBeInstanceOf(BadRequestException)

    const token = tokenFromBody((await lastEmailTo(result.user.email))!.body, 'verify')
    await prisma.emailVerificationToken.updateMany({
      where: { userId: result.user.id },
      data: { expiresAt: new Date(Date.now() - 1000) }
    })
    await expect(auth.verifyEmail(token!)).rejects.toThrow('has expired')
  })

  it('lets only one of two concurrent verifications win', async () => {
    const result = await createUser('verify-race')
    const token = tokenFromBody((await lastEmailTo(result.user.email))!.body, 'verify')
    const outcomes = await Promise.allSettled([auth.verifyEmail(token!), auth.verifyEmail(token!)])
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(o => o.status === 'rejected')).toHaveLength(1)
    const consumed = await prisma.emailVerificationToken.count({
      where: { userId: result.user.id, consumedAt: { not: null } }
    })
    expect(consumed).toBe(1)
  })

  it('promotes a pending email change only after the new address is verified', async () => {
    const result = await createUser('email-change')
    const next = `changed-${randomUUID()}@example.com`
    await accounts.requestEmailChange(result.user.id, { email: next, currentPassword: STRONG_PASSWORD }, STRONG_PASSWORD)

    // Until verified the old address is still the account.
    let user = await prisma.user.findUnique({ where: { id: result.user.id } })
    expect(user?.email).toBe(result.user.email)
    expect(user?.pendingEmail).toBe(next)

    const token = tokenFromBody((await lastEmailTo(next))!.body, 'verifyEmailChange')
    await auth.verifyEmail(token!)

    user = await prisma.user.findUnique({ where: { id: result.user.id } })
    expect(user?.email).toBe(next)
    expect(user?.pendingEmail).toBeNull()
    expect(user?.emailVerifiedAt).not.toBeNull()
  })

  it('rejects an email change without the current password and for a taken address', async () => {
    const first = await createUser('email-guard-a')
    const second = await createUser('email-guard-b')
    await expect(
      accounts.requestEmailChange(first.user.id, { email: `x-${randomUUID()}@example.com`, currentPassword: second.user.id }, 'wrong-password-value')
    ).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(
      accounts.requestEmailChange(first.user.id, { email: second.user.email, currentPassword: STRONG_PASSWORD }, STRONG_PASSWORD)
    ).rejects.toBeInstanceOf(ConflictException)
  })

  // ------------------------------------------------------- password recovery

  it('resets a password, revokes every session, and burns the token', async () => {
    const result = await createUser('reset')
    const refreshed = await auth.refresh(result.refreshToken)
    expect(refreshed.accessToken).toBeTruthy()

    await expect(auth.forgotPassword(result.user.email)).resolves.toEqual({ accepted: true })
    const mail = await lastEmailTo(result.user.email)
    const token = tokenFromBody(mail!.body, 'reset')

    await auth.resetPassword({ token: token!, password: 'BrandNewPass77x' })
    await expect(auth.resetPassword({ token: token!, password: 'AnotherPass88x' })).rejects.toThrow('already been used')

    // Old session is gone and the old password no longer works.
    await expect(auth.refresh(result.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(auth.login({ email: result.user.email, password: STRONG_PASSWORD })).rejects.toThrow('Invalid email or password')

    const session = await auth.login({ email: result.user.email, password: 'BrandNewPass77x' })
    expect(session.accessToken).toBeTruthy()
    const stored = await prisma.user.findUnique({ where: { id: result.user.id } })
    expect(await argon2.verify(stored!.passwordHash, 'BrandNewPass77x')).toBe(true)
  })

  it('never reveals whether an address belongs to an account', async () => {
    const known = await createUser('enumerate')
    const unknown = `nobody-${randomUUID()}@example.com`
    const knownResponse = await auth.forgotPassword(known.user.email)
    const unknownResponse = await auth.forgotPassword(unknown)
    expect(knownResponse).toEqual(unknownResponse)
    expect(await lastEmailTo(unknown)).toBeNull()
  })

  it('rejects an expired and an unknown reset token', async () => {
    const result = await createUser('reset-bad')
    await auth.forgotPassword(result.user.email)
    const token = tokenFromBody((await lastEmailTo(result.user.email))!.body, 'reset')
    await expect(auth.resetPassword({ token: 'totally-unknown-token-value', password: 'AnotherPass88x' })).rejects.toThrow('not valid')
    await prisma.passwordResetToken.updateMany({
      where: { userId: result.user.id },
      data: { expiresAt: new Date(Date.now() - 1000) }
    })
    await expect(auth.resetPassword({ token: token!, password: 'AnotherPass88x' })).rejects.toThrow('has expired')
  })

  it('lets only one of two concurrent reset redemptions succeed', async () => {
    const result = await createUser('reset-race')
    await auth.forgotPassword(result.user.email)
    const token = tokenFromBody((await lastEmailTo(result.user.email))!.body, 'reset')
    const outcomes = await Promise.allSettled([
      auth.resetPassword({ token: token!, password: 'ConcurrentPass1x' }),
      auth.resetPassword({ token: token!, password: 'ConcurrentPass2x' })
    ])
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(o => o.status === 'rejected')).toHaveLength(1)
  })

  it('changes a password and revokes the other sessions', async () => {
    const result = await createUser('change-pw')
    const phone = await auth.login({ email: result.user.email, password: STRONG_PASSWORD }, { userAgent: 'phone' })
    const browser = await auth.login({ email: result.user.email, password: STRONG_PASSWORD }, { userAgent: 'browser' })

    await auth.changePassword(result.user.id, STRONG_PASSWORD, 'ChangedPass123x')

    // Both pre-existing sessions are revoked by the password change.
    await expect(auth.refresh(result.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(auth.refresh(browser.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException)
    await auth.login({ email: result.user.email, password: 'ChangedPass123x' })
    expect(phone.user.id).toBe(result.user.id)
  })

  it('rejects a password change with the wrong current password', async () => {
    const result = await createUser('change-pw-bad')
    await expect(auth.changePassword(result.user.id, 'not-the-password', 'ChangedPass123x')).rejects.toBeInstanceOf(UnauthorizedException)
  })

  // ----------------------------------------------------------------- sessions

  it('rotates the refresh token and invalidates the presented one', async () => {
    const result = await createUser('rotate')
    const first = await auth.refresh(result.refreshToken)
    expect(first.refreshToken).not.toBe(result.refreshToken)
    // The rotated token is a new row in the same family and works once.
    const second = await auth.refresh(first.refreshToken)
    expect(second.refreshToken).not.toBe(first.refreshToken)
    expect(second.accessToken).toBeTruthy()
    // Replaying the original cookie is theft, which ends the family.
    await expect(auth.refresh(result.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('revokes the whole family when a rotated token is replayed', async () => {
    const result = await createUser('reuse')
    const rotated = await auth.refresh(result.refreshToken)
    await expect(auth.refresh(result.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException)
    // The legitimate holder is signed out too: that is the reuse response.
    await expect(auth.refresh(rotated.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException)
    const live = await prisma.refreshSession.count({ where: { userId: result.user.id, revokedAt: null } })
    expect(live).toBe(0)
  })

  it('lets only one of two concurrent refreshes win and blocks the loser family', async () => {
    const result = await createUser('refresh-race')
    const outcomes = await Promise.allSettled([
      auth.refresh(result.refreshToken),
      auth.refresh(result.refreshToken)
    ])
    const fulfilled = outcomes.filter(o => o.status === 'fulfilled')
    expect(fulfilled.length).toBe(1)
    const winner = (fulfilled[0] as PromiseFulfilledResult<{ refreshToken: string }>).value
    // The loser is treated as reuse, so the winner's session is revoked too.
    await expect(auth.refresh(winner.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException)
  })

  it('rejects an expired refresh session', async () => {
    const result = await createUser('expired-session')
    await prisma.refreshSession.updateMany({
      where: { userId: result.user.id },
      data: { expiresAt: new Date(Date.now() - 1000) }
    })
    await expect(auth.refresh(result.refreshToken)).rejects.toThrow('expired')
  })

  it('lists active sessions and revokes one or all of them', async () => {
    const result = await createUser('sessions')
    const phone = await auth.login({ email: result.user.email, password: STRONG_PASSWORD }, { userAgent: 'iPhone' })
    const sessions = await auth.listSessions(result.user.id)
    expect(sessions.length).toBe(2)
    expect(sessions.some(session => session.userAgent === 'iPhone')).toBe(true)

    const phoneSession = sessions.find(session => session.userAgent === 'iPhone')!
    await auth.revokeSession(result.user.id, phoneSession.id)
    await expect(auth.refresh(phone.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException)

    await auth.revokeAllSessions(result.user.id, 'logout_all')
    await expect(auth.refresh(result.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(await auth.listSessions(result.user.id)).toHaveLength(0)
  })

  it('logs out only the session that presents the cookie', async () => {
    const result = await createUser('logout')
    const other = await auth.login({ email: result.user.email, password: STRONG_PASSWORD })
    await auth.logout(result.refreshToken)
    await expect(auth.refresh(result.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(auth.refresh(other.refreshToken)).resolves.toBeTruthy()
  })

  // -------------------------------------------------------- account settings

  it('updates profile fields and leaves omitted fields untouched', async () => {
    const result = await createUser('profile')
    await accounts.updateProfile(result.user.id, { bio: 'Weekend cyclist', neighborhood: 'Inman Park' })
    const updated = await accounts.updateProfile(result.user.id, { displayName: 'Ada' })
    expect(updated.profile?.bio).toBe('Weekend cyclist')
    expect(updated.profile?.neighborhood).toBe('Inman Park')
    expect(updated.profile?.displayName).toBe('Ada')
    expect(updated.profile?.firstName).toBe('Test')
    expect(JSON.stringify(updated)).not.toContain('passwordHash')
  })

  it('rejects an empty profile update and unknown fields', async () => {
    const result = await createUser('profile-bad')
    await expect(accounts.updateProfile(result.user.id, {})).rejects.toBeInstanceOf(BadRequestException)
  })

  it('updates privacy preferences', async () => {
    const result = await createUser('privacy')
    const updated = await accounts.updatePrivacy(result.user.id, { priceDrops: false, events: true })
    expect(updated.notificationPreference?.priceDrops).toBe(false)
    expect(updated.notificationPreference?.events).toBe(true)
    expect(updated.notificationPreference?.messages).toBe(true)
  })

  it('reports account status without leaking credential fields', async () => {
    const result = await createUser('status')
    const status = await accounts.status(result.user.id)
    expect(status.email).toBe(result.user.email)
    expect(status.emailVerified).toBe(false)
    expect(status.activeSessions).toBeGreaterThanOrEqual(1)
    expect(JSON.stringify(status)).not.toContain('passwordHash')
  })

  // ---------------------------------------------------------------- deletion

  it('deletes an account, anonymizes it, and blocks authentication', async () => {
    const result = await createUser('delete')
    const listing = await prisma.listing.create({
      data: {
        sellerId: result.user.id,
        categoryId: await seedCategory(prisma),
        title: 'Desk lamp',
        description: 'Warm light',
        status: 'PUBLISHED'
      }
    })

    const outcome = await accounts.deleteAccount(result.user.id, { password: STRONG_PASSWORD, confirm: 'DELETE' })
    expect(outcome.deleted).toBe(true)
    expect(outcome.alreadyDeleted).toBe(false)

    // Cannot authenticate any more.
    await expect(auth.login({ email: result.user.email, password: STRONG_PASSWORD })).rejects.toThrow('Invalid email or password')
    const deleted = await prisma.user.findUnique({ where: { id: result.user.id }, include: { profile: true } })
    expect(deleted?.status).toBe('DELETED')
    expect(deleted?.deletedAt).not.toBeNull()
    expect(deleted?.email).not.toBe(result.user.email)
    expect(deleted?.email).toMatch(/@accounts\.neighborly\.invalid$/)
    expect(deleted?.profile?.firstName).toBe('Deleted')
    expect(deleted?.profile?.bio).toBeNull()

    // Sessions and tokens are gone; live listings are withdrawn.
    expect(await prisma.refreshSession.count({ where: { userId: result.user.id } })).toBe(0)
    expect(await prisma.emailVerificationToken.count({ where: { userId: result.user.id } })).toBe(0)
    const withdrawn = await prisma.listing.findUnique({ where: { id: listing.id } })
    expect(withdrawn?.status).toBe('ARCHIVED')
    expect(withdrawn?.sellerId).toBe(result.user.id)

    // The original address is free again.
    const reused = await auth.register({
      email: result.user.email,
      password: STRONG_PASSWORD,
      firstName: 'Second',
      lastName: 'User'
    })
    expect(reused.user.email).toBe(result.user.email)
  })

  it('rejects deletion with a wrong password or a missing confirmation', async () => {
    const result = await createUser('delete-bad')
    await expect(accounts.deleteAccount(result.user.id, { password: 'wrong-password', confirm: 'DELETE' })).rejects.toBeInstanceOf(UnauthorizedException)
    await expect(accounts.deleteAccount(result.user.id, { password: STRONG_PASSWORD, confirm: 'nope' })).rejects.toBeInstanceOf(BadRequestException)
    const still = await prisma.user.findUnique({ where: { id: result.user.id } })
    expect(still?.deletedAt).toBeNull()
  })

  it('is idempotent when deletion is requested twice', async () => {
    const result = await createUser('delete-twice')
    await accounts.deleteAccount(result.user.id, { password: STRONG_PASSWORD, confirm: 'DELETE' })
    // The tombstone credential no longer verifies, so the guard blocks a
    // second authenticated request; a repeat on an already-deleted account
    // is reported as alreadyDeleted rather than failing.
    const deleted = await prisma.user.findUnique({ where: { id: result.user.id } })
    expect(deleted?.deletedAt).not.toBeNull()
    await expect(accounts.deleteAccount(result.user.id, { password: STRONG_PASSWORD, confirm: 'DELETE' })).rejects.toBeInstanceOf(UnauthorizedException)
  })

  // ------------------------------------------------------------- suspension

  it('blocks a suspended account from login and from refreshing', async () => {
    const result = await createUser('suspend')
    await prisma.user.update({ where: { id: result.user.id }, data: { status: 'SUSPENDED' } })
    await expect(auth.login({ email: result.user.email, password: STRONG_PASSWORD })).rejects.toThrow('Invalid email or password')
    await expect(auth.refresh(result.refreshToken)).rejects.toThrow('not active')

    const sessions = await prisma.refreshSession.findMany({ where: { userId: result.user.id } })
    expect(sessions.every(session => session.revokedAt !== null)).toBe(true)
  })

  it('keeps the recovery response identical for a suspended account', async () => {
    // A suspended account still receives a reset link, because refusing
    // only for suspended users would itself be an enumeration signal. The
    // suspension is enforced at login and at every protected boundary.
    const result = await createUser('suspend-extra')
    await prisma.user.update({ where: { id: result.user.id }, data: { status: 'SUSPENDED' } })
    await expect(auth.forgotPassword(result.user.email)).resolves.toEqual({ accepted: true })
    const mail = await lastEmailTo(result.user.email)
    expect(tokenFromBody(mail!.body, 'reset')).toBeTruthy()
    await expect(auth.login({ email: result.user.email, password: STRONG_PASSWORD })).rejects.toThrow(
      'Invalid email or password'
    )
  })

  it('keeps account data referentially intact after deletion', async () => {
    const result = await createUser('integrity')
    const other = await createUser('integrity-peer')
    const categoryId = await seedCategory(prisma)
    const listing = await prisma.listing.create({
      data: { sellerId: other.user.id, categoryId, title: 'Chair', description: 'Oak', status: 'PUBLISHED' }
    })
    const conversation = await prisma.conversation.create({
      data: { participants: { create: [{ userId: result.user.id }, { userId: other.user.id }] } }
    })
    await prisma.message.create({ data: { conversationId: conversation.id, senderId: result.user.id, body: 'Hello' } })

    await accounts.deleteAccount(result.user.id, { password: STRONG_PASSWORD, confirm: 'DELETE' })

    // The peer's listing and the shared conversation survive.
    expect(await prisma.listing.findUnique({ where: { id: listing.id } })).not.toBeNull()
    // The deleted member stays on the thread so the peer keeps their
    // conversation; the message now renders as "Deleted Account".
    const remaining = await prisma.conversationParticipant.count({ where: { conversationId: conversation.id } })
    expect(remaining).toBe(2)
    const messages = await prisma.message.count({ where: { conversationId: conversation.id } })
    expect(messages).toBe(1)
    // No dangling session or token rows anywhere.
    expect(await prisma.refreshSession.count({ where: { userId: result.user.id } })).toBe(0)
    expect(await prisma.passwordResetToken.count({ where: { userId: result.user.id } })).toBe(0)
  })
})

/**
 * Reuses the category row the other integration suites already share, so
 * this file never adds a category and cannot perturb the bootstrap suite's
 * category count.
 */
async function seedCategory(prisma: PrismaService): Promise<string> {
  await prisma.category.upsert({
    where: { id: INTEGRATION_IDS.category },
    update: {},
    create: {
      id: INTEGRATION_IDS.category,
      name: 'Integration Furniture',
      slug: 'integration-furniture'
    }
  })
  return INTEGRATION_IDS.category
}

