CREATE TYPE "ReactionType" AS ENUM ('LIKE', 'HELPFUL', 'CELEBRATE');
CREATE TYPE "EventStatus" AS ENUM ('PUBLISHED', 'CANCELLED', 'COMPLETED');
CREATE TYPE "RsvpStatus" AS ENUM ('GOING', 'INTERESTED', 'NOT_GOING');

CREATE TABLE "CommunityPost" (
    "id" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "neighborhood" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CommunityPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommunityPost_neighborhood_createdAt_idx" ON "CommunityPost"("neighborhood", "createdAt");
CREATE INDEX "CommunityPost_authorId_createdAt_idx" ON "CommunityPost"("authorId", "createdAt");
ALTER TABLE "CommunityPost" ADD CONSTRAINT "CommunityPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "CommunityComment" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CommunityComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommunityComment_postId_createdAt_idx" ON "CommunityComment"("postId", "createdAt");
CREATE INDEX "CommunityComment_authorId_createdAt_idx" ON "CommunityComment"("authorId", "createdAt");
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityComment" ADD CONSTRAINT "CommunityComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PostReaction" (
    "postId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "ReactionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PostReaction_pkey" PRIMARY KEY ("postId", "userId", "type")
);
CREATE INDEX "PostReaction_userId_createdAt_idx" ON "PostReaction"("userId", "createdAt");
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "CommunityPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostReaction" ADD CONSTRAINT "PostReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CommunityEvent" (
    "id" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "neighborhood" TEXT,
    "location" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "capacity" INTEGER,
    "status" "EventStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommunityEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CommunityEvent_status_startsAt_idx" ON "CommunityEvent"("status", "startsAt");
CREATE INDEX "CommunityEvent_neighborhood_startsAt_idx" ON "CommunityEvent"("neighborhood", "startsAt");
CREATE INDEX "CommunityEvent_organizerId_startsAt_idx" ON "CommunityEvent"("organizerId", "startsAt");
ALTER TABLE "CommunityEvent" ADD CONSTRAINT "CommunityEvent_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "EventRsvp" (
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "RsvpStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventRsvp_pkey" PRIMARY KEY ("eventId", "userId")
);
CREATE INDEX "EventRsvp_userId_status_idx" ON "EventRsvp"("userId", "status");
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "CommunityEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventRsvp" ADD CONSTRAINT "EventRsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
