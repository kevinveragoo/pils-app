CREATE TABLE "RedcapActivity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "actorUsername" TEXT NOT NULL,
    "workflow" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "staffName" TEXT,
    "serviceDate" TEXT,
    "instrumentInstances" TEXT NOT NULL,
    "submittedData" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RedcapActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "RedcapActivity_createdAt_idx" ON "RedcapActivity"("createdAt");
CREATE INDEX "RedcapActivity_recordId_idx" ON "RedcapActivity"("recordId");
CREATE INDEX "RedcapActivity_workflow_idx" ON "RedcapActivity"("workflow");
CREATE INDEX "RedcapActivity_userId_idx" ON "RedcapActivity"("userId");
