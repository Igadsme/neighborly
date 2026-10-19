import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)

  constructor(private readonly config: ConfigService) {}

  async send(to: string, subject: string, html: string) {
    const apiKey = this.config.get<string>('RESEND_API_KEY')
    const from = this.config.get<string>('EMAIL_FROM')
    if (!apiKey || !from) {
      if (this.config.get<string>('NODE_ENV') === 'production') {
        throw new ServiceUnavailableException('Transactional email is not configured')
      }
      this.logger.warn(`Skipped transactional email to ${to}; RESEND_API_KEY or EMAIL_FROM is missing`)
      return { delivered: false }
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from, to: [to], subject, html }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const details = await response.text().catch(() => '')
      this.logger.error(`Transactional email failed (${response.status}): ${details.slice(0, 500)}`)
      throw new ServiceUnavailableException('Transactional email could not be sent')
    }
    return { delivered: true }
  }
}

