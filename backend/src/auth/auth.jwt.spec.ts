import { ExecutionContext } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { PrismaService } from '../prisma/prisma.service'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'

type AccessPayload = { sub: string; email?: string }
type Authenticated = { id: string; email: string }

jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn().mockResolvedValue(true)
}))

const secret = 'test-jwt-secret-must-be-32-characters'
const user = {
  id: '8d4e3c2b-1a09-4f87-9c6d-5e4f3a2b1c0d',
  email: 'ada@example.com',
  passwordHash: 'hashed-password',
  status: 'ACTIVE' as const
}

describe('JWT subject mapping', () => {
  let auth: AuthService
  let jwt: JwtService
  let guard: AuthGuard

  beforeAll(async () => {
    process.env.JWT_SECRET = secret
    process.env.JWT_ACCESS_TTL = '15m'

    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [
        AuthService,
        AuthGuard,
        { provide: PrismaService, useValue: { user: { findUnique: jest.fn().mockResolvedValue(user) } } }
      ]
    }).compile()

    auth = moduleRef.get(AuthService)
    jwt = moduleRef.get(JwtService)
    guard = moduleRef.get(AuthGuard)
  })

  it('maps user.id onto the access token sub claim', async () => {
    const session = await auth.login({ email: user.email, password: 'CorrectHorseBatteryStaple' })
    const payload = jwt.verify<AccessPayload>(session.accessToken, { secret })

    expect(payload.sub).toBe(user.id)
    expect(session.user.id).toBe(payload.sub)
  })

  it('maps JWT sub onto request.user.id in the auth guard', async () => {
    const session = await auth.login({ email: user.email, password: 'CorrectHorseBatteryStaple' })
    const payload = jwt.verify<AccessPayload>(session.accessToken, { secret })
    const request: { headers: { authorization: string }; user?: Authenticated } = {
      headers: { authorization: `Bearer ${session.accessToken}` }
    }
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext

    await guard.canActivate(context)

    expect(request.user).toEqual({ id: user.id, email: user.email })
    expect(request.user?.id).toBe(payload.sub)
  })
})
