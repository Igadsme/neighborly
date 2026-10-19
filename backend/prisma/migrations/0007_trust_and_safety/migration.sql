CREATE TYPE "UserRole" AS ENUM ('USER', 'MODERATOR', 'ADMIN');
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

ALTER TABLE "User" ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

CREATE TABLE "BlockedUser" (
    "blockerId" UUID NOT NULL,
    "blockedId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BlockedUser_pkey" PRIMARY KEY ("blockerId", "blockedId")
);
CREATE INDEX "BlockedUser_blockedId_idx" ON "BlockedUser"("blockedId");
ALTER TABLE "BlockedUser" ADD CONSTRAINT "BlockedUser_blockerId_fkey"
FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlockedUser" ADD CONSTRAINT "BlockedUser_blockedId_fkey"
FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "reporterId" UUID NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");
CREATE INDEX "Report_targetType_targetId_idx" ON "Report"("targetType", "targetId");
CREATE INDEX "Report_reporterId_createdAt_idx" ON "Report"("reporterId", "createdAt");
ALTER TABLE "Report" ADD CONSTRAINT "Report_reporterId_fkey"
FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ModerationAction" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModerationAction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ModerationAction_reportId_createdAt_idx" ON "ModerationAction"("reportId", "createdAt");
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModerationAction" ADD CONSTRAINT "ModerationAction_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
