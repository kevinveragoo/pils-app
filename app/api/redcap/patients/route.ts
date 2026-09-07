import { NextResponse } from "next/server";

const REDCAP_API_URL = process.env.REDCAP_API_URL;
const REDCAP_API_TOKEN = process.env.REDCAP_API_TOKEN;

type RedcapRow = {
  uic_ori?: string;
  client_first_name?: string;
  client_middle_names?: string;
  client_last_name?: string;
  client_alias?: string;
  client_name_alias?: string;
  redcap_repeat_instrument?: string;
};

export async function GET() {
  try {
    if (!REDCAP_API_URL || !REDCAP_API_TOKEN) {
      return NextResponse.json(
        { error: "REDCap API configuration is missing." },
        { status: 500 }
      );
    }

    const form = new URLSearchParams({
      token: REDCAP_API_TOKEN,
      content: "record",
      action: "export",
      format: "json",
      type: "flat",
      rawOrLabel: "raw",
      rawOrLabelHeaders: "raw",
      exportCheckboxLabel: "false",
      exportSurveyFields: "false",
      exportDataAccessGroups: "false",
      returnFormat: "json",

      "fields[0]": "uic_ori",
      "fields[1]": "client_first_name",
      "fields[2]": "client_middle_names",
      "fields[3]": "client_last_name",
      "fields[4]": "client_alias",
      "fields[5]": "client_name_alias",
    });

    const response = await fetch(REDCAP_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form,
      cache: "no-store",
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        text || `REDCap returned HTTP ${response.status}`
      );
    }

    const rows: RedcapRow[] = JSON.parse(text);

    const patients = rows
      // PILSDB's canonical UIC is the record ID; names are optional.
      .filter((row) => String(row.uic_ori ?? "").trim() !== "")

      // Ignore repeating-instrument rows
      .filter((row) => !row.redcap_repeat_instrument)

      // Convert REDCap field names into the format
      // expected by BreakfastAttendance.tsx
      .map((row) => {
        const recordId = String(row.uic_ori).trim();

        return {
          record_id: recordId,
          uic: recordId,
          display_name:
            [row.client_first_name, row.client_middle_names, row.client_last_name]
              .map((part) => String(part ?? "").trim())
              .filter(Boolean)
              .join(" ")
              .trim() ||
            String(row.client_alias ?? "").trim() ||
            String(row.client_name_alias ?? "").trim() ||
            recordId,
        };
      });

    // REDCap can return more than one row for the same patient.
    // Keep only one row per REDCap record.
    const uniquePatients = Array.from(
      new Map(
        patients.map((patient) => [
          patient.record_id,
          patient,
        ])
      ).values()
    );

    // Sort by UIC
    uniquePatients.sort((a, b) =>
      a.uic.localeCompare(b.uic, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );

    return NextResponse.json(uniquePatients);
  } catch (error) {
    console.error("REDCap patient export error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load patients from REDCap.",
      },
      { status: 500 }
    );
  }
}
