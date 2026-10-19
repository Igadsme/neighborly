-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SOLD', 'ARCHIVED', 'DELETED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'COUNTERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'OFFER_RECEIVED', 'NEGOTIATING', 'ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'DISPUTED', 'REFUNDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ExchangeMode" AS ENUM ('BUY', 'BORROW', 'RENT', 'HIRE', 'TRADE', 'SKILL_SWAP', 'FREE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "displayName" TEXT,
    "bio" TEXT,
    "neighborhood" TEXT,
    "city" TEXT,
    "state" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceCents" INTEGER,
    "condition" TEXT,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "neighborhood" TEXT,
    "city" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "radiusMiles" INTEGER,
    "pickupAvailable" BOOLEAN NOT NULL DEFAULT true,
    "deliveryAvailable" BOOLEAN NOT NULL DEFAULT false,
    "shippingAvailable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingImage" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "objectKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListingImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "userId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId","listingId")
);

-- CreateTable
CREATE TABLE "SavedSearch" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "query" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NeedRequest" (
    "id" UUID NOT NULL,
    "requesterId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "budgetCents" INTEGER,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "radiusMiles" INTEGER NOT NULL DEFAULT 10,
    "deadline" TIMESTAMP(3),
    "urgency" TEXT,
    "mode" "ExchangeMode" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "NeedRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestOffer" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "offererId" UUID NOT NULL,
    "amountCents" INTEGER,
    "message" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferItem" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "listingId" UUID NOT NULL,

    CONSTRAINT "OfferItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounterOffer" (
    "id" UUID NOT NULL,
    "offerId" UUID NOT NULL,
    "fromUserId" UUID NOT NULL,
    "amountCents" INTEGER,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounterOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestMatch" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationParticipant" (
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "conversationId" UUID,
    "offerId" UUID,
    "status" "TransactionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionParticipant" (
    "transactionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "TransactionParticipant_pkey" PRIMARY KEY ("transactionId","userId")
);

-- CreateTable
CREATE TABLE "TransactionMilestone" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "fromStatus" "TransactionStatus",
    "toStatus" "TransactionStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "locationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "priceCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "Listing_status_categoryId_createdAt_idx" ON "Listing"("status", "categoryId", "createdAt");

-- CreateIndex
CREATE INDEX "Listing_sellerId_status_idx" ON "Listing"("sellerId", "status");

-- CreateIndex
CREATE INDEX "Listing_city_neighborhood_idx" ON "Listing"("city", "neighborhood");

-- CreateIndex
CREATE INDEX "Favorite_listingId_idx" ON "Favorite"("listingId");

-- CreateIndex
CREATE INDEX "NeedRequest_requesterId_status_createdAt_idx" ON "NeedRequest"("requesterId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "NeedRequest_categoryId_status_idx" ON "NeedRequest"("categoryId", "status");

-- CreateIndex
CREATE INDEX "RequestOffer_requestId_status_createdAt_idx" ON "RequestOffer"("requestId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "RequestOffer_offererId_status_idx" ON "RequestOffer"("offererId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OfferItem_offerId_listingId_key" ON "OfferItem"("offerId", "listingId");

-- CreateIndex
CREATE UNIQUE INDEX "RequestMatch_requestId_listingId_key" ON "RequestMatch"("requestId", "listingId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingImage" ADD CONSTRAINT "ListingImage_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeedRequest" ADD CONSTRAINT "NeedRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NeedRequest" ADD CONSTRAINT "NeedRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestOffer" ADD CONSTRAINT "RequestOffer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "NeedRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestOffer" ADD CONSTRAINT "RequestOffer_offererId_fkey" FOREIGN KEY ("offererId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferItem" ADD CONSTRAINT "OfferItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "RequestOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferItem" ADD CONSTRAINT "OfferItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterOffer" ADD CONSTRAINT "CounterOffer_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "RequestOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestMatch" ADD CONSTRAINT "RequestMatch_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "NeedRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestMatch" ADD CONSTRAINT "RequestMatch_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionParticipant" ADD CONSTRAINT "TransactionParticipant_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionParticipant" ADD CONSTRAINT "TransactionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionMilestone" ADD CONSTRAINT "TransactionMilestone_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

