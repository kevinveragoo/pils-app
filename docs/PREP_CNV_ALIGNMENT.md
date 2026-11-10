# PrEP Visit alignment with Clinic Visit

Applied on 23 October 2026. CNV is the reference for shared result choices and
vaccination labels. This is a data migration as well as an app change.

## Results and historical data

`pv_hiv_result`, `pv_hbv_result`, `pv_hcv_result` and `pv_syphilis_result` now
use 1 Positive, 2 Negative, 3 Indeterminate, 4 Invalid. The first three previously
used 1 Negative / normal and 2 Positive / abnormal. Do not interpret an unmigrated
REDCap project with the new app. Never replay the code inversion.

The migration swapped 1/2 for existing HIV/HBV/HCV results (18 results across
six rows), left indeterminate meanings intact, and marked populated results as
tested. Historical per-infection dates were deliberately left blank.

HBV vaccination choices now match CNV: doses 1–3 and 4 Completed. The two existing
5 Completed values were converted to 4 Completed. HCV choices match CNV's boxes
1–4 and 5 Completed. No intermediate vaccine values existed; the migration
refuses to guess how an intermediate dose corresponds to a box. These labels
mirror CNV's configured instrument; they do not establish clinical equivalence.

## Purpose, visibility and dates

Existing purpose codes remain 1 Blood collection, 2 Doctor and 3 Medication.
**4 Laboratory results review** was added rather than reusing medication code 3.
The migration adds purpose 4 to historical rows containing review data while
preserving every existing purpose selection.

Laboratory review shows each infection's tested flag; its result and test date
appear only when tested is Yes. Performed HIV tests require their own date,
matching the CNV app safeguard. Other entered dates must be valid. Empty results
can remain pending. Untested, hidden or unrelated fields are omitted server-side,
even if an old value remains in browser state. Both standalone PrEP and embedded
Clinic → PrEP submissions use the same visibility and validation rules.

All four future appointment dates can be planned independently of today's
purpose: medication, blood collection, doctor and laboratory review. The earliest
valid date becomes the derived next appointment, with no date invented from
today's visit. `pv_next_lab_review_date` feeds appointment counts and expected
clinic queue entries; its queue source selects PrEP purpose 4 and the doctor task.
The REDCap calculated annotation also includes this new date.

## Deployment and recovery safeguards

Both PrEP submission APIs require `prepSchemaVersion: "cnv-2026-10-23"` from the
current form. A pre-migration browser receives HTTP 409 before REDCap access,
so an old negative code cannot silently become a new positive result. Keep unsaved
answers before reloading. Clinic-only and no-show submissions are unaffected.

`node --env-file=.env.local scripts/align-prep-with-cnv.mjs prepare|apply` is the
one-time migration, with the pure plan in `lib/prep-cnv-alignment.mjs`.
Preparation backs up the full metadata and all records privately. Apply refuses
if either snapshot changed, then verifies every original value against its
explicit plan. It aborts on unavailable/not-requested legacy results or ambiguous
vaccination stages. Partial application requires manual recovery from backups;
never rerun the inversion blindly. Preserve ignored, private backups in
`.redcap-backups/prep-cnv-alignment-20261023-v2/`. Earlier preparation directories
are unused snapshots, not additional applied migrations. Do not commit backups.

The app was paused while metadata and records were migrated to avoid mixed
interpretations. A fresh installation must use the aligned REDCap schema. A
rollback must restore schema and result codes together, with the app paused.

## Checks

- `npm run test:prep-cnv-alignment`: exact clinical meanings and ambiguity refusal.
- `npm run test:redcap-fields`: both APIs, stale forms, visibility and date rules.
- `npm run test:clinic-appointments`: rendered PrEP controls and calculation parity.
- `npm run test:new-appointment`: counts including PrEP laboratory review.
- `npm run test:dashboard`: canonical codes, date priority and eligibility.
- `npm run check:redcap-schema`: read-only check of live metadata versus snapshots.

See [dashboard rules](DASHBOARD.md) for historical date/purpose exceptions.
