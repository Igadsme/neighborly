import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { PrismaService } from '../prisma/prisma.service'
import { AuthGuard } from './auth.guard'

const SECRET = 'unit-test-jwt-secret-32-characters-min'

describe('AuthGuard', () => {
  let guard: AuthGuard
  let jwt: JwtService
  const findUnique = jest.fn()

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [AuthGuard, { provide: PrismaService, useValue: { user: { findUnique } } }]
    }).compile()
    guard = moduleRef.get(AuthGuard)
    jwt = moduleRef.get(JwtService)
    expect(guard).toBeInstanceOf(AuthGuard)
    expect(jwt).toBeInstanceOf(JwtService)
  })

  beforeEach(() => {
    findUnique.mockReset()
    findUnique.mockResolvedValue({ id: 'user-123', email: 'ada@neighborly.test', status: 'ACTIVE', deletedAt: null })
  })

  function contextFor(authorization?: string) {
    const request: { headers: { authorization?: string }; user?: { id: string; email: string } } = {
      headers: authorization ? { authorization } : {}
    }
    const context = {
      switchToHttp: () => ({ getRequest: () => request })
    } as ExecutionContext
    return { context, request }
  }

  it('maps a token signed with sub onto request.user.id', async () => {
    const token = jwt.sign({ sub: 'user-123', email: 'ada@neighborly.test' }, { secret: SECRET })
    const { context, request } = contextFor(`Bearer ${token}`)

    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(request.user).toEqual({ id: 'user-123', email: 'ada@neighborly.test' })
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      select: { id: true, email: true, status: true, deletedAt: true }
    })
  })

  it('rejects a token that does not verify', async () => {
    const { context } = contextFor('Bearer not-a-jwt')
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException)
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('rejects a still-valid token when the account is suspended', async () => {
    findUnique.mockResolvedValue({ id: 'user-123', email: 'ada@neighborly.test', status: 'SUSPENDED', deletedAt: null })
    const token = jwt.sign({ sub: 'user-123', email: 'ada@neighborly.test' }, { secret: SECRET })
    const { context } = contextFor(`Bearer ${token}`)
    await expect(guard.canActivate(context)).rejects.toMatchObject({ message: 'Account is not active' })
  })

  it('rejects a token for a missing account', async () => {
    findUnique.mockResolvedValue(null)
    const token = jwt.sign({ sub: 'user-123', email: 'ada@neighborly.test' }, { secret: SECRET })
    const { context } = contextFor(`Bearer ${token}`)
    await expect(guard.canActivate(context)).rejects.toMatchObject({ message: 'Account is not active' })
  })
})
