// Elisa Kevin Veragoo + ChatGPT
import "server-only";
import { upcomingHcs, mauritiusDate, type HcsRow } from "@/lib/hcs-upcoming";

export async function loadUpcomingHcs() {
  const url = process.env.REDCAP_API_URL, token = process.env.REDCAP_API_TOKEN;
  if (!url || !token) throw new Error("Unable to load upcoming HIV care follow-ups.");
  const fields = ["uic_ori", "ce_first_name", "ce_last_name", "ce_alias", "hcs_date", "hcs_followup_needed", "hcs_followup_date", "hcs_notes", "hcs_navigator_1", "hcs_navigator_2", "hcs_navigator_3", "hcs_status_only"];
  const response = await fetch(url, {
    method: "POST",
    body: new URLSearchParams({ token, content: "record", action: "export", format: "json", returnFormat: "json", type: "flat", rawOrLabel: "raw", rawOrLabelHeaders: "raw", ...Object.fromEntries(fields.map((field, index) => [`fields[${index}]`, field])) }),
    cache: "no-store",
    signal: AbortSignal.timeout(60000),
  });
  const rows: unknown = await response.json();
  if (!response.ok || !Array.isArray(rows) || rows.some(row => !row || typeof row !== "object")) throw new Error("Unable to load upcoming HIV care follow-ups.");
  return upcomingHcs(rows as HcsRow[], mauritiusDate());
}
