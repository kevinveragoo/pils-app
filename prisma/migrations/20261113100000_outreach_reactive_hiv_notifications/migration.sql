-- Rebuild to allow CURRENT_TIMESTAMP defaults on existing SQLite databases.
CREATE TABLE "new_NotificationPreference" (
    "userId" TEXT NOT NULL PRIMARY KEY,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "clinicArrivals" BOOLEAN NOT NULL DEFAULT false,
    "outreachReactiveHiv" BOOLEAN NOT NULL DEFAULT false,
    "outreachReactiveHivEnabledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enabledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_NotificationPreference" ("userId", "enabled", "clinicArrivals", "enabledAt")
SELECT "userId", "enabled", "clinicArrivals", "enabledAt" FROM "NotificationPreference";
DROP TABLE "NotificationPreference";
ALTER TABLE "new_NotificationPreference" RENAME TO "NotificationPreference";
