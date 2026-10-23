BEGIN IMMEDIATE;

-- Preserve original duplicate rows for review, including the retained row.
-- Prefer the most advanced visit; break ties by arrival/creation time and ID.
CREATE TEMP TABLE "QueueDuplicateMap" AS
SELECT id,
       FIRST_VALUE(id) OVER (
         PARTITION BY upper(trim(recordId)), queueDate
         ORDER BY CASE status WHEN 'DONE' THEN 0 WHEN 'READY' THEN 1 WHEN 'WAITING' THEN 2 WHEN 'EXPECTED' THEN 3 ELSE 4 END,
                  COALESCE(checkedInAt, createdAt), createdAt, id
       ) AS retainedId,
       COUNT(*) OVER (PARTITION BY upper(trim(recordId)), queueDate) AS entryCount
FROM "ClinicQueueEntry"
WHERE recordId IS NOT NULL AND trim(recordId) <> '';

CREATE TABLE "ClinicQueueDuplicateArchive" AS
SELECT entry.*, mapping.retainedId AS retainedQueueEntryId
FROM "ClinicQueueEntry" entry
JOIN "QueueDuplicateMap" mapping ON mapping.id = entry.id
WHERE mapping.entryCount > 1;

-- Move audit events before deleting redundant rows to preserve their history.
UPDATE "ClinicQueueEvent"
SET queueEntryId = (SELECT retainedId FROM "QueueDuplicateMap" WHERE id = queueEntryId)
WHERE queueEntryId IN (SELECT id FROM "QueueDuplicateMap" WHERE id <> retainedId);

DELETE FROM "ClinicQueueEntry"
WHERE id IN (SELECT id FROM "QueueDuplicateMap" WHERE id <> retainedId);

UPDATE "ClinicQueueEntry" SET recordId = NULL WHERE trim(recordId) = '';
UPDATE "ClinicQueueEntry" SET recordId = upper(trim(recordId)) WHERE recordId IS NOT NULL;
DROP TABLE "QueueDuplicateMap";
DROP INDEX "ClinicQueueEntry_recordId_queueDate_idx";
CREATE UNIQUE INDEX "ClinicQueueEntry_recordId_queueDate_key" ON "ClinicQueueEntry"("recordId", "queueDate");

COMMIT;
