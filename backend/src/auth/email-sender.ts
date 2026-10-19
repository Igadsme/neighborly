import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

/**
 * Provider-neutral email delivery.
 *
 * Nothing in this module ever writes a verification or reset link to the
 * application log. `OutboxEmailSender` persists the message instead, which
 * is the integration point a real provider (SES, Postmark, Resend, ...)
 * attaches to by draining `EmailOutbox`. See docs/EMAIL_DELIVERY.md for
 * the production configuration requirement.
 */
export interface OutboundEmail {
  to: string
  subject: string
  body: string
}

export const EMAIL_SENDER = Symbol('EMAIL_SENDER')

export interface EmailSender {
  send(message: OutboundEmail): Promise<void>
}

@Injectable()
export class OutboxEmailSender implements EmailSender {
  constructor(private readonly prisma: PrismaService) {}

  async send(message: OutboundEmail) {
    await this.prisma.emailOutbox.create({
      data: { toEmail: message.to, subject: message.subject, body: message.body }
    })
  }
}

/**
 * Local-development adapter. Writes to stdout so a developer can copy the
 * link, but only when EMAIL_SENDER is explicitly `console`. Production
 * startup refuses `console` so a live link can never reach a log stream.
 */
@Injectable()
export class ConsoleEmailSender implements EmailSender {
  async send(message: OutboundEmail) {
    process.stdout.write(`[email] to=${message.to} subject=${message.subject}\n${message.body}\n`)
  }
}