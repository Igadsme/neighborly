import { INestApplication, Type, ValidationPipe } from '@nestjs/common'
import { JwtModule, JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { AuthGuard } from '../../auth/auth.guard'
import { PrismaService } from '../../prisma/prisma.service'
import { stubStorage } from './stub-storage'
import { OutboxWriter } from '../../events/outbox-writer'
import { RequestLifecycleService } from '../../requests/request-lifecycle.service'

export const testJwtSecret = 'test-jwt-secret-must-be-32-characters'

type AccountQuery = { select?: { email?: boolean; status?: boolean }; where?: { id?: string } }

/** AuthGuard loads this select. Other findUnique calls keep the test double. */
export function withAccountLookup(prisma: object, fallback: { id: string; email: string }) {
  const source = prisma as { user?: { findUnique?: (args: AccountQuery) => Promise<Record<string, unknown> | null> } }
  const user = source.user ?? {}
  const original = user.findUnique?.bind(user)
  return {
    ...source,
    user: {
      ...user,
      findUnique: async (args: AccountQuery) => {
        if (args?.select?.email === true && args?.select?.status === true) {
          const row = original ? await original(args) : null
          if (row) return row
          return { id: args?.where?.id ?? fallback.id, email: fallback.email, status: 'ACTIVE', deletedAt: null }
        }
        return original ? original(args) : null
      }
    }
  }
}

/**
 * RequestLifecycleService is required by RequestsController. Suites that
 * boot that controller need it resolved, so it is provided automatically
 * with the same Prisma double the rest of the module uses.
 */
function requestLifecycleProviders() {
  return [
    {
      provide: RequestLifecycleService,
      useFactory: (prisma: object) => new RequestLifecycleService(prisma as never, outboxDouble() as never)
    }
  ]
}

function outboxDouble() {
  return { record: async () => undefined }
}

export async function bootApi(options: {
  controller: Type
  service: Type
  prisma: object
  extraProviders?: Type[]
  userId?: string
  email?: string
}) {
  process.env.JWT_SECRET = testJwtSecret
  const userId = options.userId ?? 'user-1'
  const email = options.email ?? 'user@example.com'
  const moduleRef = await Test.createTestingModule({
    imports: [JwtModule.register({})],
    controllers: [options.controller],
    providers: [
      options.service,
      ...(options.extraProviders ?? []),
      // The requests controller takes the lifecycle service alongside the
      // offer service; suites that boot it get a shared instance.
      ...requestLifecycleProviders(),
      // Listing services depend on object storage; these suites never upload.
      stubStorage().provider,
      // Request services write domain events through the outbox.
      { provide: OutboxWriter, useValue: { record: jest.fn().mockResolvedValue(undefined) } },
      AuthGuard,
      { provide: PrismaService, useValue: withAccountLookup(options.prisma, { id: userId, email }) }
    ]
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
