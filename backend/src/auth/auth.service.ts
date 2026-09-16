import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService, JwtSignOptions } from '@nestjs/jwt'
import * as argon2 from 'argon2'
import { PrismaService } from '../prisma/prisma.service'
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
    return this.issueTokens(user.id, user.email)
  }

  async login(input: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email.trim().toLowerCase() } })
    if (!user || user.status !== 'ACTIVE' || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new UnauthorizedException('Invalid email or password')
    }
    return this.issueTokens(user.id, user.email)
  }

  private async issueTokens(id: string, email: string) {
    const options: JwtSignOptions = {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_ACCESS_TTL as JwtSignOptions['expiresIn'] ?? '15m'
    }
    return {
      user: { id, email },
      accessToken: await this.jwt.signAsync({ sub: id, email }, options)
    }
  }
}
