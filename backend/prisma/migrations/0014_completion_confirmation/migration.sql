-- BL-003: two-sided marketplace completion.
-- Additive and nullable. Existing participant rows stay null, so a
-- transaction does not become COMPLETED until each participant confirms
-- after this migration. No backfill.

ALTER TABLE "TransactionParticipant" ADD COLUMN "completionConfirmedAt" TIMESTAMP(3);
