export type IndicatorValue = number | null | Record<string, number | null>;
export type IndicatorValues = Record<string, IndicatorValue>;

// Missing-field indicators intentionally have no numeric value.
export const dashboardCards = [
  { id: "reach", title: "HIV-related communication attendances" },
  { id: "firstTests", title: "First-time screening tests — HIV, HCV and SYP" },
  { id: "firstReactivity", title: "First-time screening reactivity rate — HIV, HCV and SYP", percent: true },
  { id: "fourBaz", title: "4BAZ attendances" },
  { id: "activeSixMonths", title: "People linked to care and active in care for at least 6 months — HIV, HCV and SYP", blank: true },
  { id: "undetectable", title: "HIV+ people with undetectable viral load" },
  { id: "outreachActivities", title: "Outreach activities" },
  { id: "averageReach", title: "Average attendances per outreach activity", decimal: true },
  { id: "returnedLtfu", title: "Previous LTFU who returned to treatment", blank: true },
  { id: "returnedSuppressed", title: "Previous LTFU who returned and achieved undetectable viral load", blank: true },
  { id: "hivAfterPrep", title: "Confirmed HIV diagnoses after starting PrEP (%)", percent: true },
  { id: "prepRetention", title: "PrEP retention at M3, M6, M9 and M12 (%)", blank: true },
  { id: "testingCoverage", title: "Testing encounters / prevention attendances (%)", percent: true },
  { id: "breakfast", title: "Breakfast encounters @NVI" },
  { id: "nviTested", title: "People tested @NVI", blank: true },
  { id: "psychologist", title: "Psychologist consultations @NVI", blank: true },
  { id: "psychiatrist", title: "Psychiatrist consultations @NVI", blank: true },
  { id: "prepInitiations", title: "People initiated on PrEP for the first time" },
  { id: "arvInitiations", title: "People initiated on ARV for the first time" },
  { id: "nviAccompaniments", title: "Accompaniments @NVI", blank: true },
  { id: "nviBlood", title: "Blood tests @NVI", blank: true },
  { id: "woundDressing", title: "People receiving wound dressing @NVI", blank: true },
  { id: "nutrition", title: "People receiving nutrition support @NVI", blank: true },
  { id: "hospital", title: "Hospital accompaniments" },
  { id: "eyeHospital", title: "Eye-hospital accompaniments" },
  { id: "siteReach", title: "Prevention attendances on sites" },
  { id: "hivRapidTests", title: "HIV rapid tests performed" },
  { id: "hivReactive", title: "People with reactive HIV screening" },
  { id: "hcvReactive", title: "People with reactive HCV screening" },
  { id: "sypReactive", title: "People with reactive SYP screening" },
  { id: "referrals", title: "Clinical and social referrals issued" },
  { id: "linked", title: "People linked to care following a reactive screening test — HIV, HCV and SYP", blank: true },
  { id: "missedPrep", title: "People with outstanding missed PrEP appointments" },
  { id: "linkedSuppressed", title: "People linked to care who achieved undetectable viral load", blank: true },
  { id: "ltfu", title: "People lost to ARV follow-up at period end", blank: true },
  { id: "reactivity", title: "Screening reactivity rate — HIV, HCV and SYP", percent: true },
  { id: "comorbidities", title: "Patients with more than one active comorbidity", blank: true },
  { id: "linked30", title: "Linked to care within 30 days — HIV, HCV and SYP (%)", blank: true },
  { id: "suppression", title: "Viral suppression rate (%)", percent: true },
  { id: "prepSensitised", title: "Prevention attendances sensitised to PrEP (%)", percent: true },
  { id: "prepInterested", title: "Prevention attendances interested in PrEP (%)", percent: true },
] as const;

export type DashboardCardDefinition = (typeof dashboardCards)[number];
export type CardInfo = { assumptions: string; calculation: string; fields: readonly string[]; missing?: string };

const outreachFields = ["oc_date", "oc_type", "oc_hiv_comms", "oc_hepc_comms", "oc_hepb_comms", "oc_syp_comms", "oc_prep_com"];
const screeningFields = ["oc_date", "oc_hiv_rapid_result", "oc_hepc_result", "oc_syp_result"];
const firstTestFields = [...screeningFields, "oc_hiv_status_prev", "oc_hepc_status_prev", "oc_syp_status_prev"];
const vlFields = ["htp_diagnosis_date", "htp_art_start_date", "htm_vl_date", "htm_viral_load_detectable", "htm_vl_level"];
const prepStartFields = ["pv_visit_date", "pv_medication_dispensed", "ptp_previous_use", "ptp_update_date", "ptp_start_date"];
const siteFields = [...outreachFields, "oc_hotspot"];
const screeningAssumptions = "Each person counts once per infection. Use the latest screening date within the reporting period. Same-date disagreements and latest indeterminate/invalid results are excluded; do not fall back to an older result.";
const firstTestAssumptions = "Never tested is code 3. Use the earliest qualifying test per person and infection across all recorded history, counting it only in its reporting period. Missing earlier history cannot establish a lifetime first test.";
const vlAssumptions = "Require a dated HIV diagnosis or ART start by cutoff. Use the latest viral-load test by cutoff, including earlier periods. Undetectable means code 2 or a nonnegative numeric value below 40 copies/mL. Conflicting, invalid or indeterminate results are excluded.";
const missingLinkage = "Dated infection-specific first care consultations, treatment initiations and previous-care status are not fully structured for HIV, HCV and SYP.";
const missingLtfu = "Reliable ARV interaction classification and dated death, transfer and intentional-stop exclusions are incomplete.";
const planned = (assumptions: string, calculation: string, missing: string): CardInfo => ({ assumptions, calculation, missing, fields: [] });

export const dashboardCardInfo: Record<DashboardCardDefinition["id"], CardInfo> = {
  reach: {
    assumptions: "Outreach Contact is the canonical attendance source. Activity types 1, 3, 5, 6, 9 and 12 qualify, as do other types with an explicit IEC/PrEP communication flag. Repeat attendances count separately; multiple topics in one contact count once.",
    calculation: "Count qualifying Outreach Contact encounters dated within the reporting period.", fields: outreachFields,
  },
  firstTests: { assumptions: firstTestAssumptions, calculation: "For each infection, count people whose earliest Never tested screening encounter falls within the period. A same-date conflict still counts as one first test.", fields: firstTestFields },
  firstReactivity: { assumptions: firstTestAssumptions, calculation: "For each infection: reactive earliest first-time results / valid classified earliest first-time results × 100. Exclude conflicting, indeterminate and invalid results from the denominator. No denominator shows No data.", fields: firstTestFields },
  fourBaz: {
    assumptions: "Outreach type 12 and HIV Care Support accompaniment code 9 identify 4BAZ. Exclude status-only HCS records. Omit HCS copies when Outreach already records the same person and day; separate Outreach repeat encounters still count.",
    calculation: "Outreach 4BAZ encounters + remaining HCS 4BAZ encounters within the period.", fields: ["oc_date", "oc_type", "hcs_date", "hcs_care_type", "hcs_care_type___9", "hcs_status_only"],
  },
  activeSixMonths: planned("Any dated interaction can establish continued engagement for the infection, even if linkage occurred before the period.", "Planned: unique people with an interaction in the period at least six calendar months after linkage, by infection.", missingLinkage),
  undetectable: { assumptions: vlAssumptions, calculation: "Count HIV+ people whose latest classifiable viral-load result meets the undetectable definition.", fields: vlFields },
  outreachActivities: { assumptions: "Use prevention activity types 1, 3, 5, 6, 9 and 12 with a recorded site. Normalize site case, whitespace and Unicode. Sessions at the same site on the same day form one activity. Missing sites are excluded; activities with no participant records are unavailable.", calculation: "Count distinct normalized site + date pairs within the period.", fields: siteFields },
  averageReach: { assumptions: "Use the same site-based scope as outreach activity counts. Count repeated attendances. Exclude missing-site contacts from both numerator and denominator.", calculation: "Site-based prevention attendances / distinct site-and-day activities. No activities shows No data.", fields: siteFields },
  returnedLtfu: planned("LTFU means at least six months without an ARV treatment interaction. Any subsequent interaction establishes return.", "Planned: count people whose first return after the qualifying gap falls within the period.", missingLtfu),
  returnedSuppressed: planned("Use all qualifying viral-load tests after return, not only the latest test. Count each person once per reporting period.", "Planned: unique previous LTFU with any undetectable result in the period strictly after return. Undetectable includes numeric values below 40 copies/mL.", missingLtfu),
  hivAfterPrep: { assumptions: "Use the clinical HIV diagnosis date, not reactive screening. PrEP starts on the earliest recorded positive dispensing amount. Both numerator and denominator are cumulative through cutoff; absent earlier dispensing history may misdate a start.", calculation: "People with a confirmed diagnosis strictly after recorded first PrEP dispensing / all recorded PrEP starters by cutoff × 100. No starters shows No data.", fields: ["pv_visit_date", "pv_medication_dispensed", "htp_diagnosis_date"] },
  prepRetention: planned("Anchor on first PrEP dispensing. Require a PrEP-related interaction from M3/M6/M9/M12 through 90 days afterward. Include only fully elapsed windows. Exclude planned stops/transfers dated by the window end.", "Planned: retained eligible starters / all eligible starters × 100 for each milestone, cumulatively through cutoff.", "PrEP status history does not reliably distinguish planned stopping from loss to follow-up, so the agreed denominator exclusions cannot be calculated."),
  testingCoverage: {
    assumptions: "Use total testing encounters across Outreach, Clinic and PrEP, independently of activity attendance; this ratio may exceed 100%. Multiple infections on the same date within an encounter count once. Different sources remain separate because no shared visit ID exists. Respect no-show, purpose and tested flags.",
    calculation: "HIV/HCV/SYP testing encounters in the period / prevention attendances in the period × 100. No attendances shows No data.",
    fields: [...outreachFields, ...screeningFields, "cnv_no_show", "cnv_visit_purpose", "cnv_visit_purpose___3", "cnv_hiv_lab_test_done", "cnv_hiv_lab_test_date", "cnv_hiv_lab_result", "cnv_hcv_lab_test_done", "cnv_hcv_lab_test_date", "cnv_hcv_lab_result", "cnv_syp_lab_test_done", "cnv_syp_lab_test_date", "cnv_syp_lab_result", "pv_visit_date", "pv_blood_collected_date", "pv_visit_purpose", "pv_visit_purpose___4", "pv_hiv_lab_test_done", "pv_hiv_lab_test_date", "pv_hiv_result", "pv_hcv_lab_test_done", "pv_hcv_lab_test_date", "pv_hcv_result", "pv_syp_lab_test_done", "pv_syp_lab_test_date", "pv_syphilis_result"],
  },
  breakfast: { assumptions: "The breakfast instrument is assumed to be NVI-only. Count repeat attendances; extra servings do not create extra encounters.", calculation: "Count breakfast attendance encounters in the period with presence code 1.", fields: ["breakfast_date", "breakfast_present_8edd8b"] },
  nviTested: planned("Count total testing encounters, including repeat visits. Several infections tested during one encounter count once.", "Planned: count completed testing encounters at NVI during the period.", "A consistent per-encounter NVI location is missing across Clinic and PrEP; Outreach type 4 alone does not cover all NVI testing."),
  psychologist: planned("Count completed psychologist consultations, including repeat visits; a referral or generic psychosocial support is not a consultation.", "Planned: count psychologist consultation encounters at NVI within the period.", "Dedicated completed psychologist consultation, date and NVI location fields are missing."),
  psychiatrist: planned("Count completed psychiatrist consultations, including repeat visits; a referral does not prove attendance.", "Planned: count psychiatrist consultation encounters at NVI within the period.", "Dedicated completed psychiatrist consultation, date and NVI location fields are missing."),
  prepInitiations: { assumptions: "Require recorded positive PrEP dispensing and explicit no-prior-use evidence dated by cutoff. Exclude known prior users; unknown history does not prove first-ever use. Use earliest recorded dispensing, never a later restart.", calculation: "Count eligible people whose first recorded PrEP dispensing date falls within the period.", fields: prepStartFields },
  arvInitiations: { assumptions: "The ART start date is assumed to preserve the original first-ever start, including starts outside PILS. Use the earliest recorded start per person; transfers and profile updates are not new initiations.", calculation: "Count people whose original recorded ART start falls within the reporting period.", fields: ["htp_art_start_date"] },
  nviAccompaniments: planned("Count total accompaniment encounters, including hospital and eye-hospital accompaniments as subsets of the NVI total.", "Planned: count all NVI accompaniment encounters within the period.", "A dedicated NVI accompaniment origin/location and shared encounter identifier are missing."),
  nviBlood: planned("One blood-draw encounter counts once even when several laboratory tests are ordered.", "Planned: count completed blood-draw encounters at NVI within the period.", "NVI location and reliable shared encounter identity across Clinic and PrEP are missing."),
  woundDressing: planned("Count completed wound-dressing encounters, including repeat visits.", "Planned: count NVI wound-dressing encounters within the period.", "Structured wound-dressing completion, date and NVI location fields are missing."),
  nutrition: planned("Count separately recorded nutrition support encounters, including repeat visits. Breakfast is excluded.", "Planned: count completed NVI nutrition-support encounters within the period.", "Dedicated nutrition-support completion, date and NVI location fields are missing."),
  hospital: { assumptions: "HCS accompaniment code 3 means Accompaniment Hospital. Visit Hospital (7) is not the same service. Exclude status-only records and count repeated encounters.", calculation: "Count HCS encounters in the period with hospital accompaniment selected.", fields: ["hcs_date", "hcs_care_type", "hcs_care_type___3", "hcs_status_only"] },
  eyeHospital: { assumptions: "HCS accompaniment code 2 identifies eye-hospital accompaniment. Exclude status-only records and count repeated encounters.", calculation: "Count HCS encounters in the period with eye-hospital accompaniment selected.", fields: ["hcs_date", "hcs_care_type", "hcs_care_type___2", "hcs_status_only"] },
  siteReach: { assumptions: "Count total attendances, not unique people. Require a recorded site and prevention activity type 1, 3, 5, 6, 9 or 12; missing sites are excluded.", calculation: "Count qualifying site-based prevention encounters dated within the reporting period.", fields: siteFields },
  hivRapidTests: { assumptions: "Count every recorded rapid screening encounter, including repeated tests for the same person and day. Result codes 1–4 establish a performed test; one record cannot distinguish several specimens within that encounter.", calculation: "Count Outreach encounters in the period with an HIV rapid result code 1, 2, 3 or 4.", fields: ["oc_date", "oc_hiv_rapid_result"] },
  hivReactive: { assumptions: screeningAssumptions, calculation: "Count people whose latest in-period HIV rapid result is reactive (code 1).", fields: ["oc_date", "oc_hiv_rapid_result"] },
  hcvReactive: { assumptions: screeningAssumptions, calculation: "Count people whose latest in-period HCV screening result is reactive (code 1).", fields: ["oc_date", "oc_hepc_result"] },
  sypReactive: { assumptions: screeningAssumptions, calculation: "Count people whose latest in-period syphilis screening result is reactive (code 1). This does not establish confirmed active syphilis.", fields: ["oc_date", "oc_syp_result"] },
  referrals: { assumptions: "Count issued clinical and social referral records, whether completed or not. Do not add service-level referral flags because they may duplicate issued records.", calculation: "Clinical referral encounters + social referral encounters with referral dates in the period.", fields: ["cr_date", "sr_date"] },
  linked: planned("Linkage is the first care consultation or treatment initiation, whichever happens first, after a reactive test. Count linkage during the period even if screening was earlier.", "Planned: count unique people linked following reactive screening, separately for HIV, HCV and SYP.", missingLinkage),
  missedPrep: { assumptions: "An appointment is missed from the next day. Any subsequent PrEP visit clears it from that attendance date. Include outstanding appointments scheduled before the period. Future attendance cannot clear a historical report; unrecorded cancellation/rescheduling cannot be inferred.", calculation: "Count unique people with a due date after its originating visit and strictly before cutoff, without a later PrEP attendance on or after that due date by cutoff.", fields: ["pv_visit_date", "pv_next_med_date", "pv_next_blood_date", "pv_next_doctor_date", "pv_next_lab_review_date", "pv_next_appointment_date"] },
  linkedSuppressed: planned("Use all undetectable viral-load tests in the period strictly after linkage, even if linkage was earlier. Count each person once per period. Numeric results below 40 copies/mL also qualify.", "Planned: unique linked people with any qualifying undetectable result in the period.", missingLinkage),
  ltfu: planned("Use status at period end, not just new LTFU during the period. LTFU means six months without an ARV treatment interaction. Exclude documented death, transfer and intentional ARV stopping by cutoff.", "Planned: count all eligible people meeting the six-month ARV interaction gap at cutoff.", missingLtfu),
  reactivity: { assumptions: screeningAssumptions, calculation: "For each infection: people with a reactive latest result / people with a valid classified latest result × 100. No eligible denominator shows No data.", fields: screeningFields },
  comorbidities: planned("Include all active conditions recorded in medical history, excluding HIV itself. Count people with at least two active conditions at period end.", "Planned: count unique people with more than one active non-HIV condition at cutoff.", "Known comorbidities are recorded, but condition-level active/resolved status and onset/resolution dates are missing."),
  linked30: planned("Use reactive tests in the period. Exclude people already in care for that infection and those whose 30-day window has not ended by cutoff. Start the clock on the reactive-test date.", "Planned: people linked within 30 days / people requiring linkage with fully elapsed windows × 100, separately by infection.", missingLinkage),
  suppression: { assumptions: vlAssumptions, calculation: "HIV+ people with an undetectable latest result / HIV+ people with a classifiable latest viral-load result × 100. No eligible denominator shows No data.", fields: vlFields },
  prepSensitised: { assumptions: "Use all qualifying prevention attendances as the denominator. Repeat participation counts again in both numerator and denominator; missing communication flags do not contribute to the numerator.", calculation: "Prevention encounters with PrEP communication code 1 / all prevention attendances × 100. No attendances shows No data.", fields: outreachFields },
  prepInterested: { assumptions: "Use all qualifying prevention attendances, not only those sensitised to PrEP, as the denominator. Repeat participation counts again in both numerator and denominator.", calculation: "Prevention encounters with PrEP interest code 1 / all prevention attendances × 100. No attendances shows No data.", fields: [...outreachFields, "oc_prep_interested"] },
};

// Applied to every calculated card before aggregation. Checkbox export names
// are shown literally so they can be matched to the REDCap flat export.
export const sharedIndicatorFields = ["uic_ori", "redcap_repeat_instrument", "redcap_repeat_instance", "redcap_event_name", "ce_gender_identity", ...Array.from({ length: 8 }, (_, i) => `ce_kp_type___${i + 1}`)];
