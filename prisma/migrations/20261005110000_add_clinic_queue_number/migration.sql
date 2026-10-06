ALTER TABLE "ClinicQueueEntry" ADD COLUMN "queueNumber" INTEGER;
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "queueDate" ORDER BY "checkedInAt", "createdAt", "id") AS number
  FROM "ClinicQueueEntry"
  WHERE "status" = 'WAITING'
)
UPDATE "ClinicQueueEntry"
SET "queueNumber" = (SELECT number FROM numbered WHERE numbered."id" = "ClinicQueueEntry"."id")
WHERE "id" IN (SELECT "id" FROM numbered);
CREATE INDEX "ClinicQueueEntry_queueDate_queueNumber_idx" ON "ClinicQueueEntry"("queueDate", "queueNumber");
