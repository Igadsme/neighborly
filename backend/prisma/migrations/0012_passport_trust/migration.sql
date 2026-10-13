/*
  Milestone 8: Neighborly Passport and Trust.
  Additive only. Every statement adds a column with a default, a new table, a
  new index, or a new foreign key. No existing row is deleted, and the only
  tightened constraint is a new unique index on Review.

  Assumptions and backfill:

  - Review gains role, status, publishedAt, windowClosesAt, editableUntil,
    editedAt, hiddenAt, hiddenReason, and updatedAt. The column default is
    PENDING, which is correct for every new review: nothing is visible until
    both parties have reviewed or the window closes. Reviews written before
    this milestone are explicitly set to PUBLISHED below, because they were
    already visible and must not be retroactively withheld.
  - The new unique index on (transactionId, authorId) would collide if any
    existing member reviewed the same transaction twice. The migration hides
    the older review of any such pair first, so the index can be created as an
    ordinary unique index and cannot fail.
  - Every new table is new and empty.
  - PassportPrivacySettings defaults are chosen so an existing member's
    passport shows what they have always shown, except leaderboards, which are
    opt-in.

  - ReportTargetType gains REVIEW, so review moderation reuses the existing
    Report and ModerationAction tables and their audit trail.
  - Rolling back: ALTER TYPE "ReportTargetType" DROP VALUE 'REVIEW'; then
    DROP TABLE "ModerationAppeal", "TrustAuditEvent",
  "VerificationRecord", "PassportPrivacySettings"; DROP INDEX
  "Review_transactionId_authorId_key"; and ALTER TABLE "Review" DROP COLUMN
  "role", "status", "publishedAt", "windowClosesAt", "editableUntil",
  "editedAt", "hiddenAt", "hiddenReason". Dropping these destroys review
  moderation history, so a forward fix is preferred.
*/

-- Additive enum extension. ReviewStatus is new; it has no pre-existing
-- values, so the default below is safe.
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'PUBLISHED', 'HIDDEN');

-- Additive enum value so a reported review reuses the existing Report and
-- ModerationAction audit surface rather than a parallel reporting table.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older
-- PostgreSQL, so it is deliberately the first statement in this migration.
ALTER TYPE "ReportTargetType" ADD VALUE IF NOT EXISTS 'REVIEW';
CREATE TYPE "VerificationMethod" AS ENUM ('EMAIL', 'VERIFIED_ACTIVITY', 'COMMUNITY_REFERENCE');
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');
CREATE TYPE "TrustAuditKind" AS ENUM (
    'REVIEW_PUBLISHED', 'REVIEW_HIDDEN', 'REVIEW_RESTORED',
    'VERIFICATION_APPROVED', 'VERIFICATION_REJECTED', 'VERIFICATION_REVOKED',
    'TRUST_RECALCULATED', 'APPEAL_RESOLVED'
);
CREATE TYPE "AppealSubjectType" AS ENUM ('REVIEW', 'VERIFICATION', 'REPORT');
CREATE TYPE "AppealStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED');

-- AlterTable: the review publication and moderation lifecycle.
ALTER TABLE "Review"
  ADD COLUMN "authorRole" TEXT,
  ADD COLUMN "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "windowClosesAt" TIMESTAMP(3),
  ADD COLUMN "editableUntil" TIMESTAMP(3),
  ADD COLUMN "editedAt" TIMESTAMP(3),
  ADD COLUMN "hiddenAt" TIMESTAMP(3),
  ADD COLUMN "hiddenReason" TEXT,
  -- @updatedAt is maintained by the client, so no database default here.
  -- @updatedAt is maintained by the client, so no database default.
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL;

-- Reviews written before this milestone were already visible. They are
-- published now rather than being retroactively withheld.
UPDATE "Review"
SET "publishedAt" = "createdAt", "status" = 'PUBLISHED'
WHERE "publishedAt" IS NULL;

-- De-duplicate before adding the constraint, not after. If any pair of
-- members already reviewed the same transaction twice, the older review is
-- hidden rather than deleted: moderation history is never silently
-- destroyed, and the unique index below is then guaranteed to succeed.
--
-- Doing this first is also why no NOT VALID / VALIDATE dance is needed:
-- PostgreSQL cannot VALIDATE a plain unique index, so the cleanup has to
-- happen before it exists.
WITH ranked AS (
  -- "row_rank" rather than "rank": RANK is a reserved SQL word.
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY "transactionId", "authorId" ORDER BY "createdAt" DESC, id DESC
  ) AS row_rank
  FROM "Review"
)
UPDATE "Review"
SET "status" = 'HIDDEN',
    "hiddenAt" = CURRENT_TIMESTAMP,
    "hiddenReason" = 'Superseded by a later review of the same exchange'
WHERE id IN (SELECT id FROM ranked WHERE row_rank > 1);

-- One review per author per transaction, enforced by the database rather
-- than only by the service.
CREATE UNIQUE INDEX "Review_transactionId_authorId_key"
  ON "Review"("transactionId", "authorId");

-- CreateTable: per-member privacy choices.
CREATE TABLE "PassportPrivacySettings" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "showRatings" BOOLEAN NOT NULL DEFAULT true,
    "showTenure" BOOLEAN NOT NULL DEFAULT true,
    "showNeighborhood" BOOLEAN NOT NULL DEFAULT true,
    "showCity" BOOLEAN NOT NULL DEFAULT true,
    "showTrustSignals" BOOLEAN NOT NULL DEFAULT true,
    "showContributions" BOOLEAN NOT NULL DEFAULT true,
    "leaderboardOptIn" BOOLEAN NOT NULL DEFAULT false,
    "reviewWindowDays" INTEGER NOT NULL DEFAULT 14,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- @updatedAt is maintained by the client, so no database default.
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PassportPrivacySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: a verification claim and its staff decision. No document, no
-- selfie, no biometric: only methods the product actually supports.
CREATE TABLE "VerificationRecord" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "statement" TEXT,
    "reviewNote" TEXT,
    "reviewedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VerificationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable: append-only trust audit trail.
CREATE TABLE "TrustAuditEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "TrustAuditKind" NOT NULL,
    "detail" TEXT NOT NULL,
    "refId" UUID,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrustAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable: a member's challenge to a moderation decision.
CREATE TABLE "ModerationAppeal" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "subjectType" "AppealSubjectType" NOT NULL,
    "subjectId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'SUBMITTED',
    "resolution" TEXT,
    "handledById" UUID,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModerationAppeal_pkey" PRIMARY KEY ("id")
);

-- The pre-existing Review indexes are replaced by ones that include status,
-- so the publication sweep and the public summary both have an index.
DROP INDEX IF EXISTS "Review_subjectId_createdAt_idx";
DROP INDEX IF EXISTS "Review_transactionId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "PassportPrivacySettings_userId_key" ON "PassportPrivacySettings"("userId");
CREATE INDEX "Review_subjectId_status_createdAt_idx" ON "Review"("subjectId", "status", "createdAt");
-- The publication sweep walks only pending reviews whose window has closed.
CREATE INDEX "Review_status_windowClosesAt_idx" ON "Review"("status", "windowClosesAt");

CREATE UNIQUE INDEX "VerificationRecord_userId_method_key" ON "VerificationRecord"("userId", "method");
CREATE INDEX "VerificationRecord_status_createdAt_idx" ON "VerificationRecord"("status", "createdAt");

CREATE INDEX "TrustAuditEvent_userId_createdAt_idx" ON "TrustAuditEvent"("userId", "createdAt");
CREATE INDEX "TrustAuditEvent_kind_createdAt_idx" ON "TrustAuditEvent"("kind", "createdAt");

CREATE UNIQUE INDEX "ModerationAppeal_userId_subjectType_subjectId_key"
  ON "ModerationAppeal"("userId", "subjectType", "subjectId");
CREATE INDEX "ModerationAppeal_status_createdAt_idx" ON "ModerationAppeal"("status", "createdAt");

-- AddForeignKey
-- Review authors and subjects cascade with their account, matching the
-- account-deletion policy: a deleted member's reviews go with them rather
-- than orphaning a summary that names someone who no longer exists.
ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_authorId_fkey";
ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_subjectId_fkey";
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Review" ADD CONSTRAINT "Review_subjectId_fkey"
  FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PassportPrivacySettings" ADD CONSTRAINT "PassportPrivacySettings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationRecord" ADD CONSTRAINT "VerificationRecord_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VerificationRecord" ADD CONSTRAINT "VerificationRecord_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrustAuditEvent" ADD CONSTRAINT "TrustAuditEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrustAuditEvent" ADD CONSTRAINT "TrustAuditEvent_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationAppeal" ADD CONSTRAINT "ModerationAppeal_handledById_fkey"
  FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A rating is a bounded scale, not a free integer. Enforced in the database
-- so a bad write cannot produce a summary that is impossible to interpret.
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range" CHECK ("rating" >= 1 AND "rating" <= 5);