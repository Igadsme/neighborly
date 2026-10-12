import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PrismaModule } from '../prisma/prisma.module'
import { AuthController } from './auth.controller'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { CsrfGuard } from './csrf.guard'
import { ConsoleEmailSender, EMAIL_SENDER, OutboxEmailSender } from './email-sender'

/**
 * The email adapter is chosen once at startup. `outbox` is the default so
 * a fresh environment can complete a verification flow without wiring a
 * provider; see docs/EMAIL_DELIVERY.md.
 */
function emailSenderFactory(processEnv: NodeJS.ProcessEnv = process.env) {
  return processEnv.EMAIL_SENDER === 'console' ? ConsoleEmailSender : OutboxEmailSender
}

@Module({
  imports: [JwtModule.register({}), PrismaModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthGuard,
    CsrfGuard,
    OutboxEmailSender,
    ConsoleEmailSender,
    { provide: EMAIL_SENDER, useFactory: emailSenderFactory }
  ],
  exports: [AuthService, AuthGuard, CsrfGuard, JwtModule, EMAIL_SENDER]
})
export class AuthModule {}