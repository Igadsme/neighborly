CREATE TABLE "DeviceSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeviceSession_tokenHash_key" ON "DeviceSession"("tokenHash");
CREATE INDEX "DeviceSession_userId_revokedAt_expiresAt_idx"
ON "DeviceSession"("userId", "revokedAt", "expiresAt");

ALTER TABLE "DeviceSession"
ADD CONSTRAINT "DeviceSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
