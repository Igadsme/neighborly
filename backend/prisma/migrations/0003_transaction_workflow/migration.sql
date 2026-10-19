CREATE UNIQUE INDEX "Review_transactionId_authorId_subjectId_key"
ON "Review"("transactionId", "authorId", "subjectId");
