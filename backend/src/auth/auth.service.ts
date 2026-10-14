import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { JwtService } from '@nestjs/jwt'
import * as argon2 from 'argon2'
import { audit } from '../common/logger'
import { sanitizeOptional, sanitizeText } from '../common/text'
import { PrismaService } from '../prisma/prisma.service'
import { accessTokenSignOptions } from './access-token'
import { EMAIL_SENDER, EmailSender } from './email-sender'
import { LoginDto, RegisterDto, ResetPasswordDto } from './dto'
import { resetLink, verificationLink } from './email-links'
import {
  hashToken,
  issueToken,
  parseRefreshCookieValue,
  refreshCookieValue,
  sameTokenHash
} from './token-crypto'

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface SessionMeta {
  userAgent?: string
  ipAddress?: string
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender
  ) {}

  // ---------------------------------------------------------------- accounts

  async register(input: RegisterDto, meta: SessionMeta = {}) {
    const email = normalizeEmail(input.email)
    const passwordHash = await argon2.hash(input.password)
    // The uniqueness index on User.email is the authority; the pre-check
    // only produces a friendlier error for the common case.
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) throw new ConflictException('An account already exists for this email')
    const user = await this.createUser({ email, passwordHash, input })
    audit('auth.register', { userId: user.id })
    const issued = await this.startSession(user.id, user.email, meta)
    await this.issueEmailVerification(user.id, user.email, 'verify')
    return issued
  }

  async login(input: LoginDto, meta: SessionMeta = {}) {
    const email = normalizeEmail(input.email)
    const user = await this.prisma.user.findUnique({ where: { email } })
    // One generic message for unknown email, wrong password, suspended
    // account, and deleted account, so login cannot enumerate accounts.
    const ok = user ? await argon2.verify(user.passwordHash, input.password).catch(() => false) : false
    if (!user || !ok || user.deletedAt || user.status !== 'ACTIVE') {
      audit('auth.login.failure', { email })
      throw new UnauthorizedException('Invalid email or password')
    }
    audit('auth.login.success', { userId: user.id })
    return this.startSession(user.id, user.email, meta)
  }

  /** Password re-entry for a sensitive change. Proves live ownership. */
  async assertPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } })
    if (!user || !(await argon2.verify(user.passwordHash, password).catch(() => false))) {
      throw new UnauthorizedException('Password confirmation failed')
    }
  }

  // ----------------------------------------------------------------- sessions

  /**
   * Rotates the refresh credential. A token that has already been rotated
   * or revoked is treated as theft: the whole family is revoked, which
   * signs out the legitimate holder too. That is the intended trade-off.
   */
  async refresh(cookieValue: string | undefined, meta: SessionMeta = {}) {
    const parsed = cookieValue ? parseRefreshCookieValue(cookieValue) : null
    if (!parsed) throw new UnauthorizedException('No active session')

    const session = await this.prisma.refreshSession.findUnique({ where: { id: parsed.sessionId } })
    if (!session) throw new UnauthorizedException('No active session')

    // Reuse or theft: the presented secret no longer matches the row.
    if (!sameTokenHash(hashToken(cookieValue!), session.tokenHash)) {
      await this.revokeFamily(session.familyId, 'reuse_detected')
      audit('auth.refresh.reuse', { userId: session.userId, familyId: session.familyId })
      throw new UnauthorizedException('Session is no longer valid')
    }
    if (session.revokedAt) {
      await this.revokeFamily(session.familyId, 'reuse_detected')
      audit('auth.refresh.reuse', { userId: session.userId, familyId: session.familyId })
      throw new UnauthorizedException('Session is no longer valid')
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.revokeFamily(session.familyId, 'expired')
      throw new UnauthorizedException('Session expired')
    }

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, status: true, deletedAt: true }
    })
    if (!user || user.deletedAt || user.status !== 'ACTIVE') {
      await this.revokeFamily(session.familyId, 'account_inactive')
      throw new UnauthorizedException('Account is not active')
    }

    // Conditional swap: only one concurrent refresh can consume the old
    // token. The loser sees revokedAt set and is treated as reuse.
    const nextId = randomUUID()
    const value = refreshCookieValue(nextId)
    const rotated = await this.prisma.$transaction(async tx => {
      const consumed = await tx.refreshSession.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'rotated', lastUsedAt: new Date() }
      })
      if (consumed.count === 0) return null
      const created = await tx.refreshSession.create({
        data: {
          id: nextId,
          userId: user.id,
          familyId: session.familyId,
          tokenHash: hashToken(value),
          userAgent: session.userAgent,
          ipAddress: meta.ipAddress ?? session.ipAddress,
          expiresAt: new Date(Date.now() + SESSION_TTL_MS)
        }
      })
      return created
    })

    if (!rotated) {
      await this.revokeFamily(session.familyId, 'reuse_detected')
      audit('auth.refresh.race', { userId: session.userId, familyId: session.familyId })
      throw new UnauthorizedException('Session is no longer valid')
    }

    audit('auth.refresh.success', { userId: user.id, sessionId: rotated.id })
    return {
      sessionId: rotated.id,
      refreshToken: value,
      accessToken: await this.signAccessToken(user.id, user.email),
      user: { id: user.id, email: user.email, emailVerified: await this.isVerified(user.id) }
    }
  }

  async logout(cookieValue: string | undefined) {
    const parsed = cookieValue ? parseRefreshCookieValue(cookieValue) : null
    if (!parsed) return
    await this.prisma.refreshSession.updateMany({
      where: { id: parsed.sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout' }
    })
  }

  /** Revokes every session for a user. Used by logout-all and resets. */
  async revokeAllSessions(userId: string, reason: string) {
    const result = await this.prisma.refreshSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason }
    })
    audit('auth.sessions.revoked_all', { userId, reason, sessions: result.count })
    return result.count
  }

  async listSessions(userId: string, currentSessionId?: string) {
    const sessions = await this.prisma.refreshSession.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true
      }
    })
    return sessions.map(session => ({ ...session, current: session.id === currentSessionId }))
  }

  async revokeSession(userId: string, sessionId: string) {
    const result = await this.prisma.refreshSession.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'revoked_by_user' }
    })
    if (result.count === 0) throw new BadRequestException('Session is not active')
    audit('auth.session.revoked', { userId, sessionId })
  }

  // -------------------------------------------------------- email verification

  async requestVerification(userId: string, input: { email?: string } = {}) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user || user.deletedAt) throw new BadRequestException('Account is not available')
    const target = input.email ? normalizeEmail(input.email) : user.email
    if (target === user.email && user.emailVerifiedAt) {
      throw new BadRequestException('This email address is already verified')
    }
    await this.issueEmailVerification(userId, target, 'verify')
    return { sent: true }
  }

  async verifyEmail(token: string) {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) }
    })
    if (!record) throw new BadRequestException('This verification link is not valid')
    if (record.consumedAt) throw new BadRequestException('This verification link has already been used')
    if (record.expiresAt.getTime() <= Date.now()) throw new BadRequestException('This verification link has expired')

    // Conditional consume: two simultaneous submits cannot both verify.
    const consumed = await this.prisma.emailVerificationToken.updateMany({
      where: { id: record.id, consumedAt: null },
      data: { consumedAt: new Date() }
    })
    if (consumed.count === 0) throw new BadRequestException('This verification link has already been used')

    const user = await this.prisma.user.findUnique({ where: { id: record.userId } })
    if (!user || user.deletedAt) throw new BadRequestException('Account is not available')

    // Completing a pending email change promotes it; otherwise this is the
    // initial verification of the address the account was created with.
    const applyingChange = user.pendingEmail === record.email
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: applyingChange
          ? { email: record.email, emailVerifiedAt: new Date(), pendingEmail: null, pendingEmailAt: null }
          : { emailVerifiedAt: new Date() }
      }),
      this.prisma.profile.update({ where: { userId: user.id }, data: { emailVerified: true } })
    ])
    audit('auth.email.verified', { userId: user.id, emailChanged: applyingChange })
    return { verified: true, email: record.email }
  }

  // -------------------------------------------------------- password recovery

  /**
   * Always resolves to the same shape, whether or not the address exists.
   * The audit log records the outcome but never the token.
   */
  async forgotPassword(email: string) {
    const normalized = normalizeEmail(email)
    const user = await this.prisma.user.findUnique({ where: { email: normalized }, select: { id: true } })
    if (user) {
      const { token } = await this.createPasswordReset(user.id)
      await this.email.send({
        to: normalized,
        subject: 'Reset your Neighborly password',
        body: resetEmailBody(token)
      })
    }
    audit('auth.password.reset_requested', { email: normalized, matched: Boolean(user) })
    return { accepted: true }
  }

  async resetPassword(input: ResetPasswordDto) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(input.token) }
    })
    if (!record) throw new BadRequestException('This reset link is not valid')
    if (record.consumedAt) throw new BadRequestException('This reset link has already been used')
    if (record.expiresAt.getTime() <= Date.now()) throw new BadRequestException('This reset link has expired')

    const passwordHash = await argon2.hash(input.password)
    // Conditional consume inside the same transaction as the write, so two
    // concurrent redemptions cannot both set a password.
    const redeemed = await this.prisma.$transaction(async tx => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: record.id, consumedAt: null },
        data: { consumedAt: new Date() }
      })
      if (consumed.count === 0) return false
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } })
      await tx.refreshSession.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'password_reset' }
      })
      return true
    })
    if (!redeemed) throw new BadRequestException('This reset link has already been used')
    audit('auth.password.reset', { userId: record.userId, sessionsRevoked: true })
    return { reset: true }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string, keepSessionId?: string) {
    await this.assertPassword(userId, currentPassword)
    const passwordHash = await argon2.hash(newPassword)
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshSession.updateMany({
        where: { userId, revokedAt: null, ...(keepSessionId ? { NOT: { id: keepSessionId } } : {}) },
        data: { revokedAt: new Date(), revokedReason: 'password_changed' }
      })
    ])
    audit('auth.password.changed', { userId })
    return { changed: true, otherSessionsRevoked: true }
  }

  // ------------------------------------------------------------------ helpers

  private async createUser(input: { email: string; passwordHash: string; input: RegisterDto }) {
    try {
      return await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash: input.passwordHash,
          profile: {
            create: {
              firstName: sanitizeText(input.input.firstName, 80),
              lastName: sanitizeText(input.input.lastName, 80),
              neighborhood: sanitizeOptional(input.input.neighborhood, 80),
              city: sanitizeOptional(input.input.city, 80),
              state: sanitizeOptional(input.input.state, 40)
            }
          }
        },
        include: { profile: true }
      })
    } catch (error) {
      // Two concurrent registrations for one address: the unique index
      // rejects the loser regardless of which pre-check it passed.
      if (isUniqueViolation(error)) throw new ConflictException('An account already exists for this email')
      throw error
    }
  }

  private async startSession(userId: string, email: string, meta: SessionMeta) {
    // The row id is chosen here so the cookie can carry it: refresh looks
    // the row up by primary key instead of scanning on a token digest.
    const sessionId = randomUUID()
    const refreshToken = refreshCookieValue(sessionId)
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    const session = await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId,
        familyId: randomUUID(),
        tokenHash: hashToken(refreshToken),
        userAgent: sanitizeOptional(meta.userAgent?.slice(0, 200), 200),
        ipAddress: sanitizeOptional(meta.ipAddress?.slice(0, 64), 64),
        expiresAt
      }
    })
    return {
      sessionId: session.id,
      refreshToken,
      accessToken: await this.signAccessToken(userId, email),
      user: { id: userId, email, emailVerified: await this.isVerified(userId) }
    }
  }

  private signAccessToken(id: string, email: string) {
    return this.jwt.signAsync({ sub: id, email }, accessTokenSignOptions())
  }

  private async isVerified(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true } })
    return Boolean(user?.emailVerifiedAt)
  }

  private async createPasswordReset(userId: string) {
    const { token, tokenHash } = issueToken()
    await this.prisma.$transaction([
      // Only the newest link stays usable; older ones are burned on issue.
      this.prisma.passwordResetToken.updateMany({
        where: { userId, consumedAt: null },
        data: { consumedAt: new Date() }
      }),
      this.prisma.passwordResetToken.create({
        data: { userId, tokenHash, expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS) }
      })
    ])
    return { token }
  }

  private async issueEmailVerification(userId: string, email: string, purpose: 'verify') {
    const { token, tokenHash } = issueToken()
    await this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash, email, expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS) }
    })
    await this.email.send({
      to: email,
      subject: 'Verify your Neighborly email address',
      body: verifyEmailBody(token, purpose)
    })
    return token
  }

  private async revokeFamily(familyId: string, reason: string) {
    await this.prisma.refreshSession.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason }
    })
  }
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002'
}

function verifyEmailBody(token: string, purpose: 'verify') {
  return [
    'Welcome to Neighborly.',
    '',
    `Confirm this email address to finish setting up your account (${purpose === 'verify' ? 'initial verification' : 'email change'}).`,
    '',
    verificationLink(token),
    '',
    'The link expires in 24 hours and can only be used once.',
    'If you did not create a Neighborly account, ignore this message.'
  ].join('\n')
}

function resetEmailBody(token: string) {
  return [
    'Reset your Neighborly password.',
    '',
    'Use the link below to choose a new password. It expires in 30 minutes and can only be used once.',
    '',
    resetLink(token),
    '',
    'If you did not request this, no action is needed and your current password still works.'
  ].join('\n')
}