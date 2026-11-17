export type DashboardCardInfo = { calculation: string; assumptions: string[]; fields: string[] };
const rapid = ['oc_hiv_rapid_result', 'oc_syp_result', 'oc_hepc_result', 'oc_hepb_result'];
const lab = ['cnv_hiv_lab_result', 'cnv_syp_lab_result', 'cnv_hcv_lab_result', 'cnv_hbv_lab_result', 'pv_hiv_result', 'pv_syphilis_result', 'pv_hcv_result', 'pv_hbv_result'];
const dates = ['oc_date', 'cnv_*_lab_test_date', 'pv_*_lab_test_date', 'pv_blood_collected_date', 'pv_visit_date'];
const eligibility = ['cnv_no_show', 'cnv_visit_purpose', 'cnv_*_lab_test_done', 'pv_*_lab_test_done'];
const demographics = ['uic_ori', 'ce_gender_identity', 'ce_kp_type'];
const supplies = ['oc_male_condoms', 'oc_female_condoms', 'oc_lubricant', 'oc_syringes', 'oc_num_needles', 'cnv_num_male_condoms', 'cnv_num_female_condoms', 'cnv_num_lube', 'cnv_num_needles', 'hcs_num_male_condoms', 'hcs_num_female_condoms', 'hcs_num_lube', 'hcs_num_needles'];
const supplyDates = ['oc_date', 'cnv_date', 'hcs_date', 'cnv_no_show', 'cnv_visit_purpose', 'hcs_status_only'];
const filters = 'All counts follow the selected period, gender and key populations. Dates end today in Mauritius; Last week means today and the preceding six days. Missing selected demographics are excluded.';
const tests = 'Count once per UIC, infection, method and test date. Clinic and PrEP laboratory copies on the same date merge. Rapid and laboratory tests remain separate. Without specimen identifiers, same-day repeat specimens cannot be distinguished.';
const eligibilityText = 'Clinic results require laboratory-review purpose 3 when purposes are selected; no-shows and tests explicitly marked not done are excluded. Recorded PrEP results count even without lab-review purpose 4. Legacy blank purpose or tested flags are allowed.';
const dateText = 'Use the infection-specific test date. For PrEP only, a missing test date falls back to blood-collection date, then visit date. Invalid dates never fall back; undated and future results are excluded.';
const outcomeText = 'Codes 1, 2, 3 and 4 mean positive, negative, indeterminate and invalid. Recognised legacy syphilis text is mapped; other non-pending text is unclassified. Different outcomes for one counted test appear once as conflicting, not as positive or negative.';
const supplyText = 'Sum positive whole-number quantities from Outreach, Clinic and HIV Care Support. Clinic requires commodities purpose 16 when purposes are selected and excludes no-shows. HCS status-only rows are excluded. Combined needle/syringe fields count once under Needles.';
const commonFields = [...demographics, ...dates, ...eligibility];
export function dashboardCardInfo(key: string): DashboardCardInfo {
  const infection = { hiv: ['hiv', 'hiv'], syphilis: ['syp', 'syphilis'], hcv: ['hcv', 'hcv'], hbv: ['hbv', 'hbv'] }[key];
  if (infection) {
    const [code, prepCode] = infection;
    const outreachCode = code === 'hcv' ? 'hepc' : code === 'hbv' ? 'hepb' : code;
    return { calculation: 'Group eligible tests for this infection by method and outcome. First time tested counts rapid tests with previous status Never tested (code 3); laboratory tests have no first-time measure.', assumptions: [filters, tests, dateText, eligibilityText, outcomeText], fields: [...demographics, `oc_${outreachCode === 'hiv' ? 'hiv_rapid' : outreachCode}_result`, `oc_${outreachCode}_status_prev`, 'oc_date', `cnv_${code}_lab_result`, `cnv_${code}_lab_test_date`, `cnv_${code}_lab_test_done`, `pv_${prepCode}_result`, `pv_${code}_lab_test_date`, `pv_${code}_lab_test_done`, 'pv_blood_collected_date', 'pv_visit_date', 'cnv_no_show', 'cnv_visit_purpose'] };
  }
  const definitions: Record<string, DashboardCardInfo> = {
    clients: { calculation: 'Count distinct UICs represented by at least one eligible rapid test, laboratory test or commodity quantity. A client appearing in several sources counts once.', assumptions: [filters, tests, dateText, eligibilityText, supplyText], fields: [...commonFields, ...rapid, ...lab, ...supplies, ...supplyDates] },
    rapidEncounters: { calculation: 'Count distinct UIC and date pairs with an eligible rapid result. Several infections tested for the same client on the same date count as one rapid encounter.', assumptions: [filters, tests, outcomeText], fields: [...demographics, 'oc_date', ...rapid] },
    labEncounters: { calculation: 'Count distinct UIC and resolved test-date pairs with an eligible laboratory result. Different infections or Clinic/PrEP entries on the same client-day count as one laboratory encounter.', assumptions: [filters, tests, dateText, eligibilityText], fields: [...commonFields, ...lab] },
    commodityUnits: { calculation: 'Add the units of all five commodity categories. This is a quantity total, not a count of clients or visits.', assumptions: [filters, supplyText], fields: [...demographics, ...supplies, ...supplyDates] },
    testing: { calculation: 'For each infection, count eligible rapid and laboratory tests separately. Laboratory totals combine Clinic and PrEP after deduplication.', assumptions: [filters, tests, dateText, eligibilityText, outcomeText], fields: [...commonFields, ...rapid, ...lab] },
    trend: { calculation: 'Add counted tests across infections for each method and time bucket. Today, week and month use daily buckets; quarter, year and all time use monthly buckets. Empty buckets show zero.', assumptions: [filters, tests, dateText, eligibilityText], fields: [...commonFields, ...rapid, ...lab] },
    commodities: { calculation: 'Sum units separately for male condoms, female condoms, lubricant, syringes and needles. Tooltip UIC contributions show units rather than visits.', assumptions: [filters, supplyText], fields: [...demographics, ...supplies, ...supplyDates] },
    filters: { calculation: 'Filters apply before aggregation. Selected genders match any chosen value; selected key populations match any membership. Gender and population filters must both match when used together.', assumptions: [filters, 'Last month, quarter and year are rolling periods. All time includes available dated records through today. Clients without a selected demographic value are excluded; All includes them.'], fields: [...commonFields, ...supplyDates] },
  };
  return definitions[key] ?? definitions.testing;
}
