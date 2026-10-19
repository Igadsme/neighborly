/*
  Milestone 9: Neighborhood Missions and Community.
  Additive only. Five new tables, five new enums, two new enum values, and no
  change to any existing table except an additive enum extension.

  Assumptions and backfill:

  - Every new table is new and empty, so there is nothing to backfill.
  - ReportTargetType gains MISSION and MISSION_PARTICIPANT so community
    moderation reuses the existing Report and ModerationAction audit surface
    instead of a second queue with different guarantees.

  The load-bearing constraint in this migration is
  NeighborhoodMission_confirmedCount_capacity_check. Overbooking is prevented
  by a single atomic UPDATE guarded by that check, not by counting rows in the
  service: with the check in place, PostgreSQL itself refuses the increment
  that would exceed capacity, so two simultaneous joins for the last slot
  cannot both succeed no matter how the application is written.

  Rollback: ALTER TYPE "ReportTargetType" DROP VALUE 'MISSION_PARTICIPANT';
  ALTER TYPE "ReportTargetType" DROP VALUE 'MISSION'; then DROP TABLE
  "MissionModerationEvent", "MemberBadge", "CommunityBadge",
  "MissionStatusEvent", "MissionParticipant", "NeighborhoodMission"; and drop
  the enums MissionModerationKind, MissionParticipantStatus, MissionStatus,
  MissionCategory. Dropping these destroys mission history and badge awards,
  so a forward fix is preferred.
*/

-- Additive enum values, declared first because ALTER TYPE ... ADD VALUE
-- cannot run inside a transaction block on older PostgreSQL.
ALTER TYPE "ReportTargetType" ADD VALUE IF NOT EXISTS 'MISSION';
ALTER TYPE "ReportTargetType" ADD VALUE IF NOT EXISTS 'MISSION_PARTICIPANT';

CREATE TYPE "MissionCategory" AS ENUM (
    'CLEANUP', 'GARDENING', 'DONATION', 'VOLUNTEER', 'ASSISTANCE', 'IMPROVEMENT'
);
CREATE TYPE "MissionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "MissionParticipantStatus" AS ENUM (
    'WAITLISTED', 'CONFIRMED', 'CHECKED_IN', 'ATTENDED', 'VERIFIED', 'WITHDRAWN', 'REMOVED'
);
CREATE TYPE "MissionModerationKind" AS ENUM (
    'HIDDEN', 'RESTORED', 'PARTICIPANT_REMOVED', 'REPORT_RESOLVED'
);

-- CreateTable
CREATE TABLE "NeighborhoodMission" (
    "id" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "MissionCategory" NOT NULL,
    "status" "MissionStatus" NOT NULL DEFAULT 'DRAFT',
    -- Neighborhood and city only. A mission deliberately has no coordinates:
    -- the meeting point is participant-only text, never a public location.
    "neighborhood" TEXT,
    "city" TEXT,
    "meetingPoint" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 10,
    "confirmedCount" INTEGER NOT NULL DEFAULT 0,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "requiresStaffVerification" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- @updatedAt is maintained by the client, so no database default.
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NeighborhoodMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionParticipant" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "MissionParticipantStatus" NOT NULL DEFAULT 'WAITLISTED',
    "waitlistPosition" INTEGER,
    "consentedAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "attendanceMarkedById" UUID,
    "attendanceMarkedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" UUID,
    "withdrawnAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "removalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MissionParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionStatusEvent" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "actorId" UUID,
    "fromStatus" "MissionStatus",
    "toStatus" "MissionStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MissionStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityBadge" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityBadge_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "MemberBadge" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "missionId" UUID,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,
    CONSTRAINT "MemberBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionModerationEvent" (
    "id" UUID NOT NULL,
    "missionId" UUID NOT NULL,
    "actorId" UUID,
    "kind" "MissionModerationKind" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MissionModerationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NeighborhoodMission_status_startAt_idx" ON "NeighborhoodMission"("status", "startAt");
CREATE INDEX "NeighborhoodMission_organizerId_status_idx" ON "NeighborhoodMission"("organizerId", "status");
CREATE INDEX "NeighborhoodMission_category_status_startAt_idx"
  ON "NeighborhoodMission"("category", "status", "startAt");

-- The duplicate-join guard. It lives here rather than in the service so that a
-- retry, a race, or a second code path cannot create a second participation
-- row for the same person and mission.
CREATE UNIQUE INDEX "MissionParticipant_missionId_userId_key"
  ON "MissionParticipant"("missionId", "userId");
CREATE INDEX "MissionParticipant_missionId_status_idx"
  ON "MissionParticipant"("missionId", "status");
CREATE INDEX "MissionParticipant_userId_status_idx"
  ON "MissionParticipant"("userId", "status");
-- Waitlist promotion reads the next slot in order.
CREATE INDEX "MissionParticipant_missionId_waitlistPosition_idx"
  ON "MissionParticipant"("missionId", "waitlistPosition");

CREATE INDEX "MissionStatusEvent_missionId_createdAt_idx"
  ON "MissionStatusEvent"("missionId", "createdAt");

-- Idempotent badge award. Revocation sets revokedAt rather than deleting, and
-- a re-award clears it, so the constraint still holds across a reversal.
CREATE UNIQUE INDEX "MemberBadge_userId_code_key" ON "MemberBadge"("userId", "code");
CREATE INDEX "MemberBadge_userId_revokedAt_idx" ON "MemberBadge"("userId", "revokedAt");

CREATE INDEX "MissionModerationEvent_missionId_createdAt_idx"
  ON "MissionModerationEvent"("missionId", "createdAt");
CREATE INDEX "MissionModerationEvent_kind_createdAt_idx"
  ON "MissionModerationEvent"("kind", "createdAt");

-- AddForeignKey
-- RESTRICT rather than CASCADE on the history-bearing relations: deleting an
-- account or a mission must not silently erase the record that somebody
-- verified participation or that a mission was moderated.
ALTER TABLE "NeighborhoodMission" ADD CONSTRAINT "NeighborhoodMission_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MissionParticipant" ADD CONSTRAINT "MissionParticipant_missionId_fkey"
  FOREIGN KEY ("missionId") REFERENCES "NeighborhoodMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MissionParticipant" ADD CONSTRAINT "MissionParticipant_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MissionParticipant" ADD CONSTRAINT "MissionParticipant_attendanceMarkedById_fkey"
  FOREIGN KEY ("attendanceMarkedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MissionParticipant" ADD CONSTRAINT "MissionParticipant_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MissionStatusEvent" ADD CONSTRAINT "MissionStatusEvent_missionId_fkey"
  FOREIGN KEY ("missionId") REFERENCES "NeighborhoodMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MissionStatusEvent" ADD CONSTRAINT "MissionStatusEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MemberBadge" ADD CONSTRAINT "MemberBadge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberBadge" ADD CONSTRAINT "MemberBadge_code_fkey"
  FOREIGN KEY ("code") REFERENCES "CommunityBadge"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
-- SET NULL rather than CASCADE: revoking a badge that came from a removed
-- mission keeps the award row, so the record of what was once claimed and
-- when it was withdrawn survives.
ALTER TABLE "MemberBadge" ADD CONSTRAINT "MemberBadge_missionId_fkey"
  FOREIGN KEY ("missionId") REFERENCES "MissionParticipant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MissionModerationEvent" ADD CONSTRAINT "MissionModerationEvent_missionId_fkey"
  FOREIGN KEY ("missionId") REFERENCES "NeighborhoodMission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MissionModerationEvent" ADD CONSTRAINT "MissionModerationEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data-level invariants, so a bad write cannot produce a mission that is
-- impossible to interpret.
ALTER TABLE "NeighborhoodMission"
  ADD CONSTRAINT "NeighborhoodMission_time_order" CHECK ("endAt" > "startAt");

-- The capacity guard. This is the whole concurrency story: the join path
-- issues a single UPDATE ... WHERE "confirmedCount" < "capacity", and this
-- check makes the database refuse any increment that would overbook, so the
-- losing writer simply affects zero rows instead of exceeding capacity.
ALTER TABLE "NeighborhoodMission"
  ADD CONSTRAINT "NeighborhoodMission_confirmedCount_capacity_check"
  CHECK ("confirmedCount" >= 0 AND "confirmedCount" <= "capacity");

ALTER TABLE "NeighborhoodMission"
  ADD CONSTRAINT "NeighborhoodMission_capacity_positive" CHECK ("capacity" >= 1);

-- A waitlist position only means something while someone is waiting, so a
-- row that has left the waitlist must not keep a stale position.
--
-- Deliberately one-directional. The stronger form (every WAITLISTED row must
-- carry a position) would make the column's own default unusable: the service
-- assigns positions in order inside a transaction, and a constraint that
-- forbade the intermediate state would only add a way to fail.
ALTER TABLE "MissionParticipant"
  ADD CONSTRAINT "MissionParticipant_waitlist_consistent"
  CHECK ("status" = 'WAITLISTED' OR "waitlistPosition" IS NULL);

-- Verified participation is a claim about evidence, so the evidence fields
-- must exist whenever the status does.
ALTER TABLE "MissionParticipant"
  ADD CONSTRAINT "MissionParticipant_verified_requires_attendance"
  CHECK ("status" <> 'VERIFIED' OR ("verifiedAt" IS NOT NULL AND "attendanceMarkedAt" IS NOT NULL));
-- Seed the badge catalogue.
--
-- The wording of a badge lives with its definition, not with the code that
-- awards it, so a passport and the award path can never disagree about what a
-- badge means. Seeded idempotently: re-running the file is harmless, and an
-- existing row is never overwritten by a later migration.
INSERT INTO "CommunityBadge" ("code", "label", "description", "explanation", "sortOrder")
VALUES
  ('FIRST_HELPER', 'First verified helper',
   'Verified attendance at one neighborhood mission.',
   'A moderator or the organizing neighbor confirmed you were present at one mission that was actually completed. Clicking Join was never enough.',
   10),
  ('COMMUNITY_BUILDER', 'Community builder',
   'Verified attendance at three neighborhood missions.',
   'You have confirmed attendance at three separate missions. Three is where showing up stops being luck.',
   20),
  ('NEIGHBORHOOD_ANCHOR', 'Neighborhood anchor',
   'Verified attendance at ten neighborhood missions.',
   'Ten confirmed missions. This is a record of time spent, not an estimate of impact, and Neighborly makes no claim beyond the count.',
   30),
  ('GENEROUS_LENDER', 'Generous lender',
   'Completed three Neighborly Borrow loans as the lender.',
   'You have lent items to three neighbors and all three borrowings were completed. This counts lending, not borrowing.',
   40)
ON CONFLICT ("code") DO NOTHING;
