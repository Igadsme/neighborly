# Security Plan

## What the API enforces today

This section is the Phase 4 contract. Sections below it are the longer target plan. They are not all implemented. This release is not production ready.

- Access tokens are HS256 JWTs in `Authorization: Bearer`. No refresh token is issued. No cookie is set. CORS is an explicit origin list with `credentials: false`. `*` is rejected.
- `AuthGuard` and the `/realtime` handshake load `User.status` and `deletedAt`. A suspended, deleted, or missing account is rejected even when the access token still verifies. Login already rejects a non-`ACTIVE` account.
- Helmet sets the usual security headers. HSTS and the default content security policy are on when `NODE_ENV=production`. Swagger at `/docs` is off in production.
- JSON bodies are limited to 256kb. `multipart/form-data` is rejected with 415. No upload route is mounted. `assertImageUpload` is the gate for a future image route (`MAX_UPLOAD_SIZE_MB`, default 5, max 10; JPEG, PNG, WebP).
- `X-Forwarded-For` is used for auth rate limits only when `TRUST_PROXY=1`. Production must set `TRUST_PROXY` to `0` or `1`.
- Rate limits use Redis when `REDIS_URL` is set. If Redis errors, the process keeps an in-memory window and logs `rate_limit.redis_fallback` once. Production boot requires `REDIS_URL`. `/ready` fails when that Redis ping fails.
- Each response gets `x-request-id`. Request lines are JSON (`http.request`) and omit the query string. Auth and suspension events are `audit: true` lines. 5xx responses call `captureException` in `backend/src/common/logger.ts`. That function is the Sentry hook. The Sentry SDK is not bundled.
- Validation still uses the global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`). Auth passwords are 12–128 characters on register and at most 128 on login. Free-text sanitizing from Phase 3 is unchanged.
- Secrets belong in `backend/.env` or the host secret store. The committed template is `env.example`. `.env*` is gitignored.

## 1. Security principles

Neighborly must treat trust, identity, and payments as first-class concerns. The current prototype includes real-world signals like verified sellers, reviews, location, and transaction flows, so the backend must be built with explicit safety and abuse controls.

## 2. Authentication and authorization

- Use JWT access tokens with short expiry and refresh token rotation
- Enforce strong password hashing with Argon2 or bcrypt
- Require MFA for sensitive actions such as payout setup, verification, or dispute resolution
- Maintain `DeviceSession` records and revoke sessions when suspicious activity is detected
- Use NestJS guards and role-based policies for user, moderator, and admin scope
- Ensure all endpoints inspect user identity against ownership and permission scopes

## 3. Validation and input safety

- Validate all request DTOs using Zod or class-validator at API boundaries
- Prevent SQL injection by using Prisma exclusively for data access
- Validate file upload sizes and mime types before S3 upload
- Strip and normalize free-form user text before persistence and indexing
- Reject malformed coordinates, timestamps, and IDs

## 4. Rate limiting and abuse prevention

- Apply global rate limiting for auth and public endpoints
- Add per-user limits for message sending, listing creation, and offers
- Add reputation-based throttle tiers for suspicious or low-trust users
- Use Redis-backed rate limit counters and TTL-based enforcement
- Add anti-spam rules for message and review endpoints

## 5. Privacy and data protection

- Encrypt sensitive data at rest when required by policy
- Use pre-signed upload URLs for media files rather than exposing S3 credentials to the browser
- Minimize personal data returned by public profile endpoints
- Respect user consent for location sharing and notification preferences
- Enforce soft delete and moderation support for content policy violations

## 6. Trust and safety features

- `BlockedUser` records for user-level restrictions
- `Report` and `ModerationAction` models for content and user review
- `SafetyIncident` tracking for escalations and follow-up
- `Review` integrity checks to avoid invalid or retaliatory feedback loops
- `TrustPassport` and `ReputationMetric` to surface safety and reliability signals

## 7. Payment and transaction safety

- Use Stripe Connect for marketplace payouts and charge orchestration
- Require explicit buyer/seller agreement before payment release
- Store payment state transitions immutably for audit and dispute workflows
- Add dispute workflows with evidence capture and moderation review

## 8. Operational security

- Use Sentry for server error capture and issue tracking
- Log structured events with request ids, user ids, route names, and error metadata
- Keep secrets in secure environment files or secret managers
- Validate all external service integrations with scoped credentials and environment separation
- Run container scanning and dependency auditing in CI/CD

## 9. Security checklist before production launch

- Auth flow tested with token expiration and refresh rotation
- Role-based access checks verified for all protected routes
- Rate limiting tested for login, offer posting, and message spam
- Media upload pipelines locked down to approved file types and sizes
- Payment flows reviewed by security and legal teams
- Review and report endpoints inspected for abuse patterns
- WebSocket authorization verified against JWT and session context
- Audit log retention and moderation review process defined

## 10. Production recommendation

Security should not be bolted on after the first release. It must be part of the initial API contract, Prisma schema, and infrastructure. Neighborly has enough trust and transaction-heavy flows that a weak security layer would directly jeopardize the product.
