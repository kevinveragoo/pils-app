UPDATE "User"
SET "role" = 'FACILITY_STAFF'
WHERE "role" = 'PROGRAMME_STAFF';

UPDATE "User"
SET "requestedRole" = 'FACILITY_STAFF'
WHERE "requestedRole" = 'PROGRAMME_STAFF';

UPDATE "User"
SET "roles" = replace("roles", '"PROGRAMME_STAFF"', '"FACILITY_STAFF"')
WHERE "roles" LIKE '%"PROGRAMME_STAFF"%';
