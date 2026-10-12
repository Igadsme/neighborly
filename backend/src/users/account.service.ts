import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { audit } from '../common/logger'
import { sanitizeOptional, sanitizeText } from '../common/text'
import { PrismaService } from '../prisma/prisma.service'
import { AuthService } from '../auth/auth.service'
import { EMAIL_SENDER, EmailSender } from '../auth/email-sender'
import { issueToken } from '../auth/token-crypto'
import { emailChangeLink, EMAIL_CHANGE_TTL_MS } from '../auth/email-links'
import { ChangeEmailDto, DeleteAccountDto, UpdatePrivacyDto, UpdateProfileDto } from './dto'

/**
 * Account settings, privacy, email changes, and deletion.
 *
 * Every route is scoped by the authenticated user id taken from the
 * verified access token. No route accepts a user id in the body, so a
 * caller cannot target another account, and no DTO property maps onto a
 * column other than the ones written here, which is what keeps mass
 * assignment off the table.
 */
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    @Inject(EMAIL_SENDER) private readonly sender: EmailSender
  ) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        status: true,
        emailVerifiedAt: true,
        pendingEmail: true,
        deletionRequestedAt: true,
        createdAt: true,
        profile: { select: { emailVerified: true, avatarUrl: true } }
      }
    })
    if (!user) throw new NotFoundException('User not found')
    const activeSessions = await this.prisma.refreshSession.count({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } }
    })
    return {
      id: user.id,
      email: user.email,
      status: user.status,
      emailVerified: Boolean(user.emailVerifiedAt) && Boolean(user.profile?.emailVerified),
      pendingEmail: user.pendingEmail,
      avatarUrl: user.profile?.avatarUrl ?? null,
      deletionRequestedAt: user.deletionRequestedAt,
      activeSessions,
      memberSince: user.createdAt
    }
  }

  async listSessions(userId: string) {
    const sessions = await this.prisma.refreshSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true, userAgent: true, ipAddress: true, createdAt: true, lastUsedAt: true, expiresAt: true }
    })
    return sessions
  }

  async revokeSession(userId: string, sessionId: string) {
    await this.auth.revokeSession(userId, sessionId)
  }

  async logoutAll(userId: string) {
    await this.auth.revokeAllSessions(userId, 'logout_all')
  }

  /**
   * Partial update of the caller's own profile. `undefined` leaves a field
   * alone and an explicit empty string clears it, so no field is silently
   * lost by omitting one.
   */
  async updateProfile(userId: string, input: UpdateProfileDto) {
    const data: Record<string, unknown> = {}
    if (input.firstName !== undefined) data.firstName = sanitizeText(input.firstName, 80)
    if (input.lastName !== undefined) data.lastName = sanitizeText(input.lastName, 80)
    if (input.displayName !== undefined) data.displayName = sanitizeOptional(input.displayName, 80)
    if (input.bio !== undefined) data.bio = sanitizeOptional(input.bio, 500)
    if (input.neighborhood !== undefined) data.neighborhood = sanitizeOptional(input.neighborhood, 80)
    if (input.city !== undefined) data.city = sanitizeOptional(input.city, 80)
    if (input.state !== undefined) data.state = sanitizeOptional(input.state, 40)
    if (Object.keys(data).length === 0) throw new BadRequestException('No profile fields to update')
    await this.assertProfile(userId)
    await this.prisma.profile.update({ where: { userId }, data })
    audit('account.profile.updated', { userId, fields: Object.keys(data) })
    return this.me(userId)
  }

  /**
   * Avatar URL is set from a validated upload path only. There is no
   * upload route in this release (multipart is refused at the edge), so
   * this service never writes `avatarUrl` from client input.
   */
  async updatePrivacy(userId: string, input: UpdatePrivacyDto) {
    await this.assertProfile(userId)
    await this.prisma.notificationPreference.upsert({
      where: { userId },
      create: { userId, ...preferenceData(input) },
      update: preferenceData(input)
    })
    audit('account.privacy.updated', { userId })
    return this.me(userId)
  }

  /**
   * Changing the address is verify-then-promote. The account keeps the old
   * address until the new one is verified, so a typo cannot lock the owner
   * out, and reauthentication is required to start the flow.
   */
  async requestEmailChange(userId: string, input: ChangeEmailDto, currentPassword: string) {
    await this.auth.assertPassword(userId, currentPassword)
    const next = input.email.trim().toLowerCase()
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, pendingEmail: true }
    })
    if (!user) throw new NotFoundException('User not found')
    if (next === user.email) throw new BadRequestException('That is already your email address')
    if (user.pendingEmail === next) throw new BadRequestException('Verification is already pending for that address')
    const taken = await this.prisma.user.findUnique({ where: { email: next }, select: { id: true } })
    if (taken && taken.id !== userId) throw new ConflictException('That email address is already in use')

    const { token, tokenHash } = issueToken()
    await this.prisma.$transaction([
      // Burn outstanding verification links so only the newest one works.
      this.prisma.emailVerificationToken.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: new Date() }
      }),
      this.prisma.emailVerificationToken.create({
        data: { userId, tokenHash, email: next, expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS) }
      }),
      this.prisma.user.update({ where: { id: userId }, data: { pendingEmail: next, pendingEmailAt: new Date() } })
    ])
    await this.sender.send({
      to: next,
      subject: 'Confirm your new Neighborly email address',
      body: [
        'Confirm this address to finish changing the email on your Neighborly account.',
        '',
        emailChangeLink(token),
        '',
        'The link expires in 24 hours and can only be used once.',
        'Your current address stays active until this is confirmed. If you did not request this, ignore it and change your password.'
      ].join('\n')
    })
    audit('account.email.change_requested', { userId })
    return { pendingEmail: next }
  }

  async cancelEmailChange(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { pendingEmail: null, pendingEmailAt: null } })
    audit('account.email.change_cancelled', { userId })
    return { pendingEmail: null }
  }

  /**
   * Soft deletion with anonymization.
   *
   * The `User` row survives so no foreign key is ever orphaned, but it is
   * made unusable in one transaction: credentials and sessions are gone,
   * the address becomes a unique non-routable tombstone, the profile is
   * reduced to "Deleted Account", and live content is withdrawn while
   * other members' threads are preserved.
   *
   * Full rationale, including what is retained and why, is in
   * docs/ACCOUNT_DELETION.md.
   */
  async deleteAccount(userId: string, input: DeleteAccountDto) {
    await this.auth.assertPassword(userId, input.password)
    if (input.confirm !== 'DELETE') {
      throw new BadRequestException('Type DELETE to confirm account deletion')
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true, deletedAt: true }
    })
    if (!user) throw new NotFoundException('User not found')
    // Idempotent: repeating the request reports the same outcome and does
    // not fail, which keeps a double-clicked button harmless.
    if (user.deletedAt) {
      return { deleted: true, alreadyDeleted: true, deletedAt: user.deletedAt }
    }

    const deletedAt = new Date()
    await this.prisma.$transaction(async tx => {
      // Credentials and sessions first: even a rollback leaves nothing
      // usable behind, and a commit leaves no way back in.
      await tx.refreshSession.deleteMany({ where: { userId } })
      await tx.emailVerificationToken.deleteMany({ where: { userId } })
      await tx.passwordResetToken.deleteMany({ where: { userId } })
      await tx.emailOutbox.deleteMany({ where: { toEmail: user.email } })
      // Personal, non-shared state.
      await tx.favorite.deleteMany({ where: { userId } })
      await tx.savedSearch.deleteMany({ where: { userId } })
      await tx.userPreference.deleteMany({ where: { userId } })
      await tx.notificationPreference.deleteMany({ where: { userId } })
      await tx.blockedUser.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } })
      await tx.report.deleteMany({ where: { reporterId: userId } })
      await tx.transactionParticipant.deleteMany({ where: { userId } })
      // Withdraw anything still live for sale; completed history stays.
      await tx.listing.updateMany({
        where: { sellerId: userId, status: { in: ['DRAFT', 'PUBLISHED'] } },
        data: { status: 'ARCHIVED', deletedAt }
      })
      await tx.needRequest.updateMany({
        where: { requesterId: userId, status: { in: ['DRAFT', 'PUBLISHED'] } },
        data: { status: 'CANCELLED', deletedAt }
      })
      await tx.housingListing.updateMany({ where: { ownerId: userId, status: 'PUBLISHED' }, data: { status: 'ARCHIVED', deletedAt } })
      await tx.jobListing.updateMany({ where: { ownerId: userId, status: 'PUBLISHED' }, data: { status: 'ARCHIVED', deletedAt } })
      await tx.serviceListing.updateMany({ where: { ownerId: userId, status: 'PUBLISHED' }, data: { status: 'ARCHIVED', deletedAt } })
      await tx.communityPost.updateMany({ where: { authorId: userId, status: 'PUBLISHED' }, data: { status: 'ARCHIVED', deletedAt } })
      // Offers are transactional, not historical, so they go.
      await tx.requestOffer.deleteMany({ where: { offererId: userId } })
      // Messages and reviews stay: other members' threads and third-party
      // opinions are preserved and now render as "Deleted Account".
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt,
          status: 'DELETED',
          email: tombstoneEmail(userId),
          passwordHash: TOMBSTONE_HASH,
          pendingEmail: null,
          pendingEmailAt: null
        }
      })
      await tx.profile.update({
        where: { userId },
        data: {
          firstName: 'Deleted',
          lastName: 'Account',
          displayName: null,
          bio: null,
          neighborhood: null,
          city: null,
          state: null,
          avatarUrl: null,
          latitude: null,
          longitude: null
        }
      })
    })

    audit('account.deleted', { userId, mode: 'anonymize', sessionsRevoked: true })
    return { deleted: true, alreadyDeleted: false, deletedAt }
  }

  private async assertProfile(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { id: true } })
    if (!profile) throw new NotFoundException('Profile not found')
  }

  private async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, preference: true, notificationPreference: true }
    })
    if (!user) throw new NotFoundException('User not found')
    // Belt and braces: passwordHash never leaves this service.
    const { passwordHash: _passwordHash, ...safeUser } = user
    return safeUser
  }
}

/**
 * A syntactically valid Argon2 digest that verifies against nothing. Any
 * login attempt against a deleted account fails both the status check and
 * the verify step, and this value can never authenticate anyone.
 */
const TOMBSTONE_HASH = '$argon2id$v=19$m=65536,t=3,p=4$ZGVsZXRlZGRlbGV0ZWRkZWxldGVk$0000000000000000000000000000000000000000000'

function tombstoneEmail(userId: string) {
  return `deleted+${userId}@accounts.neighborly.invalid`
}

function preferenceData(input: UpdatePrivacyDto) {
  return {
    ...(input.newListings !== undefined ? { newListings: input.newListings } : {}),
    ...(input.priceDrops !== undefined ? { priceDrops: input.priceDrops } : {}),
    ...(input.messages !== undefined ? { messages: input.messages } : {}),
    ...(input.events !== undefined ? { events: input.events } : {}),
    ...(input.community !== undefined ? { community: input.community } : {})
  }
}