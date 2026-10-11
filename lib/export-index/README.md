The Export Index endpoint reads REDCap and builds an Excel snapshot with the two reference sheets, matching column order, headings, widths, styles and summary panels. The layout JSON contains only formatting, headers and summary definitions; no reference patient values are included. The original workbook is not needed at runtime.

Each sheet includes one row per UIC with recorded data in its treatment profile, including incomplete and inactive profiles. Latest profiles and visits are ordered by their effective/visit date, then repeat instance. Visit-specific details use the latest recorded nonempty value. CD4 and viral load results use their laboratory dates and retain zero results. Arrival results come only from monitoring entries marked baseline. Summary panels describe the downloaded snapshot, with blank numeric results excluded from thresholds.

Legacy ARV columns `f`, Back on treatment, New case, Psychiatry Referral and Psychology Referral have no equivalent structured REDCap fields and remain blank. Returned to PILS does not establish that ART restarted, and a new clinic client does not establish a new HIV diagnosis. Free-text nationality is preserved; nationality summaries count exact Mauritian and Foreigner labels, with other values in the reference's Not Specified total. Population categories retain REDCap meanings and count exact categories, avoiding counting Former PWID or PPWID as PWID. Reference categories without equivalents remain zero.

Regenerate the nonpatient layout after an intentional reference change with:

    python3 scripts/extract-index-layout.py /path/to/reference.xlsx lib/export-index/layout.json

`fields.json` records field types and choices from REDCap metadata. Update those definitions if source choices change. Run `npm run test:export-index` for synthetic mapping, workbook and read-only API checks. `INDEX_LIVE_CHECK=1 node --env-file=.env.local scripts/test-export-index.mjs` additionally verifies the configured REDCap export without saving patient data.
