import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService, JwtSignOptions } from '@nestjs/jwt'
import { AuthTokenType } from '@prisma/client'
import * as argon2 from 'argon2'
import { createHash, randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma/prisma.service'
import { EmailService } from '../common/email/email.service'
import { LoginDto, RegisterDto } from './dto'

interface SessionContext {
  ipAddress?: string
  userAgent?: string
}

function durationMs(value: string) {
  const match = /^(\d+)(s|m|h|d)$/.exec(value)
  if (!match) throw new Error(`Invalid duration: ${value}`)
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]]
  if (!unit) throw new Error(`Invalid duration unit: ${value}`)
  return Number(match[1]) * unit
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  async register(input: RegisterDto, context: SessionContext = {}) {
    const email = input.email.trim().toLowerCase()
    const existing = await this.prisma.user.findUnique({ where: { email } })
    if (existing) throw new ConflictException('An account already exists for this email')
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await argon2.hash(input.password),
        profile: {
          create: {
            firstName: input.firstName.trim(),
            lastName: input.lastName.trim(),
            neighborhood: input.neighborhood?.trim(),
            city: input.city?.trim(),
            state: input.state?.trim()
          }
        }
      },
      include: { profile: true }
    })
    const session = await this.issueSession(user.id, user.email, context)
    this.sendEmailVerification(user.id, user.email).catch((error) =>
      this.logger.warn(`Initial verification email failed: ${error instanceof Error ? error.message : error}`),
    )
    return session
  }

  async login(input: LoginDto, context: SessionContext = {}) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } })
    if (!user || user.status !== 'ACTIVE' || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException('Invalid email or password')
    }
    return this.issueSession(user.id, user.email, context)
  }

  async refresh(refreshToken: string | undefined, context: SessionContext = {}) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token required')
    const tokenHash = this.hashToken(refreshToken)
    const session = await this.prisma.deviceSession.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, status: true } } },
    })
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Refresh session is invalid or expired')
    }
    const rotatedToken = randomBytes(48).toString('base64url')
    const changed = await this.prisma.deviceSession.updateMany({
      where: { id: session.id, tokenHash, revokedAt: null, expiresAt: { gt: new Date() } },
      data: {
        tokenHash: this.hashToken(rotatedToken),
        lastUsedAt: new Date(),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    })
    if (changed.count !== 1) throw new UnauthorizedException('Refresh session was already rotated')
    return {
      user: { id: session.user.id, email: session.user.email },
      accessToken: await this.issueAccessToken(session.user.id, session.user.email),
      refreshToken: rotatedToken,
    }
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return { revoked: false }
    const result = await this.prisma.deviceSession.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    })
    return { revoked: result.count > 0 }
  }

  async logoutAll(userId: string) {
    const result = await this.prisma.deviceSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    return { revoked: result.count }
  }

  async forgotPassword(emailAddress: string) {
    const email = emailAddress.trim().toLowerCase()
    const user = await this.prisma.user.findFirst({
      where: { email, status: 'ACTIVE', deletedAt: null },
      select: { id: true, email: true },
    })
    if (user) {
      try {
        const token = await this.createOneTimeToken(user.id, 'PASSWORD_RESET', 30 * 60_000)
        const url = `${this.appUrl()}/reset-password?token=${encodeURIComponent(token)}`
        await this.email.send(user.email, 'Reset your Neighborly password', `<p>A password reset was requested for your Neighborly account.</p><p><a href="${url}">Reset your password</a></p><p>This link expires in 30 minutes. If you did not request it, you can ignore this email.</p>`)
      } catch (error) {
        this.logger.error(`Password reset delivery failed: ${error instanceof Error ? error.message : error}`)
      }
    }
    return { accepted: true }
  }

  async resetPassword(token: string, password: string) {
    const tokenHash = this.hashToken(token)
    const record = await this.prisma.authToken.findUnique({ where: { tokenHash } })
    if (!record || record.type !== 'PASSWORD_RESET' || record.usedAt || record.expiresAt <= new Date()) {
      throw new BadRequestException('Password reset link is invalid or expired')
    }
    const passwordHash = await argon2.hash(password)
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.authToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      })
      if (consumed.count !== 1) throw new BadRequestException('Password reset link was already used')
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } })
      await tx.deviceSession.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } })
    })
    return { reset: true }
  }

  async requestEmailVerification(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, profile: { select: { emailVerified: true } } },
    })
    if (!user) throw new UnauthorizedException()
    if (user.profile?.emailVerified) return { sent: false, alreadyVerified: true }
    await this.sendEmailVerification(userId, user.email)
    return { sent: true, alreadyVerified: false }
  }

  async confirmEmail(token: string) {
    const tokenHash = this.hashToken(token)
    const record = await this.prisma.authToken.findUnique({ where: { tokenHash } })
    if (!record || record.type !== 'EMAIL_VERIFICATION' || record.usedAt || record.expiresAt <= new Date()) {
      throw new BadRequestException('Verification link is invalid or expired')
    }
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.authToken.updateMany({
        where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      })
      if (consumed.count !== 1) throw new BadRequestException('Verification link was already used')
      await tx.profile.update({ where: { userId: record.userId }, data: { emailVerified: true } })
    })
    return { verified: true }
  }

  private async sendEmailVerification(userId: string, address: string) {
    const token = await this.createOneTimeToken(userId, 'EMAIL_VERIFICATION', 24 * 60 * 60_000)
    const url = `${this.appUrl()}/verify-email?token=${encodeURIComponent(token)}`
    return this.email.send(address, 'Verify your Neighborly email', `<p>Welcome to Neighborly.</p><p><a href="${url}">Verify your email address</a></p><p>This link expires in 24 hours.</p>`)
  }

  private async createOneTimeToken(userId: string, type: AuthTokenType, ttlMs: number) {
    const token = randomBytes(48).toString('base64url')
    await this.prisma.$transaction([
      this.prisma.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } }),
      this.prisma.authToken.create({ data: { userId, type, tokenHash: this.hashToken(token), expiresAt: new Date(Date.now() + ttlMs) } }),
    ])
    return token
  }

  private appUrl() {
    return (this.config.get<string>('APP_URL') ?? 'http://localhost:8443').replace(/\/$/, '')
  }

  private async issueSession(id: string, email: string, context: SessionContext) {
    const refreshToken = randomBytes(48).toString('base64url')
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL') ?? '7d'
    await this.prisma.deviceSession.create({
      data: {
        userId: id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + durationMs(refreshTtl)),
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    })
    return {
      user: { id, email },
      accessToken: await this.issueAccessToken(id, email),
      refreshToken,
    }
  }

  private issueAccessToken(id: string, email: string) {
    const options: JwtSignOptions = {
      secret: this.config.getOrThrow<string>('JWT_SECRET'),
      expiresIn: (this.config.get<string>('JWT_ACCESS_TTL') ?? '15m') as JwtSignOptions['expiresIn'],
    }
    return this.jwt.signAsync({ sub: id, email }, options)
  }

  private hashToken(value: string) {
    return createHash('sha256').update(value).digest('hex')
  }
}
