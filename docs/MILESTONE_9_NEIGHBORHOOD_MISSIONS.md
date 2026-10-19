# Milestone 9 — Neighborhood Missions & Community

Branch: `milestone9-neighborhood-missions-community`, branched from the Milestone 8
commit (`8814e27`).

Missions turn Neighborly from a place where you *ask* for something into a place
where you *show up*. That is a different kind of commitment, and it is the first
feature in the product where the database has to refuse something on its own
rather than trusting the service layer to behave. The overbooking constraint
described below is the reason this milestone is heavier in SQL than it looks in
TypeScript.

No production system was touched. All verification ran against disposable
containers.

## Acceptance criteria

| # | Requirement | Status |
| --- | --- | --- |
| 9A | Mission lifecycle | Done |
| 9B | Joining, capacity and waitlist | Done |
| 9C | Attendance and verification | Done |
| 9D | Badges and contributions | Done |
| 9E | Moderation and reporting | Done |
| 9F | Missions frontend | Done |
| 9G | Database | Done |
| 9H | Testing | Done |

## The decision that shaped everything: the database refuses overbooking

Two neighbors pressing "join" on the last slot is not a race the service can
win. Whatever the application code does, an interleaving exists where both read
`confirmedCount = 9`, both compute a free seat, and both write 10.

So the invariant is not in TypeScript. It is a table constraint:

```
NeighborhoodMission_confirmedCount_capacity_check
  CHECK ("confirmedCount" >= 0 AND "confirmedCount" <= "capacity")
```

Joining is a single atomic `UPDATE` guarded by that check. PostgreSQL refuses
the increment that would exceed capacity, so the second join fails regardless of
how the service is written or how many instances are running. Counting rows in
the service, or checking then inserting in application code, would both be
wrong; only the constraint is load-bearing.

The same philosophy applies to the other invariants the migration adds:
`endAt > startAt`, `capacity >= 1`, a waitlist position present only for
`WAITLISTED` rows, and `VERIFIED` rows requiring both `verifiedAt` and
`attendanceMarkedAt`. Each is a `CHECK` rather than an application rule.

## Mission lifecycle

```
DRAFT ──▶ PUBLISHED ──▶ COMPLETED ──▶ ARCHIVED
            │
            └──▶ CANCELLED
```

`DRAFT` is visible only to its organizer and never appears in discovery. All
transitions are validated in the service and recorded in `MissionStatusEvent`,
so a mission's history is reconstructable rather than inferred from the current
row.

Participation has its own ladder, kept separate from mission status because
they fail for different reasons:

```
WAITLISTED → CONFIRMED → CHECKED_IN → ATTENDED → VERIFIED
     └──────────────→ WITHDRAWN / REMOVED
```

## Privacy: the meeting point is not public

A published mission shows the neighborhood, category, time and how many places
remain. It does **not** show the meeting point. The exact address is returned
only to confirmed participants — a detail withheld by the server, not hidden by
the client. The frontend test suite asserts this in both directions ("never
renders a meeting point the server withheld" / "shows the meeting point to a
confirmed participant") so a future refactor cannot quietly reintroduce the leak.

The participant roster follows the same rule: non-participants cannot enumerate
who is coming, and the attendance list is organizer- or staff-only until the
mission completes.

## Roles are checked in the service, not in the route

Every route in `missions.controller.ts` is behind `AuthGuard`, but the guard
proves *who* the caller is, not *what they may do*. Authorization lives in
`missions.service.ts`, which is where each mutation re-derives the caller's
right from mission state:

- `updateMission` resolves through `organizerMission`, so a non-organizer
  cannot edit someone else's mission even with a valid token.
- Attendance confirmation, completion, revocation and moderation each call
  `passport.assertStaff` when the staff variant is used, and separately refuse
  the organizer-only actions.
- A suspended or deleted account is refused at mission creation.

The moderation method carries an explicit comment that the role check happens
in the service "rather than inferred from the route that reached this method",
which is the correct defense if a route is ever aliased or reused.

Lowering a mission's capacity below the current confirmed headcount is refused
rather than applied, because silently invalidating someone's confirmed slot is
worse than rejecting an edit.

## Badges

Four badges are awarded from **verified** participation, not from attendance:

| Code | Requires |
| --- | --- |
| `FIRST_HELPER` | 1 verified mission |
| `COMMUNITY_BUILDER` | Community-builder threshold of verified missions |
| `NEIGHBORHOOD_ANCHOR` | Anchor threshold of verified missions |
| `GENEROUS_LENDER` | Completed borrowings, carried over from Milestone 7 |

The distinction matters: `VERIFIED` requires that attendance was *marked* and
then confirmed, so badges cannot be accumulated by organizers marking their own
mission complete.

## Database

Migration `0013_neighborhood_missions` adds six models (`NeighborhoodMission`,
`MissionParticipant`, `MissionStatusEvent`, `CommunityBadge`, `MemberBadge`,
`MissionModerationEvent`) and four enums (`MissionCategory`, `MissionStatus`,
`MissionParticipantStatus`, `MissionModerationKind`), plus `MISSION` and
`MISSION_PARTICIPANT` report targets. Its header comment documents the forward
rollback and states plainly that dropping these tables destroys mission history
and badge awards, so a forward fix is preferred.

## Testing

| Suite | Result |
| --- | --- |
| Storage integration (`scripts/run-storage-tests.sh`, real PostgreSQL 16 + rustfs S3) | 3 suites, 33 tests, all passing |
| Missions integration against real PostgreSQL | 1 suite, 54 tests, all passing |
| Mission frontend flows (`vitest`) | 1 file, 34 tests, all passing |

The storage script is self-contained: it starts disposable PostgreSQL on
localhost:55435 and a disposable S3-compatible object store on localhost:59000,
applies the full migration chain from a clean database, runs the suite, and
removes both containers on exit. It never touches the development Compose
stack, staging, or any production host.

The missions integration suite runs against a real database rather than a mock
precisely because the overbooking guarantee is a database property. A mocked
Prisma client would have passed regardless of whether the constraint existed.

## Verification performed

| Check | Result |
| --- | --- |
| Docker connectivity | Docker Desktop 29.8.0, server reachable |
| Migration chain applies from clean database | Pass (via `prisma migrate deploy` in the storage script) |
| `prisma migrate diff --from-migrations → --to-schema-datamodel` | **No difference detected** |
| `bash scripts/run-storage-tests.sh` | 3 suites / 33 tests passing |
| Missions integration against real PostgreSQL | 1 suite / 54 tests passing |
| Mission frontend flows (`vitest`) | 1 file / 34 tests passing |
| Secret scan of the full diff | No credentials; only test stubs (`$argon2id$stub`) and identifiers |
| Tracked `.env` files | None |
| Destructive DDL in migration | None executable; the `DROP TABLE` appears only in the rollback comment |
| Debug leftovers / `.only` in new code | None |

## Security review

- **Secrets** — no keys, tokens or passwords in the diff. The only matches were
  test fixtures. `.env` and `.env.staging` remain untracked and ignored.
- **Authentication** — all mission routes require `AuthGuard`; the feed and
  public mission detail use `OptionalAuthGuard` so anonymous browsing still
  works while personalizing signed-in views.
- **Authorization** — ownership and role checks are in the service layer and
  were reviewed per-mutation; see above.
- **Rate limiting** — a `missions` policy (20/hour, `RATE_LIMIT_MISSIONS`)
  joins the existing table and is registered in `env.validation.ts`, so it
  cannot be silently unset.
- **Input handling** — user text passes through `sanitizeText` / `sanitizeOptional`
  with explicit length caps (title 120, description 4000, meeting point 500).
- **Mass assignment** — `updateMission` builds an explicit allowlist of
  writable fields; it does not spread the DTO into the update.

## Known limitations

- Badge thresholds for `COMMUNITY_BUILDER` and `NEIGHBORHOOD_ANCHOR` are
  constants in `badges.ts`; making them per-neighbourhood would need a separate
  decision.
- Reminders depend on `MISSION_REMINDER_POLL_MS`, which is optional and falls
  back to the default poll interval.