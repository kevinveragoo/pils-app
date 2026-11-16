# Requested dashboard cards: definitions and field mapping

Reviewed 16 November 2026 on `dashboard`. The initial review was metadata-only; the implementation below changes the application, without changing REDCap.
Live REDCap metadata was read without patient records: 652 fields, no fields absent from the local schema fixture. Field existence does not establish completeness of historical records.

## Shared rules

- Calendar dates use Indian/Mauritius. Events count within the selected period; status cards use the period-end cutoff. Do not use later observations to alter earlier reports.
- Attendance and service cards count repeat encounters. Person cards deduplicate by `uic_ori`. Preserve repeat identity (`redcap_repeat_instrument`, `redcap_repeat_instance`) so separate encounters on the same day remain countable.
- Screening counts/rates use each person's latest screening result per infection within the period. First-time counts use the earliest qualifying test with previous status = Never tested (code 3), once per person/infection across history.
- Screening rates exclude missing/indeterminate/invalid outcomes. Use reactive-screening labels rather than confirmed-diagnosis labels. HIV following PrEP specifically requires confirmed diagnosis.
- Undetectable means explicitly undetectable or numeric viral load strictly below 40 copies/mL. Latest-result status cards differ from achievement cards, which consider all qualifying tests in the period and count each person once.
- Any dated recorded interaction can establish continued care or a return after LTFU. A status-only administrative edit should not silently become a clinical encounter; its treatment needs an explicit implementation policy.
- Zero denominators display N/A. Missing dates/outcomes are excluded, never assumed negative or completed.
- Overlapping cards may share encounters. Within a single card, do not double-count copies of the same encounter across sources.
- Retention and cumulative measures require history before the period start. Period-end status requires dated historical changes; current profile values cannot reliably reconstruct every past state.

## Mapping

Ready = structured candidate fields exist, with calculation work still required. Partial = a proxy, incomplete history, or source classification limits fidelity. Gap = requested fact is not explicitly structured.

| # | Requested card | Agreed rule and candidate source | Assessment |
|---|---|---|---|
| 1 | HIV-related communication reach | All prevention attendances, including 4BAZ and site outreach. `outreach_contact`: `oc_date`, `oc_type`, IEC flags `oc_hiv_comms`, `oc_hepc_comms`, `oc_syp_comms`, `oc_hepb_comms`, `oc_prep_com`; 4BAZ also appears in `hcs_care_type`. | Partial: no universal prevention-attendance flag; cross-source attendance copies cannot automatically be matched. Do not count every outreach row as prevention without a source rule. |
| 2 | First-time HIV/HCV/SYP tests | `oc_*_status_prev = 3` and corresponding `oc_hiv_rapid_result`, `oc_hepc_result`, `oc_syp_result`, dated `oc_date`; earliest qualifying test per person/infection. | Ready for recorded history; lifetime completeness cannot be proved. |
| 3 | First-time screening reactivity rates | Reactive result of earliest qualifying first-time test / unique qualifying first-time testers, by infection. | Ready; distinct from latest-result general screening rates. |
| 4 | 4BAZ reach | Total attendances: `oc_type = 12` at `oc_date`; also `hcs_care_type___9` at `hcs_date`. | Partial: choose canonical source or reconcile duplicate recording. |
| 5 | Linked and active at least six months, by infection | Distinct people with an interaction in period at least six calendar months after infection-specific linkage. | Partial HIV; gap for explicit HCV/SYP first-care/treatment dates. HIV candidates `htp_art_reg_date`, `htp_art_start_date`, dated ART care rows; registration is only a proxy for first consultation. |
| 6 | HIV+ people with undetectable VL | Latest `htm_vl_date` by cutoff, `htm_viral_load_detectable = 2` or valid `htm_vl_level < 40`; establish HIV cohort separately. | Ready; contradictory categorical/numeric values need a visible quality flag. |
| 7 | Outreach activities | Distinct normalized site + `oc_date`, scoped to outreach activity types; site `oc_hotspot`, type `oc_type`, district `oc_district`. | Partial: free-text site can split one location; missing sites cannot establish distinct activities. No separate event register captures sessions with no participant rows. |
| 8 | Average reach per outreach activity | Outreach attendances / distinct site-and-day activities, same scope as #7. | Partial: inherits attendance/site completeness. |
| 9 | Previous LTFU returning | Six-month gap without an ARV-treatment interaction, followed by any interaction; first return in period. ARV candidates `cnv_date` with ART review/medication evidence, `hcs_date` with ART evidence; dates across other repeats establish return. | Partial: no universal ARV-contact marker and external care may be unrecorded. Retain the agreed distinction between ARV gap and any-interaction return. |
| 10 | Returned LTFU with undetectable VL | At least one qualifying `htm_vl_date` in period strictly after return; unique person per period. | Partial: depends on reliable #9 timeline. |
| 11 | % confirmed HIV+ after starting PrEP | Confirmed `htp_diagnosis_date` after first positive `pv_medication_dispensed` on `pv_visit_date`; numerator/denominator cumulative through cutoff. Denominator all PrEP starters. | Partial: diagnosis-date field exists, but diagnosis confirmation is not separately typed; must verify clinical use. Missing dispensing history can misdate start. |
| 12 | PrEP retention M3/M6/M9/M12 | First dispensing date + milestone calendar months; PrEP interaction from milestone through +90 days inclusive. Only fully elapsed windows by cutoff. Exclude planned stops/transfers dated by window end. | Partial: `prep_visit`, `ptp_status`, `pv_visit_date` support history; No longer active does not distinguish a planned stop from loss to follow-up. Profile `ptp_previous_use` identifies prior users but cannot reconstruct absent dispensing records. |
| 13 | Testing encounters / reach | One testing encounter even if several infections tested / total prevention attendances in period. | Partial: use common attendance scope from #1; unrelated clinical tests should not silently inflate activity coverage. Multiple source copies lack a shared encounter ID. |
| 14 | Breakfast at NVI | Attendance repeat at `breakfast_date` with `breakfast_present_8edd8b = 1`. Repeat visits count; `extra_servings` do not create additional people/encounters. | Ready assuming this instrument is NVI-only. |
| 15 | Testing at NVI | One testing encounter regardless of infections tested; `oc_type = 4` identifies Nou Vi La outreach contacts. | Partial: clinic/PrEP tests have no per-visit NVI site field. Do not infer NVI from all clinic records. |
| 16 | Psychologist consultations at NVI | Total completed consultations. | Gap: no dedicated psychologist consultation/date/location fields. Psychosocial support or referrals do not prove a psychologist consultation. |
| 17 | Psychiatrist consultations at NVI | Total completed consultations. | Gap: no dedicated psychiatrist consultation/date/location fields. |
| 18 | First-ever PrEP initiations | Earliest recorded dispensing (`pv_medication_dispensed > 0`, `pv_visit_date`) in period; use `ptp_previous_use` to exclude known previous users. | Partial: first recorded dispensing does not prove first-ever use; unknown prior history must remain unknown. |
| 19 | First-ever ARV initiations | `htp_art_start_date` in period, unique person; do not count transfer/profile updates as new starts. | Ready if this field preserves original first-ever start rather than latest restart. |
| 20 | NVI accompaniments | All relevant accompaniment encounters, including hospital and eye-hospital subsets. `hcs_care_type`, `hcs_date`; `cr_accompanied`, referral source/completion fields are secondary evidence. | Partial: no dedicated NVI origin/service-location marker or shared accompaniment ID. |
| 21 | NVI blood draws | One collection encounter even if multiple tests; `cnv_blood_collected`, `cnv_date`; `pv_blood_collected`, `pv_blood_collected_date`. | Partial: NVI location and cross-instrument duplicate reconciliation missing. `hcs_care_type = 13` denotes home blood test, not NVI. |
| 22 | NVI wound dressing | Total completed service encounters. | Gap: no structured wound-dressing event. Other-services notes cannot be counted reliably. |
| 23 | NVI nutrition support | Separately recorded nutrition-support encounters, excluding breakfast. | Gap: no dedicated completed nutrition-support event/date/location. |
| 24 | Hospital accompaniments | `hcs_care_type___3 = 1`, `hcs_date`; count encounters. | Ready as structured HCS events. Do not equate Visit Hospital (7) with Accompaniment Hospital (3). |
| 25 | Eye-hospital accompaniments | `hcs_care_type___2 = 1`, `hcs_date`; count encounters. | Ready as structured HCS events. |
| 26 | Prevention reach on sites | Total prevention attendances at valid sites, not unique people. `oc_hotspot`, `oc_type`, `oc_date`, communication flags. | Partial: site-based scope and prevention evidence require explicit mapping; free-text/missing site limits completeness. |
| 27 | HIV rapid tests | Every performed test, including repeats: `oc_hiv_rapid_result`, `oc_date`, repeat identity. | Ready for recorded test encounters; no specimen/test ID to distinguish several tests inside one repeat entry. |
| 28 | Reactive HIV screening | Unique people, latest rapid screening result in period = reactive. `oc_hiv_rapid_result`, `oc_date`. | Ready; laboratory confirmation should not be silently mixed into screening. |
| 29 | Reactive HCV screening | As #28, `oc_hepc_result`. | Ready. |
| 30 | Reactive SYP screening | As #28, `oc_syp_result`. | Ready; does not imply confirmed active syphilis. |
| 31 | Referrals issued | Clinical `cr_date` and social `sr_date` repeat records, whether completed or not. Other flags: `oc_referrals`, clinic/PrEP referral fields, `hcs_comprehensive_ref`. | Partial: one encounter may issue several referrals; referral flags and slips may represent the same issue. Canonical source/shared identifier needed to avoid double count. |
| 32 | Linked after reactive test, by infection | First care consultation or treatment initiation, whichever first, after reactive test. Linkage date must be in period; test may be earlier. | Partial HIV; gap for precise HCV/SYP linkage dates. `cnv_hcv_treat`, `cnv_syp_treat` are treatment information but not dedicated first-start dates. Referral completion is not proof of the required clinical event. |
| 33 | People with missed PrEP appointments | Unique people with an outstanding appointment by cutoff, missed from next day; later attendance clears from attendance date. Include overdue appointments from before period. `pv_next_*`, `pv_visit_date`, queue history where available. | Partial: service-specific due dates exist, but exact reschedule/cancellation/attendance matching and historical queue retention need verification. |
| 34 | Linked people achieving undetectable VL | At least one qualifying VL test in period after linkage, once per person per period. | Partial: HIV linkage date fidelity limits this card; all qualifying results considered, not only latest. |
| 35 | LTFU at period end | Everyone with six-month ARV-interaction gap by cutoff. Exclude documented death, transfer, intentional stops by cutoff. `hcs_*` status history, `htm_art_status`, `ce_vital_status`, `ce_exit_date`. | Partial: contact classification and dated exclusions incomplete. Current vital status alone cannot establish historical death date. Intentional versus unplanned stop is not always coded. |
| 36 | Screening reactivity rates HIV/HCV/SYP | Unique people classified by latest valid screening result per infection in period; reactive / valid classified testers. | Ready with explicit handling of conflicting same-date results (flag unknown rather than choose arbitrarily). |
| 37 | More than one active comorbidity | At least two active conditions besides HIV at cutoff, from all medical history. | Gap: `cne_comorbidities` records known conditions, without condition onset/resolution/status history. Free-text Other cannot reliably enumerate active conditions. |
| 38 | Linked within 30 days, by infection | Reactive tests in period, already-in-care excluded, full 30-day window elapsed by cutoff. Linkage within 30 days from reactive test. | Partial/gap: inherits infection-specific linkage and pre-existing-care gaps from #32. |
| 39 | Viral suppression rate | HIV+ with latest valid VL undetectable / HIV+ with a valid VL result by cutoff, including tests before period. | Ready with HIV-cohort definition and explicit contradictory/invalid-result policy. |
| 40 | % sensitised to PrEP | Attendances with `oc_prep_com = 1` / all prevention attendances. Repeat participation counts in both. | Partial: numerator structured for Outreach; broader reach sources may lack equivalent flags. |
| 41 | % interested in PrEP | Attendances with `oc_prep_interested = 1` / all prevention attendances. Repeat participation counts in both. | Partial: same cross-source denominator issue as #40. |

## Existing dashboard differences

`lib/dashboard.ts` currently deduplicates tests by patient + infection + method + date, combines rapid and laboratory summaries separately, and uses conflict categories. This differs from both the requested latest-result person counts and the every-rapid-test count. New indicators need their own explicit aggregation units rather than reusing existing totals unchanged.

The current dashboard API exports an allowlist (`dashboardFields`) focused on tests, demographics and commodities. Most new cards require extending it to include the mapped instruments and historical fields. Existing data fetching cannot calculate the entire requested set as-is.

## Before implementation

1. Use structured sources for supported cards; display unavailable indicators as unavailable rather than zero.
2. Add structured completed-service/date/location capture for the missing NVI services if those cards must be accurate.
3. Capture infection-specific first care/treatment dates and previous-care status for linkage metrics.
4. Add condition-level active/resolved history for the active-comorbidity card.
5. Establish canonical attendance/referral/accompaniment sources and site identifiers; preserve separate real encounters without double-counting copied entries.
6. Distinguish planned PrEP/ARV stops from loss to follow-up and preserve effective dates for exclusions.
7. Verify historical record completeness separately. This review intentionally accessed metadata only.

## Implemented indicator view

The requested 41 cards now appear above the existing testing/commodity charts. There are 25 calculated cards and 16 unimplemented cards with a red Not Implemented label. Definitions/order and card explanations live in `lib/dashboard-cards.ts`; calculations and the export allowlist live in `lib/dashboard.ts`. Existing chart counting remains distinct from these new indicator rules.

These 41 cards belong to the Executive group and are visible only to PILS administrators. The original summaries/charts belong to the Default group, available to all PILS staff. Administrators see both. Server-side page and API checks enforce this separation: non-admins neither receive executive aggregates nor trigger executive-only field exports or calculations. External organisations cannot access either dashboard group.

Every indicator has a top-right info button. It flips the card 180 degrees around its central vertical axis to show assumptions, calculation and exact REDCap field names. Unsupported cards show a planned calculation and missing data, with no fields claimed as used. The back scrolls independently for longer field lists. The same button returns to the front; Escape returns to the front and restores button focus. Hidden faces are inert and aria-hidden; reduced-motion preferences disable the transition. Detailed explanatory prose is currently English (marked `lang="en"`); titles and interface labels use the existing three-language catalogs. Raw REDCap field names are never translated.

Cards can be rearranged within the responsive grid using the top-left grip, with mouse, pen or touch. Dragging near a viewport edge scrolls the page. Focused grips also support arrow keys (up/down by a grid row) and Home/End. Drops and keyboard moves save only the ordered card IDs to browser local storage under `pils:dashboard-card-order:v1`; patient values and filters are not stored. The layout survives reloads and synchronizes between tabs. The default order puts all 25 implemented cards before the 16 unimplemented cards, while a saved custom order takes precedence. Reset card layout restores that default. Corrupt/obsolete IDs are ignored and missing cards are appended. Storage failures preserve rearrangement in memory for the current session. Browser layout restoration happens after hydration using a stable server snapshot.

Implemented cards with unavailable/null values show No data; a valid zero remains 0. Missing-field templates retain their red Not Implemented label. While a request is loading, no missing-data state is inferred.

The blank cards are #5, #9, #10, #12, #15–17, #20–23, #32, #34, #35, #37 and #38. They include retention and LTFU outcomes: the available dates/statuses do not fully distinguish intentional stops, transfers, disease-specific linkage, or historical exclusions. They receive no numeric value, not zero or N/A.

Implemented source and missing-data policies:

- General prevention attendance uses Outreach Contact as its canonical source. SID (1), Outreach (3), SDM/NADC (5), Rainbow (6), Hotspot/NADC (9), and 4BAZ (12) qualify; other activity types qualify with an explicit IEC/PrEP communication flag. Communication and interest percentages use that same attendance denominator. Each encounter counts once even if several communication topics are selected.
- 4BAZ additionally uses HIV Care Support code 9. Same-person, same-day HCS entries are excluded when Outreach already records that 4BAZ attendance. Separate Outreach repeat instances still count separately.
- Outreach activity count, average attendance, and site reach use the above prevention activity types with a nonempty site. Sites normalize Unicode, case and whitespace. The activity key is site + date. Average attendance excludes missing-site encounters from both numerator and denominator.
- The tested/reached ratio uses total HIV/HCV/SYP testing encounters across Outreach, Clinic, and PrEP divided by prevention attendances, as agreed; it need not be below 100%. Within a source encounter, multiple infections with the same test date count once; different test dates count separately. Clinic and PrEP are separate encounter sources because no shared visit ID exists. Copies across those two sources cannot be reconciled reliably. Existing charts retain their separate patient-day deduplication.
- General screening cards use Outreach rapid results only. Latest-date conflicts or a latest indeterminate/invalid result are excluded from classification; no fallback to an older positive/negative result. An earliest first-time date with contradictory results still counts as one first test, but is excluded from the first-time reactivity rate.
- PrEP starts use the earliest recorded positive dispensing amount on a valid visit date by cutoff. First-ever initiation additionally requires explicit no-prior-use profile evidence dated by cutoff and excludes known prior users. Incident confirmed HIV uses the clinical diagnosis date after recorded first dispensing; denominator is all recorded PrEP starters by cutoff. Missing dispensing history remains a historical-completeness limitation.
- ARV initiation uses the earliest recorded original ART start date per person. The HIV viral-load cohort requires a dated clinical HIV diagnosis or ART start by cutoff; reactive screening alone does not establish confirmed infection.
- Viral suppression uses the latest recorded test date by cutoff, including pre-period tests. A categorical undetectable result contradicted by a numeric value of 40 or more is unclassified. Detectable numeric results below 40 qualify under the agreed numeric threshold. Same-date contradictory/missing results, negative/malformed numeric values, and invalid/indeterminate results are not classified.
- Breakfast counts present repeat encounters, not extra servings. This assumes the breakfast instrument is NVI-only. Hospital and eye-hospital counts use HCS codes 3 and 2; status-only records are excluded.
- Referrals count issued clinical and social referral records, including incomplete referrals. Service-level referral flags are not added because they may duplicate those issued records. This is reflected in the card title.
- A PrEP appointment is outstanding when a recorded due date is strictly before cutoff, after the originating visit, and no PrEP visit on or after that due date exists by cutoff. Due-today appointments do not count; future attendance does not clear a past report. Rescheduling/cancellation history without explicit structured evidence cannot be inferred.
- Exact repeated exports/repeat identities deduplicate, while separate repeat instances on the same day remain separate encounters. Missing repeat identity falls back to the full row; multiple genuine identical same-day encounters cannot be distinguished without identifiers.
- N/A is shown only for calculated ratios/averages with no eligible denominator. Unimplemented templates show their title and red status label, without a numeric value, even on API failure. Demographic filters apply consistently before indicator calculations.

Validation: `npm run test:dashboard` covers existing chart behavior plus the new indicators, renders all 41 cards with synthetic aggregates, checks explanation field names against the schema, and exercises info-button toggling, Escape and focus restoration. `node scripts/test-localization.mjs` checks all three catalogs, including card definitions. No patient records are used by these tests.
