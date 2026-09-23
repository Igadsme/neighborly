import { INestApplication, Type, ValidationPipe } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { AuthGuard } from '../../auth/auth.guard'
import { PrismaService } from '../../prisma/prisma.service'

export const testJwtSecret = 'test-jwt-secret-must-be-32-characters'

export async function bootApi(options: {
  controller: Type
  service: Type
  prisma: object
  extraProviders?: Type[]
  userId?: string
  email?: string
}) {
  process.env.JWT_SECRET = testJwtSecret
  const moduleRef = await Test.createTestingModule({
    imports: [JwtModule.register({})],
    controllers: [options.controller],
    providers: [options.service, ...(options.extraProviders ?? []), AuthGuard, { provide: PrismaService, useValue: options.prisma }]
  }).compile()

  const app: INestApplication = moduleRef.createNestApplication({ forceCloseConnections: true })
  app.setGlobalPrefix('api/v1')
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  await app.listen(0, '127.0.0.1')
  const address = app.getHttpServer().address()
  if (!address || typeof address === 'string') throw new Error('HTTP server is not listening')
  const jwt = moduleRef.get(JwtService)
  const tokenFor = (userId: string, email = 'user@example.com') => jwt.sign({ sub: userId, email }, { secret: testJwtSecret })
  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    token: tokenFor(options.userId ?? 'user-1', options.email),
    tokenFor
  }
}
