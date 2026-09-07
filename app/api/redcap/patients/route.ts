import { NextResponse } from "next/server";

const REDCAP_API_URL = process.env.REDCAP_API_URL;
const REDCAP_API_TOKEN = process.env.REDCAP_API_TOKEN;

type RedcapRow = {
  uic_ori?: string;
  uic?: string;
  name01?: string;
  surname?: string;
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
      "fields[1]": "uic",
      "fields[2]": "name01",
      "fields[3]": "surname",
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
      // Both the REDCap record ID and the displayed UIC are required.
      .filter(
        (row) =>
          String(row.uic_ori ?? "").trim() !== "" &&
          String(row.uic ?? "").trim() !== ""
      )

      // Ignore repeating-instrument rows
      .filter((row) => !row.redcap_repeat_instrument)

      // Convert REDCap field names into the format
      // expected by BreakfastAttendance.tsx
      .map((row) => ({
        record_id: String(row.uic_ori).trim(),
        uic: String(row.uic).trim(),
        display_name:
          [row.name01, row.surname]
            .filter(Boolean)
            .join(" ")
            .trim() || String(row.uic),
      }));

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
