/*
  Milestone 5: request lifecycle, matching, and the domain-event outbox.
  Additive only: every statement adds a nullable column with a default, a
  new table, an index, or a foreign key. No existing row is read or
  rewritten, no constraint is tightened, and nothing is deleted, so this is
  safe on a populated database.

  Assumptions and backfill:
  - statusChangedAt defaults to now(). Historical requests get the migration
    time rather than their true last transition, which is acceptable for an
    ordering tiebreaker; no backfill of past transitions is possible because
    the previous schema did not record them.
  - budgetFlexible defaults to true, matching the pre-existing behavior where
    a request with a single budgetCents accepted any offer.
  - RequestMatch.reasons is NOT NULL with a '{}' default. The table had no
    writer before this migration, so there are nothing to backfill; the
    default only keeps the migration applicable if rows do exist.
  - DomainEventOutbox is new and empty.
  - RequestStatus gains PAUSED and FULFILLED. Adding enum values is additive:
    no existing row is rewritten and no value is removed or renamed, so the
    change cannot invalidate stored data.

  Rollback: DROP TABLE "DomainEventOutbox", "RequestStatusEvent";
  DROP the indexes listed below; and
  ALTER TABLE "NeedRequest" DROP COLUMN "statusChangedAt", "fulfilledAt",
  "budgetFlexible", "minBudgetCents", "requirements", "city", "neighborhood";
  ALTER TABLE "RequestMatch" DROP COLUMN "rank", "reasons", "computedAt".
  Dropping these tables destroys matching explanations and status history, so
  a forward fix is preferred.
*/

-- Additive enum extension: PAUSED and FULFILLED join the existing statuses.
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older
-- PostgreSQL, so this is intentionally the first statement in the migration.
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'FULFILLED';

-- AlterTable: lifecycle and budget columns.
ALTER TABLE "NeedRequest"
  ADD COLUMN "minBudgetCents" INTEGER,
  ADD COLUMN "budgetFlexible" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "requirements" JSONB,
  ADD COLUMN "neighborhood" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "fulfilledAt" TIMESTAMP(3);

-- AlterTable: explainable match ranking.
-- "rank" is a reserved SQL word in PostgreSQL, so it is quoted throughout.
ALTER TABLE "RequestMatch"
  ADD COLUMN "reasons" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "rank" INTEGER,
  ADD COLUMN "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable: append-only status history.
CREATE TABLE "RequestStatusEvent" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "fromStatus" "RequestStatus",
    "toStatus" "RequestStatus" NOT NULL,
    "actorId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequestStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable: durable domain-event outbox.
CREATE TABLE "DomainEventOutbox" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "actorId" UUID,
    "dedupeKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DomainEventOutbox_pkey" PRIMARY KEY ("id")
);

-- Note: NeedRequest (requesterId,status,createdAt), (categoryId,status) and
-- (status,createdAt) already exist from 0001_init and are not recreated.

-- Public discovery: newest-first and deadline-ordered feeds.
CREATE INDEX "NeedRequest_status_deadline_idx" ON "NeedRequest"("status", "deadline");
CREATE INDEX "NeedRequest_status_budgetCents_idx" ON "NeedRequest"("status", "budgetCents");
CREATE INDEX "NeedRequest_latitude_longitude_idx" ON "NeedRequest"("latitude", "longitude");

-- Keyword search needs trigram support to avoid a sequential scan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "NeedRequest_title_idx" ON "NeedRequest" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "NeedRequest_description_idx" ON "NeedRequest" USING GIN ("description" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "RequestStatusEvent_requestId_createdAt_idx" ON "RequestStatusEvent"("requestId", "createdAt");
CREATE INDEX "DomainEventOutbox_status_availableAt_idx" ON "DomainEventOutbox"("status", "availableAt");
CREATE INDEX "DomainEventOutbox_createdAt_idx" ON "DomainEventOutbox"("createdAt");
CREATE UNIQUE INDEX "DomainEventOutbox_dedupeKey_key" ON "DomainEventOutbox"("dedupeKey");

-- Matching: rank by score within a request.
CREATE INDEX "RequestMatch_requestId_score_idx" ON "RequestMatch"("requestId", "score");
CREATE INDEX "RequestMatch_requestId_rank_idx" ON "RequestMatch"("requestId", "rank");
-- "rank" is a reserved SQL word; Prisma quotes it when generating DDL.

-- AddForeignKey
ALTER TABLE "RequestStatusEvent"
  ADD CONSTRAINT "RequestStatusEvent_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "NeedRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;