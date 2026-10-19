# Account Deletion & Data Lifecycle

Implemented on `milestone3-authentication-user-accounts`. Route: `DELETE /api/v1/users/me`,
body `{ "password": "...", "confirm": "DELETE" }`. Frontend: Account settings →
**Delete account**.

## Preconditions

- The caller must hold a valid access token (a suspended or deleted account is
  refused by `AuthGuard` before this code runs).
- The current password must be supplied. A wrong password is `401 Password
  confirmation failed`, which is the same response a non-owner would get, so
  the endpoint reveals nothing about the account.
- `confirm` must be the literal string `DELETE`. This is a deliberate second
  step against an irreversible action.

The route is rate limited per account on top of both checks.

## What happens

Everything below runs in a single `prisma.$transaction`, so a failure part-way
through leaves the account untouched.

### Removed outright

| Data | Reason |
| --- | --- |
| `RefreshSession` rows | Removes every way back in, on every device. |
| `EmailVerificationToken`, `PasswordResetToken` rows | Outstanding links must not survive. |
| `EmailOutbox` rows for the account address | Removes undelivered recovery mail. |
| `Favorite`, `SavedSearch` | Purely personal. |
| `UserPreference`, `NotificationPreference` | Purely personal. |
| `BlockedUser` rows in both directions | Personal safety state. |
| `Report` rows the user filed | Personal; the moderation record keeps the action itself. |
| `TransactionParticipant` rows | Membership, not history; the transaction row and its milestones are retained. |
| `RequestOffer` rows where the user was the offerer | Live negotiation state with no meaning once the account is gone. |

### Withdrawn, not deleted

Anything the account still has "live" is withdrawn so it stops appearing in
browse and search, while the row and its history are kept:

- `Listing` in `DRAFT` or `PUBLISHED` → `ARCHIVED` with `deletedAt` set.
  `SOLD` and already-`ARCHIVED` listings are untouched.
- `NeedRequest` in `DRAFT` or `PUBLISHED` → `CANCELLED` with `deletedAt` set.
- `HousingListing`, `JobListing`, `ServiceListing`, `CommunityPost` in
  `PUBLISHED` → `ARCHIVED` with `deletedAt` set.

### Anonymized

| Column | Becomes |
| --- | --- |
| `User.status` | `DELETED` |
| `User.deletedAt` | now() |
| `User.email` | `deleted+<userId>@accounts.neighborly.invalid` |
| `User.passwordHash` | a syntactically valid Argon2 digest that verifies against nothing |
| `User.pendingEmail`, `pendingEmailAt` | null |
| `Profile.firstName`, `lastName` | `Deleted`, `Account` |
| `Profile.displayName`, `bio`, `neighborhood`, `city`, `state`, `avatarUrl`, `latitude`, `longitude` | null |

The tombstone address is unique per user, so the original address becomes
available for re-registration immediately. The `.invalid` TLD is reserved by
RFC 2606 and can never be delivered to or registered.

### Retained, and why

The `User` row itself is **not** deleted. This is the decision that keeps the
database consistent:

- Every other table keeps a valid foreign key. No orphan rows, no cascade
  wiping other people's content.
- Messages stay in their conversations. A peer's thread keeps its history; the
  author now renders as "Deleted Account".
- Reviews written about and by the account stay, attributed to the anonymized
  identity. Deleting third-party opinions would remove content other members
  are entitled to.
- Accepted transactions keep their milestones for dispute and refund records.

The trade-off is that the numeric user id, timestamps, and aggregate activity
counts survive. That is the standard anonymization trade: content integrity
without retaining usable identity.

## Idempotency

If the account is already deleted the service reports
`{ deleted: true, alreadyDeleted: true }` rather than failing. In practice a
second authenticated request cannot reach the method at all, because the
tombstone credential does not verify and the account is not `ACTIVE`; the
`alreadyDeleted` branch covers any future internal caller.

## Deletion is not irreversible for support purposes

No restore path is implemented. The row is anonymized, not dropped, so a
support engineer can identify the account by the tombstone address, but there
is no code that reverses the anonymization.

## Verification

`backend/src/users/account.integration.spec.ts`, run against disposable
PostgreSQL by `scripts/run-integration-tests.sh`:

- authorized deletion anonymizes the row and revokes all sessions
- the deleted account cannot log in, and the original address can be reused
- wrong password and missing `DELETE` confirmation are both refused and leave
  the account intact
- a peer's listing and a shared conversation, with its messages, survive
- no `RefreshSession` or token rows remain for the account