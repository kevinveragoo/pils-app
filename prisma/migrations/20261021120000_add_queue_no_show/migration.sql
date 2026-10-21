ALTER TABLE "ClinicQueueEntry" ADD COLUMN "noShow" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ClinicQueueEntry" ADD COLUMN "noShowInstance" INTEGER;
