# Email Delivery

Milestone 3 adds verification and password-recovery email. This document
states exactly what is delivered, what is **not** delivered in this
repository, and what a production deployment must supply.

## Current state: no email is sent to anyone

**No email provider is configured in this repository, and none was activated.**
The application persists outbound messages to the `EmailOutbox` table instead
of transmitting them. Nothing leaves the process.

Verification and recovery links can therefore be read from the outbox:

```sql
SELECT "toEmail", subject, body, "createdAt"
FROM "EmailOutbox"
ORDER BY "createdAt" DESC
LIMIT 10;
```

This is the local-development adapter, and it is what the integration tests
use to complete a verification or reset flow end to end.

## Adapters

`backend/src/auth/email-sender.ts` defines a provider-neutral `EmailSender`
interface. Two implementations exist:

| `EMAIL_SENDER` | Adapter | Use |
| --- | --- | --- |
| `outbox` (default) | `OutboxEmailSender` | Persists to `EmailOutbox`. Correct default, and the only value allowed in production. |
| `console` | `ConsoleEmailSender` | Writes the message to stdout. Local development only. |

Env validation **refuses** `EMAIL_SENDER=console` when `NODE_ENV=production`,
so a live verification or reset link can never reach a log stream by
configuration accident.

## Tokens are never logged

- The plaintext token appears only in the `EmailOutbox.body` column and in the
  email itself.
- The database stores `hashToken(token)`, a SHA-256 digest. A database leak
  yields nothing replayable.
- `audit()` records outcomes (`auth.password.reset_requested`, `auth.email.verified`)
  and never a token.
- The API responses for verify and reset carry no token.

`/auth/register` and `/auth/login` also write a verification email; the audit
log for those records the user id only.

## Production requirement

Before production, replace or augment `OutboxEmailSender` with a real
transport. The integration point is narrow:

1. Implement `EmailSender`.
2. Bind it in `backend/src/auth/auth.module.ts` `emailSenderFactory`.
3. Keep `EMAIL_SENDER=outbox` if a background job will drain the outbox, or add
   a new allowed value and update `env.validation.ts`.

A draining job is the lower-risk option because it decouples API latency from
provider availability: the API writes a row, and a separate process retries
delivery. A direct send keeps delivery simple but makes every registration and
recovery request depend on provider uptime.

No provider SDK is currently a dependency, deliberately. Adding one is a
deployment decision with a real dependency and cost.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `EMAIL_SENDER` | `outbox` | Adapter selection. `console` is rejected in production. |
| `PUBLIC_WEB_ORIGIN` | `http://localhost:8443` | Origin prefixed to verification and reset links. Production must set this or links point at the wrong host. |

Both are validated in `backend/src/common/config/env.validation.ts`.

## Verification status

| Check | Status |
| --- | --- |
| Token generation, hashing, expiry, single use, replay refusal | Verified against real PostgreSQL |
| End-to-end verification and reset through the local adapter | Verified |
| Concurrent consumption and concurrent redemption | Verified, exactly one winner |
| Real provider delivery | **UNVERIFIED — no provider is configured** |