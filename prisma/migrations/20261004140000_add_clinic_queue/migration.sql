CREATE TABLE "ClinicQueueEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "queueDate" TEXT NOT NULL,
    "recordId" TEXT,
    "displayName" TEXT NOT NULL,
    "alias" TEXT,
    "patientCode" TEXT,
    "phone" TEXT,
    "source" TEXT NOT NULL DEFAULT 'WALK_IN',
    "isNewClient" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'EXPECTED',
    "currentStation" TEXT NOT NULL DEFAULT 'RECEPTION',
    "tasks" TEXT NOT NULL DEFAULT '[]',
    "appointmentSources" TEXT NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "checkedInAt" DATETIME,
    "readyAt" DATETIME,
    "completedAt" DATETIME,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedByName" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "ClinicQueueEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "queueEntryId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicQueueEvent_queueEntryId_fkey" FOREIGN KEY ("queueEntryId") REFERENCES "ClinicQueueEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ClinicQueueEntry_queueDate_status_idx" ON "ClinicQueueEntry"("queueDate", "status");
CREATE INDEX "ClinicQueueEntry_recordId_queueDate_idx" ON "ClinicQueueEntry"("recordId", "queueDate");
CREATE INDEX "ClinicQueueEvent_queueEntryId_createdAt_idx" ON "ClinicQueueEvent"("queueEntryId", "createdAt");
