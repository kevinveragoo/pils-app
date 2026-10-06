ALTER TABLE "User" ADD COLUMN "roles" TEXT NOT NULL DEFAULT '[]';
UPDATE "User" SET "roles" = '["' || "role" || '"]';
