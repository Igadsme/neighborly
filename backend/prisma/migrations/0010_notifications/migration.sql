/*
  Milestone 6: notifications, unread tracking, and saved-search alerts.
  Additive only: new tables, new columns with defaults, and new indexes.
  No existing row is read, rewritten, or deleted, and no constraint is
  tightened, so this is safe on a populated database.

  Assumptions and backfill:
  - NotificationPreference gains offer/match/savedSearch booleans, all with
    defaults. Existing rows keep working: messages and newListings stay on,
    and the new categories default to on except community, which already
    defaulted off. No backfill is required because the defaults encode the
    intended starting state.
  - ConversationParticipant.unreadCount starts at 0, so existing
    conversations report no unread messages until a new one arrives.
  - Notification and SavedSearchAlert are new and empty.

  Note: SavedSearch (userId, updatedAt) already exists from 0001_init and
  is what saved-search evaluation walks, so it is not recreated here.

  Rollback: DROP TABLE "SavedSearchAlert", "Notification"; DROP INDEX
  "Notification_userId_readAt_idx"; and
  ALTER TABLE "NotificationPreference" DROP COLUMN "offers", "matches",
  "savedSearches", "requestUpdates"; and
  ALTER TABLE "ConversationParticipant" DROP COLUMN "unreadCount".
*/

-- AlterTable: notification preferences for the new categories.
ALTER TABLE "NotificationPreference"
  ADD COLUMN "offers" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "matches" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "savedSearches" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "requestUpdates" BOOLEAN NOT NULL DEFAULT true;

-- Per-participant unread counter. A counter rather than a scan, so the badge
-- cost stays constant as a conversation grows.
ALTER TABLE "ConversationParticipant"
  ADD COLUMN "unreadCount" INTEGER NOT NULL DEFAULT 0;

-- Persisted notifications. One row per recipient per event, enforced by
-- dedupeKey so a redelivered event cannot create a second notification.
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- Saved-search alert, written when a new listing matches a saved search.
CREATE TABLE "SavedSearchAlert" (
    "id" UUID NOT NULL,
    "savedSearchId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedSearchAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE UNIQUE INDEX "SavedSearchAlert_dedupeKey_key" ON "SavedSearchAlert"("dedupeKey");
CREATE INDEX "SavedSearchAlert_userId_createdAt_idx" ON "SavedSearchAlert"("userId", "createdAt");
CREATE INDEX "SavedSearchAlert_savedSearchId_idx" ON "SavedSearchAlert"("savedSearchId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedSearchAlert" ADD CONSTRAINT "SavedSearchAlert_savedSearchId_fkey"
  FOREIGN KEY ("savedSearchId") REFERENCES "SavedSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedSearchAlert" ADD CONSTRAINT "SavedSearchAlert_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SavedSearchAlert" ADD CONSTRAINT "SavedSearchAlert_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;