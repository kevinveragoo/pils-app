# Dashboard reporting rules

The dashboard is PILS-administrator-only. Its API reads REDCap and returns
aggregates; it does not import or change patient records. Calculations are in
`lib/dashboard.ts`, transport/access checks in `app/api/redcap/dashboard/route.ts`,
and charts in `components/Dashboard.tsx`.

## Dates and reporting windows

“Today” is the calendar date in **Indian/Mauritius**, including the four hours
when the UTC date is still yesterday. All periods, including All time, reject
missing/invalid dates and dates after Mauritius today.

Week means seven inclusive calendar dates. Month/quarter/year are rolling
windows ending today; subtract one/three/twelve calendar months and clamp to
the target month's final day where necessary. For example, 31 March 2026 starts
at 28 February 2026 for Rolling month. These are not previous calendar periods.
Both endpoints are inclusive.

Trends include zero-activity days for short windows and zero-activity months
for quarter/year/all-time windows. All time begins at the earliest eligible
test month and runs through the current month; if there are no eligible tests,
it has no trend labels. Other windows show their full range even when all zero.

## Test sources and interpretation

| Method | Instrument | Fields | Reporting date |
| --- | --- | --- | --- |
| Rapid | Outreach Contact | `oc_hiv_rapid_result`, `oc_syp_result`, `oc_hepc_result`, `oc_hepb_result` | `oc_date` |
| Laboratory | Clinic Visit | `cnv_hiv_lab_result`, `cnv_syp_lab_result`, `cnv_hcv_lab_result`, `cnv_hbv_lab_result` | Corresponding `cnv_*_lab_test_date` |
| Laboratory | PrEP Visit | `pv_hiv_result`, `pv_syphilis_result`, `pv_hcv_result`, `pv_hbv_result` | Corresponding `pv_*_lab_test_date`; historical fallback to collection, then visit date |

Use each infection's test date first. For historical PrEP results without one,
use `pv_blood_collected_date`, then `pv_visit_date`. An invalid or out-of-range
preferred date never falls back to a different date. There is no new PrEP
rapid-test source.

All Clinic and PrEP laboratory codes are now **1 = Positive, 2 = Negative,
3 = Indeterminate, 4 = Invalid**. HIV rapid uses the same codes; non-HIV
Outreach results support only 1/2. Unknown codes are excluded.

PrEP HIV/HBV/HCV previously used the opposite positive/negative codes.
The one-time migration preserves their meaning; see [PrEP alignment](PREP_CNV_ALIGNMENT.md).

Before the field change, syphilis was free text. The explicit migration script
`align-prep-syphilis-result.mjs prepare|apply` backs up metadata and records,
converts only exact Positive/Negative/Indeterminate/Invalid labels, and aborts
on ambiguous legacy values (including numeric strings). It verifies the schema,
converted results and preservation of every other existing value. One existing
exact-label result was converted when the change was applied.

Unexpected legacy/imported text is still handled conservatively in reporting:
exact recognised words map to their outcomes; empty/pending/unavailable entries
are excluded; other text such as titres is counted under Recorded / unclassified.
New submissions accept only the four radio codes. Do not rerun the preparation
phase after the field is already converted. Backups are in the ignored private
`.redcap-backups/prep-syphilis-cnv-20261023/` directory; preserve them for recovery.

## Distinct test counting

The counting key is **patient UIC + infection + method + resolved test date**.
The resolved date uses the source/date precedence above. Deduplication happens
after eligibility and demographic/date filters and before totals, outcomes,
first-time counts and trend buckets. Clinic and PrEP share the laboratory method;
rapid tests remain separate from laboratory tests on the same patient/date.
Repeated rows, repeat instances and copies across instruments count once.
Different patients, infections, methods or dates remain separate tests.

Identical outcomes merge. Conflicting outcomes for the same key count once under
**Conflicting results**, never under an arbitrarily chosen positive or negative
result. This includes disagreement with indeterminate/invalid/unclassified data.
The rule is independent of record order. First time tested applies only to rapid
tests and is counted once if a contributing Outreach entry records Never tested.

Rapid/laboratory encounter summaries count distinct **patient + test-date days**
within each method, not REDCap rows. A row with tests on different dates may
represent more than one testing day. Represented clients remain deduplicated
across eligible tests and commodity distributions. Commodity quantities are not
deduplicated by this test policy.

This is a date-based estimate of distinct tests. Two real specimens for the same
patient/infection/method on one day count as one; distinguishing them requires a
specimen identifier. No REDCap records are changed by dashboard deduplication.
Demographic filter groups intersect; selections within one group use OR semantics.

## Stale-value safeguards and legacy records

- Explicit Clinic no-shows do not contribute tests or commodities.
- Clinic or PrEP laboratory results marked “not tested” are excluded.
- If Clinic purposes are selected, laboratory results require laboratory review
  purpose 3; commodity quantities require purpose 16. Recorded PrEP laboratory
  results count regardless of selected visit purpose, because older app versions
  saved results under Doctor/Medication without lab-review purpose 4. Explicit
  not-tested flags still exclude those results.
- Legacy records with no selected purpose (including all-zero exported checkbox
  sets) or no tested flag remain eligible if their result/date are otherwise valid.
  Missing historical flags do not prove the test was not performed. Explicit
  conflicting values still exclude the result. This is a deliberate historical
  compatibility exception; it cannot detect every stale value in old REDCap data.
- HIV Care Support status-only rows do not contribute hidden commodity values.
- Values from a different named repeat instrument are ignored. Flat legacy rows
  without a repeat-instrument identifier are supported.
- Commodity quantities must be positive safe integers with eligible dates.
  Clinic/HIV Care Support combined needles/syringes quantities count once under
  Needles. PrEP Visit has no corresponding quantity fields in the current schema.

There is no universal training-data flag for reporting. A test record with valid
current/past dates and otherwise eligible fields will contribute. A non-today
queue date's notification safeguard does not exclude that patient's REDCap data
from dashboard reporting. Use a separate REDCap test project for exercises.

## Localisation and regression checks

Chart.js draws into canvas, so DOM text translation alone cannot localise its
legends or axis labels. The chart components explicitly use `useLocalization()`
and redraw when translations change. Range/source captions also use the catalogs.
Updated timestamps display in Mauritius time.

```sh
npm run test:dashboard
npm run test:redcap-fields
npm run test:organization-access
npm run test:localization
npx next typegen
npx tsc --noEmit
```

The focused dashboard test runs deterministic synthetic records, not a live
REDCap project. It checks calendar boundaries, invalid/future dates, PrEP code
mapping, free-text classifications, eligibility flags, legacy records, zero
buckets, demographics, API access/export fields, and actual canvas chart
configuration labels in all three locales. Real browser/REDCap verification is
still needed when changing a schema, source classification or date policy.

## Contributor tooltips and access

Approved PILS Healthcare Assistants and Admins can access the dashboard and its
API. Other roles and external organisations cannot receive contributor UICs.
Testing-volume, outcome, first-time and commodity bars show a scrollable list of
contributing UICs on hover. Counts alongside each UIC sum to the hovered bar:
test counts use the same client/infection/day deduplication as the aggregate;
commodity counts represent units. All contributor lists use the active period,
gender and key-population filters. Conflicting results contribute only to their
conflict bar. The trend line remains an aggregate series.

### Card explanations

Every summary, filter and chart card has an information button. It rotates the card around its vertical centre to display its calculation, eligibility and date assumptions, deduplication rules and REDCap field names. The reverse face scrolls within the card; its return button and Escape restore the chart and keyboard focus. Hidden faces are inert, charts stay mounted, and reduced-motion preferences disable the transition. Card-specific explanations are maintained in `lib/dashboard-card-info.ts`.

Cards share a responsive draggable grid. Use the grip beside the info button to drop a card onto another position, or focus the grip and use arrow keys. The browser stores only the ordered card identifiers under `pils.dashboard.grid.v1` in local storage. Reset grid positions clears that preference. Invalid or unavailable storage falls back to the default layout; filters and patient data are not stored.
