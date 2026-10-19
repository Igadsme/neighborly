# Milestone 3 — Authentication & User Accounts

Branch: `milestone3-authentication-user-accounts`, branched from Milestone 2
(`9559aab`). This document records what Milestone 3 required, what satisfies
it, and how each claim was verified.

No production system was touched. All database work ran against disposable
PostgreSQL containers started and destroyed by
`scripts/run-integration-tests.sh`.

## Acceptance criteria and evidence

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| A | Registration end to end | Done | Argon2 hashing, DB-backed uniqueness, rate limit, hash never returned. `account.integration.spec.ts`, `auth.http.integration.spec.ts`. |
| B | Email verification | Done | Hashed single-use tokens, 24h expiry, resend endpoint, local outbox adapter. Production delivery **unconfigured** — `docs/EMAIL_DELIVERY.md`. |
| C | Password reset | Done | Hashed single-use tokens, 30m expiry, generic responses, all sessions revoked on reset. |
| D | Refresh tokens and sessions | Done | Rotation, reuse detection with family revocation, HttpOnly cookie, CSRF, logout, logout-all, session list and revoke. |
| E | Account settings | Done | Profile, privacy, email change, password change, sessions, delete. Avatar upload **not available** — multipart is still refused. |
| F | Account deletion | Done | Anonymizing soft delete in one transaction. Policy and rationale: `docs/ACCOUNT_DELETION.md`. |
| G | Suspension and authorization | Done | Blocked at login, refresh, REST, and realtime. `suspension.integration.spec.ts`. |

## A. Registration

`AuthService.register` trims and lowercases the address, hashes the password
with the existing Argon2 call, and creates the `Profile` in the same write.
Duplicate addresses are rejected by `User.email` unique index; a pre-check
produces the friendly `409` and a `P2002` from the index catches the race
between two concurrent registrations.

The password rule is a single class-validator pattern shared by register,
reset, and change: 12–128 characters with a lowercase letter, an uppercase
letter, and a digit. The frontend mirrors it so a user is not corrected only
after a round trip.

`passwordHash` is destructured away in `UsersService.me` and never selected by
any public projection.

## B. Email verification

`POST /auth/verify-email` takes `{ token }`; `POST /auth/resend-verification`
reissues.

- Tokens are 32 CSPRNG bytes; only `hashToken(token)` is stored.
- Consumption is a conditional `updateMany` on `consumedAt`, so two
  simultaneous submits produce exactly one winner.
- Issuing a new link burns the previous unconsumed ones for that user.
- Completing a pending email change promotes `pendingEmail` to `email`;
  otherwise it just stamps `emailVerifiedAt` and `Profile.emailVerified`.

Email goes through the `EmailSender` interface. See `docs/EMAIL_DELIVERY.md`:
the default adapter writes to `EmailOutbox` and **no provider is configured**,
so live delivery is explicitly unverified.

## C. Password reset

`POST /auth/forgot-password` always resolves to `{ accepted: true }` whether or
not the address exists, and the controller returns `202` either way, so
timing and body cannot be used to enumerate accounts. Only a real match
produces an outbox row.

`POST /auth/reset-password` consumes the token conditionally inside the same
transaction that writes the new hash, so concurrent redemptions cannot both
succeed. Every refresh session for that user is revoked in the same
transaction.

## D. Refresh tokens and sessions

The refresh credential is `<sessionId>.<secret>`: the row is found by primary
key, and the secret is compared against the stored digest with
`timingSafeEqual`. A mismatch means the presented cookie is not the live one,
which is the signature of theft.

`refresh()` then, in order:

1. revokes the entire `familyId` and returns 401 if the digest does not match;
2. does the same if the row is already revoked — a rotated token replayed;
3. revokes the family if the session has expired;
4. revokes the family if the account is not `ACTIVE`;
5. rotates inside a transaction with `updateMany({ where: { revokedAt: null } })`,
   so exactly one concurrent refresh can win. The loser is treated as reuse.

That last point is why `Client` collapses concurrent 401s into one refresh:
two rotations from one browser would look like theft.

**Cookies.** `neighborly.refresh` is `HttpOnly`, `SameSite=Lax`, `Secure` in
production, `Path=/api/v1/auth`, 7-day `Max-Age`. It is never readable by
JavaScript and never appears in a response body.

**CSRF.** `CsrfGuard` guards `refresh` and `logout`. It requires the request
`Origin` to be in the `CORS_ORIGIN` allow-list and the `X-Neighborly-CSRF`
header to equal the readable `neighborly.csrf` cookie. Bearer-guarded routes
are exempt because a forged request cannot supply the `Authorization` header.

**Reuse revocation** also fires on password reset, password change, deletion,
and suspension.

`logout-all`, session listing, and per-session revoke are available on both
`/auth/*` and `/users/me/*`.

## E. Account settings

| Route | Notes |
| --- | --- |
| `PATCH /users/me/profile` | Partial update; `undefined` leaves a field, `""` clears it. `avatarUrl` is not writable from input. |
| `PATCH /users/me/privacy` | Upserts `NotificationPreference`. |
| `GET /users/me/status` | Verification state, pending email, active session count. |
| `POST /users/me/email` | Requires the current password; sets `pendingEmail` and sends a link. Promote happens on verification. |
| `DELETE /users/me/email/pending` | Cancels a pending change. |
| `POST /auth/change-password` | Requires the current password; revokes other sessions. |
| `GET /users/me/sessions`, `DELETE /users/me/sessions/:id`, `POST /users/me/sessions/revoke-all` | Session management. |
| `DELETE /users/me` | Password plus `DELETE` confirmation. |

No route accepts a user id in the body, so ownership cannot be forged. Global
`whitelist` + `forbidNonWhitelisted` rejects unknown properties, which is
asserted by a test that tries to register with `emailVerifiedAt` and
`passwordHash`.

**Not implemented: avatar upload.** `rejectMultipart` still returns 415 for
any multipart request, and no object-storage client is configured. The schema
has `Profile.avatarUrl` and the UI says so plainly. This is reported as
incomplete rather than stubbed.

## F. Account deletion

Soft delete with anonymization in one transaction. The `User` row survives, so
no foreign key is orphaned, while credentials, sessions, and tokens are
removed and the identity is replaced with a tombstone. Live listings,
requests, verticals, and community posts are withdrawn; messages and reviews
are retained under the anonymized identity. Full table-by-table reasoning is
in `docs/ACCOUNT_DELETION.md`.

## G. Suspension and authorization

`isActiveAccount` is the single check used by `AuthGuard`, `OptionalAuthGuard`,
and `MessagingGateway`, and it requires `status === 'ACTIVE'` **and**
`deletedAt == null`. Suspension therefore blocks login, refresh, every
`AuthGuard`-protected REST route, and `conversation.join` on the realtime
gateway. Because the check sits in the guard, no individual handler has to
remember it.

Public reads stay untouched: `OptionalAuthGuard` and unauthenticated list
routes make no account query at all, so a suspended user cannot add load to
public traffic by polling.

## Database changes

Migration `0007_auth_accounts`, additive only.

Added to `User`: `emailVerifiedAt`, `pendingEmail`, `pendingEmailAt`,
`deletionRequestedAt`.
Added to `Profile`: `avatarUrl`.

New models:

| Model | Key constraints |
| --- | --- |
| `EmailVerificationToken` | unique `tokenHash`; index `(userId, consumedAt)`; index `expiresAt` |
| `PasswordResetToken` | unique `tokenHash`; index `(userId, consumedAt)`; index `expiresAt` |
| `RefreshSession` | unique `tokenHash`; index `(userId, revokedAt)`; index `familyId`; index `expiresAt` |
| `EmailOutbox` | index `(toEmail, createdAt)` |

All three token/session models cascade on user deletion. SHA-256 is used for
token digests rather than Argon2: the input is 256 bits of CSPRNG output, so
there is nothing to brute force and verification must stay cheap per request.

Verified: the chain `0001_init` → `0007_auth_accounts` applies to an empty
database, and `prisma migrate diff --from-migrations → --to-schema-datamodel`
reports `No difference detected`.

## Frontend

New screens under `src/pages/account/`: `VerifyEmail`, `ForgotPassword`,
`ResetPassword`, `AccountSettings` (tabs for profile, privacy, email, password,
sessions, delete). Shared accessible field/alert primitives in
`src/components/account-ui.tsx`.

Wiring: `Account settings` in the navigation profile menu, `Forgot your
password?` in the landing sign-in dialog, and deep links — `/?verify=…`,
`/?verifyEmailChange=…`, `/?reset=…` are consumed on mount and stripped from
the address bar with `history.replaceState` so the token does not linger in
history.

`src/api/client.ts` now sends `credentials: "include"`, echoes the CSRF cookie
in a header on mutations, and renews the access token once per 401. Concurrent
401s share a single in-flight refresh. A session is only torn down when the
refresh endpoint itself answers 401 or 403; a 5xx or network failure leaves the
session intact.

Sign-up and sign-in already existed and were extended rather than replaced; the
existing marketplace flows were not modified.

## Verification runs

| Command | Result |
| --- | --- |
| `bash scripts/run-integration-tests.sh` | 7 suites, 71 tests passed |
| `backend pnpm test` | 32 suites, 180 tests passed |
| `backend pnpm lint`, `tsc --noEmit`, `pnpm build`, `prisma validate` | pass |
| `pnpm lint`, `pnpm exec tsc --noEmit` (frontend) | pass |
| `pnpm exec vitest run` (frontend) | 10 files, 80 tests passed |
| `pnpm build` (frontend) | pass |
| Full migration chain on disposable PostgreSQL | 7 migrations applied |
| `prisma migrate diff` migrations vs schema | `No difference detected` |

## Not done, and why

- **Live email delivery.** No provider is configured and none was activated.
  The outbox adapter is a working local path, not a delivery system.
  `docs/EMAIL_DELIVERY.md`.
- **Avatar upload.** `rejectMultipart` still refuses file uploads and no
  storage client exists. `Profile.avatarUrl` is reserved and unwritable from
  input.
- **Session cleanup job.** Expired and long-revoked session rows are ignored on
  read but never deleted. A periodic prune belongs in the operations milestone.
- **Cross-origin cookie deployment test.** The origin and CSRF rules are
  verified against the allow-list over real HTTP, but no staging host exists to
  prove a real cross-site deploy works.