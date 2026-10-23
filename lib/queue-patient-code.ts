// Elisa Kevin Veragoo + ChatGPT
type Row = Record<string, string>;
export class PatientCodeError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();
const identity = (value: string) => normalize(value).replace(/\s/g, "");
async function redcap(params: Record<string, string>): Promise<unknown> {
  const url = process.env.REDCAP_API_URL, token = process.env.REDCAP_API_TOKEN;
  if (!url || !token) throw new PatientCodeError("REDCap API configuration is missing.", 502);
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token, format: "json", returnFormat: "json", ...params }), cache: "no-store" });
  const result = await response.json();
  if (!response.ok || result?.error) throw new PatientCodeError(result?.error || "Unable to save the patient code in REDCap.", 502);
  return result;
}
export async function saveQueuePatientCode(recordId: string, submitted?: string) {
  const rows = await redcap({ content: "record", action: "export", type: "flat", rawOrLabel: "raw", "fields[0]": "uic_ori", "fields[1]": "cne_patient_code" }) as Row[];
  const client = rows.find(row => row.uic_ori === recordId && !row.redcap_repeat_instrument && !row.redcap_repeat_instance);
  if (!client) throw new PatientCodeError("The client no longer exists in REDCap. Reload the queue.", 409);
  const existing = client.cne_patient_code?.trim() || "", code = normalize(submitted ?? "");
  if (existing) {
    if (code && identity(code) !== identity(existing)) throw new PatientCodeError("This client already has a patient code in REDCap. Reload the queue before changing it.", 409);
    return existing;
  }
  if (!code) throw new PatientCodeError("Enter a patient code before leaving file retrieval.");
  if (code.length > 100) throw new PatientCodeError("Patient code is too long.");
  if (rows.some(row => row.uic_ori !== recordId && identity(row.cne_patient_code ?? "") === identity(code))) throw new PatientCodeError("This patient code is already assigned to another client.", 409);
  await redcap({ content: "record", action: "import", type: "flat", overwriteBehavior: "normal", forceAutoNumber: "false", returnContent: "count", data: JSON.stringify([{ uic_ori: recordId, cne_patient_code: code }]) });
  const verified = await redcap({ content: "record", action: "export", type: "flat", rawOrLabel: "raw", "records[0]": recordId, "fields[0]": "uic_ori", "fields[1]": "cne_patient_code" }) as Row[];
  if (!verified.some(row => row.uic_ori === recordId && !row.redcap_repeat_instrument && row.cne_patient_code === code)) throw new PatientCodeError("The patient code could not be verified in REDCap. The client has not been moved.", 502);
  return code;
}
