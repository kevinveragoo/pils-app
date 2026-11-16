ALTER TABLE "NotificationPreference" ADD COLUMN "outreachHivReactive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "NotificationPreference" ADD COLUMN "outreachHivReactiveEnabledAt" DATETIME;
