import type { CardInfo } from "./dashboard-cards";

const rapidFields = ["oc_date", "oc_hiv_rapid_result", "oc_hepc_result", "oc_syp_result", "oc_hepb_result"];
const firstTimeFields = ["oc_hiv_status_prev", "oc_hepc_status_prev", "oc_syp_status_prev", "oc_hepb_status_prev"];
const labFields = ["cnv_no_show", "cnv_visit_purpose", "cnv_visit_purpose___3", "pv_visit_date", "pv_blood_collected_date", "pv_visit_purpose", "pv_visit_purpose___4", ...["hiv", "hcv", "syp", "hbv"].flatMap(infection => [`cnv_${infection}_lab_test_done`, `cnv_${infection}_lab_test_date`, `cnv_${infection}_lab_result`, `pv_${infection}_lab_test_done`, `pv_${infection}_lab_test_date`, infection === "syp" ? "pv_syphilis_result" : `pv_${infection}_result`])];
const commodityFields = ["oc_date", "oc_male_condoms", "oc_female_condoms", "oc_lubricant", "oc_syringes", "oc_num_needles", "cnv_date", "cnv_no_show", "cnv_visit_purpose", "cnv_visit_purpose___16", "cnv_num_male_condoms", "cnv_num_female_condoms", "cnv_num_lube", "cnv_num_needles", "hcs_date", "hcs_status_only", "hcs_num_male_condoms", "hcs_num_female_condoms", "hcs_num_lube", "hcs_num_needles"];
const testAssumptions = "Default charts count distinct patient + infection + method + test-date combinations, not the Executive latest-result person counts. Clinic and PrEP copies of the same laboratory test merge. Same-date disagreements count once as conflicting. Missing, invalid and future dates are excluded. Explicit no-shows, wrong purposes and not-tested flags are excluded; unflagged legacy records remain eligible.";
const commodityAssumptions = "Only positive safe-integer quantities with eligible dates count. Exclude clinic no-shows, hidden quantities from other selected purposes, and HCS status-only rows. Clinic/HCS combined needles-and-syringes quantities count once under Needles. Quantities are not deduplicated like tests.";

function infectionInfo(infection: "hiv" | "syphilis" | "hcv" | "hbv"): CardInfo {
  return {
    assumptions: testAssumptions,
    calculation: "Group distinct tests by positive/reactive, negative/non-reactive, indeterminate, invalid, recorded/unclassified or conflicting outcome. First time tested counts rapid tests with a contributing Never tested entry (code 3); this legacy chart is not a lifetime-first-person measure.",
    fields: [...rapidFields, ...firstTimeFields, ...labFields].filter(field => !/_(hiv|hcv|hepc|syp|syphilis|hbv|hepb)_/.test(field) || (infection === "syphilis" ? /_(syp|syphilis)_/.test(field) : infection === "hcv" ? /_(hcv|hepc)_/.test(field) : infection === "hbv" ? /_(hbv|hepb)_/.test(field) : /_hiv_/.test(field))),
  };
}

export const defaultDashboardCards = [
  { id: "default-clients", title: "Clients represented" },
  { id: "default-rapid", title: "Rapid encounters" },
  { id: "default-laboratory", title: "Laboratory encounters" },
  { id: "default-units", title: "Commodity units" },
  { id: "default-testing", title: "Tests by infection and method", chart: true },
  { id: "default-hiv", title: "HIV results by method", chart: true },
  { id: "default-syphilis", title: "SYP results by method", chart: true },
  { id: "default-hcv", title: "HCV results by method", chart: true },
  { id: "default-hbv", title: "HBV results by method", chart: true },
  { id: "default-trend", title: "Testing trend", chart: true },
  { id: "default-commodities", title: "Commodities provided", chart: true },
] as const;

export const defaultDashboardCardInfo: Record<(typeof defaultDashboardCards)[number]["id"], CardInfo> = {
  "default-clients": { assumptions: "Count each patient UIC once across eligible rapid tests, laboratory tests and commodity distributions. This is represented clients, not all enrolled people. All selected demographic and period filters apply.", calculation: "Size of the union of eligible test-recipient and commodity-recipient UICs.", fields: [...rapidFields, ...labFields, ...commodityFields] },
  "default-rapid": { assumptions: testAssumptions, calculation: "Count distinct patient + date days with at least one eligible rapid result, across HIV, HCV, SYP and HBV. Multiple infections on the same patient-day count as one encounter.", fields: rapidFields },
  "default-laboratory": { assumptions: testAssumptions, calculation: "Count distinct patient + resolved laboratory test-date days. PrEP historical dates fall back to blood collection then visit date only when the preferred test date is absent.", fields: labFields },
  "default-units": { assumptions: commodityAssumptions, calculation: "Sum eligible male condoms, female condoms, lubricant packs, syringes and needles across sources within the period.", fields: commodityFields },
  "default-testing": { assumptions: testAssumptions, calculation: "For each infection, count distinct eligible rapid and laboratory tests separately. Rapid and laboratory methods on the same date remain separate tests.", fields: [...rapidFields, ...labFields] },
  "default-hiv": infectionInfo("hiv"),
  "default-syphilis": infectionInfo("syphilis"),
  "default-hcv": infectionInfo("hcv"),
  "default-hbv": infectionInfo("hbv"),
  "default-trend": { assumptions: testAssumptions, calculation: "Bucket distinct rapid and laboratory tests by day for shorter periods and by month for quarter/year/all-time. Include zero-activity buckets across the range; all-time starts at the earliest eligible observed test month.", fields: [...rapidFields, ...labFields] },
  "default-commodities": { assumptions: commodityAssumptions, calculation: "Sum each commodity's eligible quantities independently for the selected period and population. Show units, not unique recipients.", fields: commodityFields },
};
