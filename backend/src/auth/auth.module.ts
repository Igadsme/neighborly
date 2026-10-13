import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PrismaModule } from '../prisma/prisma.module'
import { AuthController } from './auth.controller'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'
import { CsrfGuard } from './csrf.guard'
import {
  ConsoleEmailSender,
  EMAIL_SENDER,
  EmailSender,
  OutboxEmailSender,
} from './email-sender'

/**
 * The email adapter is chosen once at startup. `outbox` is the default so
 * a fresh environment can complete a verification flow without wiring a
 * provider; see docs/EMAIL_DELIVERY.md.
 *
 * The factory receives already-constructed instances. Returning the class
 * itself would inject the constructor rather than an instance, leaving
 * `sender.send` undefined at the first send.
 */
function emailSenderFactory(
  outbox: OutboxEmailSender,
  console: ConsoleEmailSender,
  processEnv: NodeJS.ProcessEnv = process.env
): EmailSender {
  return processEnv.EMAIL_SENDER === 'console' ? console : outbox
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
    { provide: EMAIL_SENDER, useFactory: emailSenderFactory, inject: [OutboxEmailSender, ConsoleEmailSender] }
  ],
  exports: [AuthService, AuthGuard, CsrfGuard, JwtModule, EMAIL_SENDER]
})
export class AuthModule {}