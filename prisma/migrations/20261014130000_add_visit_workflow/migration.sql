ALTER TABLE "ClinicQueueEntry" ADD COLUMN "visitWorkflow" TEXT;
ALTER TABLE "ClinicQueueEntry" ADD COLUMN "clinicPurposes" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ClinicQueueEntry" ADD COLUMN "prepPurposes" TEXT NOT NULL DEFAULT '[]';
