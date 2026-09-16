#!/usr/bin/env node

const apiUrl = process.env.REDCAP_API_URL;
const token = process.env.REDCAP_API_TOKEN;
if (!apiUrl || !token) throw new Error("REDCap API configuration is missing.");

const rapidRates = {
  "1": { hiv: 82, syp: 94, hcv: 48, hbv: 38 },
  "2": { hiv: 88, syp: 94, hcv: 36, hbv: 30 },
  "3": { hiv: 78, syp: 88, hcv: 80, hbv: 58 },
  "4": { hiv: 72, syp: 84, hcv: 68, hbv: 50 },
  "5": { hiv: 86, syp: 92, hcv: 40, hbv: 34 },
  "6": { hiv: 66, syp: 78, hcv: 52, hbv: 44 },
  "7": { hiv: 56, syp: 72, hcv: 28, hbv: 32 },
};
const labRates = {
  "1": { hiv: 32, syp: 58, hcv: 14, hbv: 10 },
  "2": { hiv: 44, syp: 62, hcv: 16, hbv: 12 },
  "3": { hiv: 34, syp: 50, hcv: 44, hbv: 28 },
  "4": { hiv: 26, syp: 44, hcv: 36, hbv: 22 },
  "5": { hiv: 40, syp: 58, hcv: 18, hbv: 12 },
  "6": { hiv: 26, syp: 38, hcv: 26, hbv: 18 },
  "7": { hiv: 18, syp: 32, hcv: 10, hbv: 12 },
};
const fields = {
  hiv: { rapid: "outreach_hiv_rapid_result", done: "clinic_hiv_lab_test_done", date: "clinic_hiv_lab_test_date", received: "clinic_hiv_lab_result_received", lab: "clinic_hiv_lab_result" },
  syp: { rapid: "outreach_syp_result", done: "clinic_syp_lab_test_done", date: "clinic_syp_lab_test_date", received: "clinic_syb_lab_result_received", lab: "clinic_syp_lab_result" },
  hcv: { rapid: "outreach_hepc_result", done: "clinic_hcv_lab_test_done", date: "clinic_hcv_lab_test_date", received: "clinic_hcv_lab_result_received", lab: "clinic_hcv_lab_result" },
  hbv: { rapid: "outreach_hepb_result", done: "clinic_hbv_lab_test_done", date: "clinic_hbv_lab_test_date", received: "clinic_hbv_lab_result_received", lab: "clinic_hbv_lab_result" },
};

async function redcap(params) {
  const response = await fetch(apiUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token, format: "json", returnFormat: "json", ...params }) });
  const text = await response.text();
  let result;
  try { result = JSON.parse(text); } catch { throw new Error(`REDCap returned non-JSON (HTTP ${response.status}).`); }
  if (!response.ok || result?.error) throw new Error(result?.error || `REDCap returned HTTP ${response.status}.`);
  return result;
}
const hash = (text) => [...text].reduce((value, character) => ((value * 33) ^ character.charCodeAt(0)) >>> 0, 5381);
const chosen = (clients, percentage, salt) => new Set([...clients].sort((a, b) => hash(`${a.uic}:${salt}`) - hash(`${b.uic}:${salt}`)).slice(0, Math.round(clients.length * percentage / 100)).map(({ uic }) => uic));

async function main() {
  const rows = await redcap({ content: "record", action: "export", type: "flat", fields: "uic_ori,client_first_name,client_kp_type,outreach_date,clinic_visit_date" });
  const clients = rows.filter((row) => /^Testclient[A-Z]+$/.test(row.client_first_name || "")).map((row) => ({ uic: row.uic_ori, kp: ["1", "2", "3", "4", "5", "6", "7"].find((code) => row[`client_kp_type___${code}`] === "1") }));
  if (clients.length !== 100 || new Set(clients.map(({ uic }) => uic)).size !== 100 || clients.some(({ kp }) => !kp)) throw new Error("Safety stop: the project is not the expected 100-client synthetic cohort.");

  const selected = { rapid: {}, lab: {} };
  for (const mode of ["rapid", "lab"]) for (const infection of Object.keys(fields)) {
    selected[mode][infection] = new Set();
    for (const kp of Object.keys(mode === "rapid" ? rapidRates : labRates)) {
      const group = clients.filter((client) => client.kp === kp);
      for (const uic of chosen(group, (mode === "rapid" ? rapidRates : labRates)[kp][infection], `${mode}:${infection}`).values()) selected[mode][infection].add(uic);
    }
  }

  const dateByClient = new Map();
  for (const row of rows) if (row.clinic_visit_date) dateByClient.set(row.uic_ori, row.clinic_visit_date);
  const updates = [];
  for (const client of clients) {
    const outreach = { uic_ori: client.uic, redcap_repeat_instrument: "outreach_contact", redcap_repeat_instance: "1" };
    const clinic = { uic_ori: client.uic, redcap_repeat_instrument: "clinic_visit", redcap_repeat_instance: "1" };
    for (const [infection, names] of Object.entries(fields)) {
      const hasRapid = selected.rapid[infection].has(client.uic);
      const hasLab = selected.lab[infection].has(client.uic);
      const positive = hash(`${client.uic}:${infection}:result`) % 100 < (infection === "hiv" ? 9 : infection === "syp" ? 12 : 8);
      outreach[names.rapid] = hasRapid ? (positive ? "1" : "2") : "";
      clinic[names.done] = hasLab ? "1" : "0";
      clinic[names.date] = hasLab ? dateByClient.get(client.uic) : "";
      clinic[names.received] = hasLab ? "1" : "0";
      clinic[names.lab] = hasLab ? (positive ? "1" : "2") : "";
    }
    updates.push(outreach, clinic);
  }
  await redcap({ content: "record", action: "import", type: "flat", overwriteBehavior: "overwrite", forceAutoNumber: "false", dateFormat: "YMD", data: JSON.stringify(updates), returnContent: "count" });

  const audit = {};
  for (const infection of Object.keys(fields)) audit[infection] = { rapid: selected.rapid[infection].size, laboratory: selected.lab[infection].size };
  console.log(JSON.stringify({ updated_synthetic_clients: clients.length, coverage: audit }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exit(1); });
