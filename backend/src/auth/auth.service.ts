import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import * as argon2 from 'argon2'
import { audit } from '../common/logger'
import { sanitizeOptional, sanitizeText } from '../common/text'
import { PrismaService } from '../prisma/prisma.service'
import { accessTokenSignOptions } from './access-token'
import { LoginDto, RegisterDto } from './dto'

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async register(input: RegisterDto) {
    const email = input.email.trim().toLowerCase()
    const existing = await this.prisma.user.findUnique({ where: { email } })
    if (existing) throw new ConflictException('An account already exists for this email')
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash: await argon2.hash(input.password),
        profile: {
          create: {
            firstName: sanitizeText(input.firstName, 80),
            lastName: sanitizeText(input.lastName, 80),
            neighborhood: sanitizeOptional(input.neighborhood, 80),
            city: sanitizeOptional(input.city, 80),
            state: sanitizeOptional(input.state, 40)
          }
        }
      },
      include: { profile: true }
    })
    audit('auth.register', { userId: user.id })
    return this.issueTokens(user.id, user.email)
  }

  async login(input: LoginDto) {
    const email = input.email.trim().toLowerCase()
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user || user.status !== 'ACTIVE' || !(await argon2.verify(user.passwordHash, input.password))) {
      audit('auth.login.failure', { email })
      throw new UnauthorizedException('Invalid email or password')
    }
    audit('auth.login.success', { userId: user.id })
    return this.issueTokens(user.id, user.email)
  }

  private async issueTokens(id: string, email: string) {
    return {
      user: { id, email },
      accessToken: await this.jwt.signAsync({ sub: id, email }, accessTokenSignOptions())
    }
  }
}
