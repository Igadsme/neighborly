/*
  Milestone 7: the borrowing and lending domain.
  Additive only. Every statement adds a nullable or defaulted column, a new
  table, a new index, a new foreign key, or a new enum value. No existing row
  is read, rewritten, or deleted, and no existing constraint is tightened, so
  this is safe on a populated database.

  Assumptions and backfill:

  - Listing gains `borrowable` (default false), `maxBorrowDays`,
    `minNoticeHours` (default 12), `usageInstructions`, and `depositCents`.
    Existing listings therefore stay marketplace-only: nothing becomes
    borrowable without the lender opting in, so no backfill is required.
  - All Borrow* tables are new and empty.

  Double-booking protection:

  BorrowReservation carries one row per approved booking and a `releasedAt`
  column that is NULL exactly while the booking still blocks the item. A
  partial GiST exclusion constraint on (listingId, tsrange(startAt, endAt))
  makes overlapping live bookings on the same item *impossible* at the
  database level, rather than merely unlikely given correct application code.
  The range is half-open [startAt, endAt), so a booking ending at 10:00 and
  another beginning at 10:00 do not conflict.

  btree_gist is required so a uuid column can participate in an exclusion
  constraint alongside a range. Prisma does not model exclusion constraints,
  so it neither creates nor reports drift for this one; the constraint is
  created and dropped here by hand.

  Rollback: DROP TABLE "BorrowStatusEvent", "BorrowDisputeEvent",
  "BorrowDisputeEvidence", "BorrowDispute", "BorrowExtension",
  "BorrowConditionReport", "BorrowHandoff", "BorrowAvailabilityWindow",
  "BorrowReservation", "BorrowRequest"; DROP the new indexes on "Listing";
  ALTER TABLE "Listing" DROP COLUMN "borrowable", "maxBorrowDays",
  "minNoticeHours", "usageInstructions", "depositCents"; and ALTER TYPE
  ... DROP VALUE for each Borrow* enum. Dropping these tables destroys
  borrowing history, so a forward fix is preferred.
*/

-- Additive enum extension. These are brand new types, not extensions of
-- existing ones, so there is nothing to backfill.
CREATE TYPE "BorrowRequestStatus" AS ENUM (
    'REQUESTED', 'APPROVED', 'DECLINED', 'PICKUP_SCHEDULED', 'CHECKED_OUT',
    'RETURN_REQUESTED', 'RETURNED', 'COMPLETED', 'OVERDUE', 'CANCELLED',
    'DISPUTED'
);
CREATE TYPE "BorrowReservationStatus" AS ENUM ('ACTIVE', 'RELEASED');
CREATE TYPE "BorrowHandoffKind" AS ENUM ('PICKUP', 'RETURN');
CREATE TYPE "BorrowConditionPhase" AS ENUM ('BEFORE', 'AFTER');
CREATE TYPE "BorrowExtensionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED');
CREATE TYPE "BorrowDisputeReason" AS ENUM ('DAMAGE', 'MISSING_ITEM', 'LATE_RETURN', 'OTHER');
CREATE TYPE "BorrowDisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED');
CREATE TYPE "BorrowAvailabilityKind" AS ENUM ('UNAVAILABLE', 'AVAILABLE');

-- AlterTable: borrowing metadata on the existing listing.
ALTER TABLE "Listing"
  ADD COLUMN "borrowable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "maxBorrowDays" INTEGER,
  ADD COLUMN "minNoticeHours" INTEGER NOT NULL DEFAULT 12,
  ADD COLUMN "usageInstructions" TEXT,
  ADD COLUMN "depositCents" INTEGER;

-- CreateTable: one borrowing request per item per borrower.
CREATE TABLE "BorrowRequest" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "lenderId" UUID NOT NULL,
    "borrowerId" UUID NOT NULL,
    "status" "BorrowRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "message" TEXT,
    "originalEndAt" TIMESTAMP(3) NOT NULL,
    "depositCents" INTEGER,
    "approvedAt" TIMESTAMP(3),
    "checkedOutAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "overdueNotifiedAt" TIMESTAMP(3),
    "pickupInstructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- @updatedAt is maintained by the client, so there is deliberately no
    -- database default: a default would fight Prisma on every write.
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BorrowRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable: a confirmed booking. releasedAt NULL means it still blocks.
CREATE TABLE "BorrowReservation" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "borrowRequestId" UUID NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "status" "BorrowReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BorrowReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable: lender-declared open and blocked periods.
CREATE TABLE "BorrowAvailabilityWindow" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "kind" "BorrowAvailabilityKind" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BorrowAvailabilityWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable: two-sided pickup and return confirmation.
CREATE TABLE "BorrowHandoff" (
    "id" UUID NOT NULL,
    "borrowRequestId" UUID NOT NULL,
    "kind" "BorrowHandoffKind" NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "locationNote" TEXT,
    "borrowerConfirmedAt" TIMESTAMP(3),
    "lenderConfirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BorrowHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable: condition recorded at handoff, immutable once written.
CREATE TABLE "BorrowConditionReport" (
    "id" UUID NOT NULL,
    "borrowRequestId" UUID NOT NULL,
    "handoffId" UUID,
    "phase" "BorrowConditionPhase" NOT NULL,
    "condition" TEXT NOT NULL,
    "notes" TEXT,
    "reportedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BorrowConditionReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable: a request to keep the item longer.
CREATE TABLE "BorrowExtension" (
    "id" UUID NOT NULL,
    "borrowRequestId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "status" "BorrowExtensionStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedEndAt" TIMESTAMP(3) NOT NULL,
    "previousEndAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decidedById" UUID,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BorrowExtension_pkey" PRIMARY KEY ("id")
);

-- CreateTable: a dispute, with an append-only event trail.
CREATE TABLE "BorrowDispute" (
    "id" UUID NOT NULL,
    "borrowRequestId" UUID NOT NULL,
    "openedById" UUID NOT NULL,
    "reason" "BorrowDisputeReason" NOT NULL,
    "status" "BorrowDisputeStatus" NOT NULL DEFAULT 'OPEN',
    "summary" TEXT NOT NULL,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BorrowDispute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BorrowDisputeEvidence" (
    "id" UUID NOT NULL,
    "disputeId" UUID,
    "conditionReportId" UUID,
    "listingId" UUID NOT NULL,
    "uploadedById" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BorrowDisputeEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BorrowDisputeEvent" (
    "id" UUID NOT NULL,
    "disputeId" UUID NOT NULL,
    "actorId" UUID,
    "fromStatus" "BorrowDisputeStatus",
    "toStatus" "BorrowDisputeStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BorrowDisputeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable: append-only borrowing history.
CREATE TABLE "BorrowStatusEvent" (
    "id" UUID NOT NULL,
    "borrowRequestId" UUID NOT NULL,
    "fromStatus" "BorrowRequestStatus",
    "toStatus" "BorrowRequestStatus" NOT NULL,
    "actorId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BorrowStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Listing_borrowable_status_categoryId_createdAt_idx" ON "Listing"("borrowable", "status", "categoryId", "createdAt");
CREATE INDEX "Listing_borrowable_sellerId_status_idx" ON "Listing"("borrowable", "sellerId", "status");

CREATE INDEX "BorrowRequest_listingId_status_idx" ON "BorrowRequest"("listingId", "status");
CREATE INDEX "BorrowRequest_borrowerId_status_createdAt_idx" ON "BorrowRequest"("borrowerId", "status", "createdAt");
CREATE INDEX "BorrowRequest_lenderId_status_createdAt_idx" ON "BorrowRequest"("lenderId", "status", "createdAt");
-- The overdue sweep walks only live requests whose due date has passed.
CREATE INDEX "BorrowRequest_status_endAt_idx" ON "BorrowRequest"("status", "endAt");

CREATE INDEX "BorrowReservation_listingId_status_startAt_idx" ON "BorrowReservation"("listingId", "status", "startAt");
CREATE UNIQUE INDEX "BorrowReservation_borrowRequestId_key" ON "BorrowReservation"("borrowRequestId");

CREATE INDEX "BorrowAvailabilityWindow_listingId_startsAt_idx" ON "BorrowAvailabilityWindow"("listingId", "startsAt");
CREATE UNIQUE INDEX "BorrowHandoff_borrowRequestId_kind_key" ON "BorrowHandoff"("borrowRequestId", "kind");
CREATE INDEX "BorrowHandoff_kind_scheduledAt_idx" ON "BorrowHandoff"("kind", "scheduledAt");
CREATE UNIQUE INDEX "BorrowConditionReport_handoffId_key" ON "BorrowConditionReport"("handoffId");
CREATE INDEX "BorrowConditionReport_borrowRequestId_phase_idx" ON "BorrowConditionReport"("borrowRequestId", "phase");
CREATE INDEX "BorrowExtension_borrowRequestId_status_idx" ON "BorrowExtension"("borrowRequestId", "status");
CREATE INDEX "BorrowDispute_borrowRequestId_status_idx" ON "BorrowDispute"("borrowRequestId", "status");
CREATE INDEX "BorrowDispute_status_createdAt_idx" ON "BorrowDispute"("status", "createdAt");
CREATE INDEX "BorrowDisputeEvidence_disputeId_createdAt_idx" ON "BorrowDisputeEvidence"("disputeId", "createdAt");
CREATE INDEX "BorrowDisputeEvidence_conditionReportId_idx" ON "BorrowDisputeEvidence"("conditionReportId");
CREATE INDEX "BorrowDisputeEvent_disputeId_createdAt_idx" ON "BorrowDisputeEvent"("disputeId", "createdAt");
CREATE INDEX "BorrowStatusEvent_borrowRequestId_createdAt_idx" ON "BorrowStatusEvent"("borrowRequestId", "createdAt");

-- AddForeignKey
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_lenderId_fkey"
  FOREIGN KEY ("lenderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BorrowRequest" ADD CONSTRAINT "BorrowRequest_borrowerId_fkey"
  FOREIGN KEY ("borrowerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BorrowReservation" ADD CONSTRAINT "BorrowReservation_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BorrowReservation" ADD CONSTRAINT "BorrowReservation_borrowRequestId_fkey"
  FOREIGN KEY ("borrowRequestId") REFERENCES "BorrowRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BorrowAvailabilityWindow" ADD CONSTRAINT "BorrowAvailabilityWindow_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BorrowHandoff" ADD CONSTRAINT "BorrowHandoff_borrowRequestId_fkey"
  FOREIGN KEY ("borrowRequestId") REFERENCES "BorrowRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BorrowConditionReport" ADD CONSTRAINT "BorrowConditionReport_borrowRequestId_fkey"
  FOREIGN KEY ("borrowRequestId") REFERENCES "BorrowRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BorrowConditionReport" ADD CONSTRAINT "BorrowConditionReport_handoffId_fkey"
  FOREIGN KEY ("handoffId") REFERENCES "BorrowHandoff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BorrowConditionReport" ADD CONSTRAINT "BorrowConditionReport_reportedById_fkey"
  FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BorrowExtension" ADD CONSTRAINT "BorrowExtension_borrowRequestId_fkey"
  FOREIGN KEY ("borrowRequestId") REFERENCES "BorrowRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BorrowExtension" ADD CONSTRAINT "BorrowExtension_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BorrowExtension" ADD CONSTRAINT "BorrowExtension_decidedById_fkey"
  FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BorrowDispute" ADD CONSTRAINT "BorrowDispute_borrowRequestId_fkey"
  FOREIGN KEY ("borrowRequestId") REFERENCES "BorrowRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BorrowDispute" ADD CONSTRAINT "BorrowDispute_openedById_fkey"
  FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BorrowDisputeEvidence" ADD CONSTRAINT "BorrowDisputeEvidence_disputeId_fkey"
  FOREIGN KEY ("disputeId") REFERENCES "BorrowDispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BorrowDisputeEvidence" ADD CONSTRAINT "BorrowDisputeEvidence_conditionReportId_fkey"
  FOREIGN KEY ("conditionReportId") REFERENCES "BorrowConditionReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BorrowDisputeEvidence" ADD CONSTRAINT "BorrowDisputeEvidence_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BorrowDisputeEvidence" ADD CONSTRAINT "BorrowDisputeEvidence_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BorrowDisputeEvent" ADD CONSTRAINT "BorrowDisputeEvent_disputeId_fkey"
  FOREIGN KEY ("disputeId") REFERENCES "BorrowDispute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BorrowStatusEvent" ADD CONSTRAINT "BorrowStatusEvent_borrowRequestId_fkey"
  FOREIGN KEY ("borrowRequestId") REFERENCES "BorrowRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The core invariant: one item cannot hold two overlapping live bookings.
--
-- The range is half-open [startAt, endAt), matching the domain convention, so
-- a booking ending exactly when the next begins is allowed. `releasedAt IS
-- NULL` means only a booking that still blocks the item participates, which
-- is what lets a cancelled or completed borrowing free the dates without
-- deleting its audit trail.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "BorrowReservation"
  ADD CONSTRAINT "BorrowReservation_no_overlap"
  EXCLUDE USING gist (
    "listingId" WITH =,
    tsrange("startAt", "endAt", '[)') WITH &&
  )
  WHERE ("releasedAt" IS NULL);

-- A booking can never end before it starts. Checked here as well as in the
-- service, because this one is a data invariant rather than a business rule.
ALTER TABLE "BorrowReservation"
  ADD CONSTRAINT "BorrowReservation_end_after_start" CHECK ("endAt" > "startAt");

ALTER TABLE "BorrowRequest"
  ADD CONSTRAINT "BorrowRequest_end_after_start" CHECK ("endAt" > "startAt");

ALTER TABLE "BorrowAvailabilityWindow"
  ADD CONSTRAINT "BorrowAvailabilityWindow_end_after_start" CHECK ("endsAt" > "startsAt");

-- A member cannot borrow from themselves, enforced by the database rather
-- than only by the service.
ALTER TABLE "BorrowRequest"
  ADD CONSTRAINT "BorrowRequest_not_self" CHECK ("borrowerId" <> "lenderId");