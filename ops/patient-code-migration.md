# Patient code migration

The active patient code is `cne_patient_code` on the nonrepeating
`clinic_enrollment` instrument. `ce_patient_code` is retained in REDCap as a
hidden historical backup; the app must not write new codes to it.

The migration script creates a private, git-ignored backup of metadata and all
exported records before changing anything. It adds the destination, copies
nonempty codes without trimming or changing case, verifies the old exported
values and copied codes, then hides the old field after the app is updated.
It never deletes the source field or its data.

The phases used for this migration are:

```sh
node --env-file=.env.local scripts/migrate-patient-code.mjs prepare .redcap-backups/patient-code-20261021
node --env-file=.env.local scripts/migrate-patient-code.mjs copy .redcap-backups/patient-code-20261021
# Switch app forms, API requests, queue handling, exports, and schema definitions.
node --env-file=.env.local scripts/migrate-patient-code.mjs retire .redcap-backups/patient-code-20261021
```

These commands are a one-time migration, not startup commands. Each phase
checks its expected schema and data and stops on a mismatch. Do not blindly
retry a failed phase: inspect live state and the backup first. Backups contain
patient data and must remain private. Never commit them.

Restoring app code alone does not roll back subsequent data entry. After the
switch, new codes exist only in `cne_patient_code`. A rollback must reconcile
those newer values first, without restoring an old full-project snapshot over
current records.
