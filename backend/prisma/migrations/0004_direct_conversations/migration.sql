ALTER TABLE "Conversation" ADD COLUMN "directKey" TEXT;
CREATE UNIQUE INDEX "Conversation_directKey_key" ON "Conversation"("directKey");
