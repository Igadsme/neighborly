import { ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { AuthGuard } from './auth.guard'

const SECRET = 'unit-test-jwt-secret-32-characters-min'

describe('AuthGuard', () => {
  let guard: AuthGuard
  let jwt: JwtService

  beforeAll(async () => {
    process.env.JWT_SECRET = SECRET
    const moduleRef = await Test.createTestingModule({
      imports: [JwtModule.register({})],
      providers: [AuthGuard]
    }).compile()
    guard = moduleRef.get(AuthGuard)
    jwt = moduleRef.get(JwtService)
    expect(guard).toBeInstanceOf(AuthGuard)
    expect(jwt).toBeInstanceOf(JwtService)
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

  it('maps a token signed with sub onto request.user.id', () => {
    const token = jwt.sign({ sub: 'user-123', email: 'ada@neighborly.test' }, { secret: SECRET })
    const { context, request } = contextFor(`Bearer ${token}`)

    expect(guard.canActivate(context)).toBe(true)
    expect(request.user).toEqual({ id: 'user-123', email: 'ada@neighborly.test' })
  })

  it('rejects a token that does not verify', () => {
    const { context } = contextFor('Bearer not-a-jwt')
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException)
  })
})
