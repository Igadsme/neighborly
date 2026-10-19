/*
  Warnings:

  * A unique constraint covering the columns `[offerId]` on the table `Transaction` will be added. If there are existing duplicate values, this will fail.

  Safety: the DO block below detects pre-existing duplicate
  offer-linked transactions and fails loudly without modifying any
  data. If this migration fails with that error, resolve the
  duplicates manually (review which exchange is the winner, then
  archive or delete the redundant rows) and re-run the migration.
  No records are deleted automatically.

*/
DO $$
DECLARE
  duplicate_offers BIGINT;
BEGIN
  SELECT COUNT(*) INTO duplicate_offers
  FROM (
    SELECT "offerId"
    FROM "Transaction"
    WHERE "offerId" IS NOT NULL
    GROUP BY "offerId"
    HAVING COUNT(*) > 1
  ) AS duplicates;

  IF duplicate_offers > 0 THEN
    RAISE EXCEPTION
      'Transaction.offerId unique constraint aborted: % offer(s) already have more than one transaction. Resolve the duplicates manually before migrating. No records were modified.',
      duplicate_offers;
  END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_offerId_key" ON "Transaction"("offerId");
