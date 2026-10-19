CREATE TYPE "AuthTokenType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

CREATE TABLE "AuthToken" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "type" "AuthTokenType" NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");
CREATE INDEX "AuthToken_userId_type_usedAt_expiresAt_idx" ON "AuthToken"("userId", "type", "usedAt", "expiresAt");
ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

