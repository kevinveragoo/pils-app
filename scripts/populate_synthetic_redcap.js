#!/usr/bin/env node

const apiUrl = process.env.REDCAP_API_URL;
const token = process.env.REDCAP_API_TOKEN;
if (!apiUrl || !token) throw new Error("REDCap API configuration is missing.");

const DAY = 86_400_000;
const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const ymd = (date) => date.toISOString().slice(0, 10);
const daysAgo = (days) => ymd(new Date(today.getTime() - days * DAY));
const alpha = (number) => {
  let result = "";
  for (let value = number; value > 0; value = Math.floor((value - 1) / 26)) result = String.fromCharCode(65 + ((value - 1) % 26)) + result;
  return result;
};
const cleanLetters = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/gi, "").toUpperCase();
const makeUic = ({ gender, dob, first, middle, last }) => {
  const prefix = ({ "1": "M", "2": "F", "3": "T", "4": "T", "5": "O", "9": "R" })[gender];
  const [year, month, day] = dob.split("-");
  const initials = cleanLetters(first).slice(0, 1) + middle.trim().split(/\s+/).filter(Boolean).map((name) => cleanLetters(name).slice(0, 1)).join("");
  const surname = cleanLetters(last);
  return `${prefix}${day}${month}${year}${initials}_${surname[0]}${surname.at(-1)}`;
};

async function redcap(params) {
  const response = await fetch(apiUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token, format: "json", returnFormat: "json", ...params }) });
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { throw new Error(`REDCap returned non-JSON (HTTP ${response.status}).`); }
  if (!response.ok || result?.error) throw new Error(result?.error || `REDCap returned HTTP ${response.status}.`);
  return result;
}

function buildClient(index) {
  const suffix = alpha(index + 1);
  const gender = ["1", "2", "3", "4", "5", "9"][index % 6];
  const kp = ["1", "2", "3", "4", "5", "6", "7"][index % 7];
  const birth = new Date(Date.UTC(1977 + (index % 25), index % 12, 1 + (index % 27)));
  const identity = { gender, dob: ymd(birth), first: `Testclient${suffix}`, middle: "Demo", last: `Synthetic${suffix}` };
  const uic = makeUic(identity);
  const activityDaysAgo = index < 7 ? [0, 1, 3, 8, 20, 60, 180][index] : (index * 17) % 1100;
  const activityDate = daysAgo(activityDaysAgo);
  const enrollmentDate = daysAgo(activityDaysAgo + 14 + (index % 40));
  const rows = [{
    uic_ori: uic,
    enrollment_date_11a07b: enrollmentDate,
    district_979c1b: String((index % 9) + 1), hotspot: "1",
    client_outreach_worker: `Demo Worker ${(index % 4) + 1}`,
    client_last_name: identity.last, client_first_name: identity.first, client_middle_name: identity.middle,
    client_alias: `Sample ${suffix}`, client_dob: identity.dob, client_gender_identity: gender,
    [`client_kp_type___${kp}`]: "1", client_active: "1",
  }];

  const hivRapid = index % 13 === 0 ? "1" : index % 31 === 0 ? "3" : "2";
  const sypRapid = index % 17 === 0 ? "1" : "2";
  const hcvRapid = index % 19 === 0 ? "1" : "2";
  const hbvRapid = index % 23 === 0 ? "1" : "2";
  rows.push({ uic_ori: uic, redcap_repeat_instrument: "outreach_contact", redcap_repeat_instance: "1",
    outreach_worker_1: `Demo Worker ${(index % 4) + 1}`, outreach_date: activityDate,
    outreact_contact_type: String((index % 12) + 1), outreach_hotspot: `Synthetic site ${(index % 5) + 1}`,
    outreach_hiv_rapid_result: hivRapid, outreach_syp_result: sypRapid,
    outreach_hepc_result: hcvRapid, outreach_hepb_result: hbvRapid,
    outreach_male_condoms: String(4 + (index % 9) * 2), outreach_female_condoms: String(index % 4), outreach_lubricant: String(3 + (index % 8)),
    outreach_syringes: ["3", "4"].includes(kp) ? String(5 + (index % 12)) : "", outreach_needles: ["3", "4"].includes(kp) ? String(5 + (index % 12)) : "",
  });

  const labDate = daysAgo(Math.max(0, activityDaysAgo - (index % 5)));
  const hivLab = index % 14 === 0 ? "1" : index % 37 === 0 ? "3" : "2";
  const sypLab = index % 18 === 0 ? "1" : "2";
  const hcvLab = index % 20 === 0 ? "1" : "2";
  const hbvLab = index % 24 === 0 ? "1" : "2";
  rows.push({ uic_ori: uic, redcap_repeat_instrument: "clinic_visit", redcap_repeat_instance: "1",
    clinic_visit_worker: `Demo Clinician ${(index % 3) + 1}`, clinic_visit_date: labDate, clinic_sti_treated: sypLab === "1" ? "1" : "0",
    clinic_hiv_lab_test_done: "1", clinic_hiv_lab_test_date: labDate, clinic_hiv_lab_result_received: "1", clinic_hiv_lab_result: hivLab,
    clinic_syp_lab_test_done: "1", clinic_syp_lab_test_date: labDate, clinic_syb_lab_result_received: "1", clinic_syp_lab_result: sypLab,
    clinic_hcv_lab_test_done: "1", clinic_hcv_lab_test_date: labDate, clinic_hcv_lab_result_received: "1", clinic_hcv_lab_result: hcvLab,
    clinic_hbv_lab_test_done: "1", clinic_hbv_lab_test_date: labDate, clinic_hbv_lab_result_received: "1", clinic_hbv_lab_result: hbvLab,
    clinic_male_condoms: String(index % 7), clinic_female_condoms: String(index % 3), clinic_lube: String(index % 6), clinic_needles: ["3", "4"].includes(kp) ? String(index % 8) : "",
  });

  if (hivLab === "1") {
    rows.push({ uic_ori: uic, redcap_repeat_instrument: "hiv_care_support", redcap_repeat_instance: "1", hiv_care_navigator: `Demo Navigator ${(index % 3) + 1}`, hiv_care_date: labDate, hiv_currently_art: index % 2 ? "1" : "0", hiv_art_status_code: index % 2 ? "2" : "1", hiv_male_condoms: String(4 + (index % 5)), hiv_female_condoms: String(index % 3), hiv_lube: String(2 + (index % 4)), hiv_needles: ["3", "4"].includes(kp) ? String(index % 6) : "" });
    rows.push({ uic_ori: uic, redcap_repeat_instrument: "hiv_clinical_monitoring", redcap_repeat_instance: "1", hiv_monitor_date: labDate });
  }
  rows.push({ uic_ori: uic, redcap_repeat_instrument: "breakfast_attendance", redcap_repeat_instance: "1", breakfast_date_540791: activityDate, breakfast_present_8edd8b: index % 5 === 0 ? "0" : "1" });
  return { uic, rows };
}

async function main() {
  const existing = await redcap({ content: "record", action: "export", type: "flat", fields: "uic_ori" });
  const existingIds = new Set(existing.map((row) => row.uic_ori).filter(Boolean));
  if (existingIds.size || existing.length) throw new Error(`Safety stop: the target project is not empty (${existingIds.size} records, ${existing.length} rows).`);

  const metadata = await redcap({ content: "metadata" });
  const available = new Set(metadata.map((field) => field.field_name));
  const requiredSchema = ["uic_ori", "client_kp_type", "outreach_date", "outreact_contact_type", "clinic_visit_date", "clinic_hiv_lab_result", "clinic_syp_lab_result", "clinic_hcv_lab_result", "clinic_hbv_lab_result"];
  const missing = requiredSchema.filter((field) => !available.has(field));
  if (missing.length) throw new Error(`Safety stop: expected fields are missing: ${missing.join(", ")}`);

  const clients = Array.from({ length: 100 }, (_, index) => buildClient(index));
  const ids = new Set(clients.map(({ uic }) => uic));
  if (ids.size !== 100) throw new Error(`UIC validation failed: generated ${ids.size} unique UICs.`);

  let importedRows = 0;
  for (let offset = 0; offset < clients.length; offset += 20) {
    const data = clients.slice(offset, offset + 20).flatMap(({ rows }) => rows);
    const result = await redcap({ content: "record", action: "import", type: "flat", overwriteBehavior: "normal", forceAutoNumber: "false", dateFormat: "YMD", data: JSON.stringify(data), returnContent: "count" });
    importedRows += Number(result.count ?? 0);
    console.log(`Imported synthetic clients ${offset + 1}-${Math.min(offset + 20, clients.length)} (${data.length} rows).`);
  }

  const verification = await redcap({ content: "record", action: "export", type: "flat", fields: "uic_ori" });
  const verifiedIds = new Set(verification.map((row) => row.uic_ori).filter(Boolean));
  if (verifiedIds.size !== 100) throw new Error(`Post-import verification failed: REDCap contains ${verifiedIds.size} unique records.`);
  console.log(JSON.stringify({ synthetic_records: verifiedIds.size, imported_rows_reported: importedRows, exported_rows: verification.length }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exit(1); });
