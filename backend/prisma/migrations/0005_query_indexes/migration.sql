-- Indexes for the hot reads: published feeds, inbox by user, reviews, and image order.
CREATE INDEX "Listing_status_createdAt_idx" ON "Listing"("status", "createdAt");
CREATE INDEX "ListingImage_listingId_sortOrder_idx" ON "ListingImage"("listingId", "sortOrder");
CREATE INDEX "SavedSearch_userId_updatedAt_idx" ON "SavedSearch"("userId", "updatedAt");
CREATE INDEX "NeedRequest_status_createdAt_idx" ON "NeedRequest"("status", "createdAt");
CREATE INDEX "CounterOffer_offerId_createdAt_idx" ON "CounterOffer"("offerId", "createdAt");
CREATE INDEX "Conversation_updatedAt_idx" ON "Conversation"("updatedAt");
CREATE INDEX "ConversationParticipant_userId_idx" ON "ConversationParticipant"("userId");
CREATE INDEX "Transaction_updatedAt_idx" ON "Transaction"("updatedAt");
CREATE INDEX "TransactionParticipant_userId_idx" ON "TransactionParticipant"("userId");
CREATE INDEX "TransactionMilestone_transactionId_createdAt_idx" ON "TransactionMilestone"("transactionId", "createdAt");
CREATE INDEX "Review_subjectId_createdAt_idx" ON "Review"("subjectId", "createdAt");
CREATE INDEX "Review_transactionId_idx" ON "Review"("transactionId");
CREATE INDEX "Report_reporterId_createdAt_idx" ON "Report"("reporterId", "createdAt");
