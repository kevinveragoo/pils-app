import { NextResponse } from 'next/server';

const REDCAP_API_URL = process.env.REDCAP_API_URL;
const REDCAP_API_TOKEN = process.env.REDCAP_API_TOKEN;

type BreakfastRow = {
  record_id: string;
  uic: string;
  breakfast_date: string;
  breakfast_present: '0' | '1';
};

type ExistingBreakfastRow = {
  uic_ori?: string;
  breakfast_date?: string;
  redcap_repeat_instrument?: string;
  redcap_repeat_instance?: string;
};

function isBreakfastRow(value: unknown): value is BreakfastRow {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const row = value as Record<string, unknown>;

  return typeof row.record_id === 'string' && row.record_id.trim() !== '' && typeof row.uic === 'string' && row.uic.trim() !== '' && typeof row.breakfast_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.breakfast_date) && (row.breakfast_present === '0' || row.breakfast_present === '1');
}

export async function POST(request: Request) {
  if (!REDCAP_API_URL || !REDCAP_API_TOKEN) {
    return NextResponse.json({ error: 'REDCap API configuration is missing.' }, { status: 500 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'The request body must be valid JSON.' }, { status: 400 });
  }

  const rows = body && typeof body === 'object' && 'rows' in body ? (body as { rows?: unknown }).rows : undefined;

  if (!Array.isArray(rows) || rows.length === 0 || !rows.every(isBreakfastRow)) {
    return NextResponse.json({ error: 'No valid breakfast attendance rows were supplied.' }, { status: 400 });
  }

  try {
    const exportForm = new URLSearchParams({
      token: REDCAP_API_TOKEN,
      content: 'record',
      action: 'export',
      format: 'json',
      type: 'flat',
      rawOrLabel: 'raw',
      rawOrLabelHeaders: 'raw',
      exportDataAccessGroups: 'false',
      returnFormat: 'json',
      'fields[0]': 'uic_ori',
      'fields[1]': 'breakfast_date',
      'forms[0]': 'breakfast_attendance',
    });

    const existingResponse = await fetch(REDCAP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: exportForm,
      cache: 'no-store',
    });

    const existingText = await existingResponse.text();

    if (!existingResponse.ok) {
      throw new Error(existingText || `REDCap export returned HTTP ${existingResponse.status}.`);
    }

    const existingRows = JSON.parse(existingText) as ExistingBreakfastRow[];
    const instancesByRecord = new Map<string, Map<string, number>>();
    const maximumInstanceByRecord = new Map<string, number>();

    for (const existingRow of existingRows) {
      if (existingRow.redcap_repeat_instrument !== 'breakfast_attendance') {
        continue;
      }

      const recordId = String(existingRow.uic_ori ?? '').trim();
      const date = String(existingRow.breakfast_date ?? '').trim();
      const instance = Number(existingRow.redcap_repeat_instance);

      if (!recordId || !Number.isInteger(instance) || instance < 1) {
        continue;
      }

      maximumInstanceByRecord.set(recordId, Math.max(maximumInstanceByRecord.get(recordId) ?? 0, instance));

      if (date) {
        const dateInstances = instancesByRecord.get(recordId) ?? new Map();
        dateInstances.set(date, instance);
        instancesByRecord.set(recordId, dateInstances);
      }
    }

    const records = rows.map((row) => {
      const recordId = row.record_id.trim();
      const existingInstance = instancesByRecord.get(recordId)?.get(row.breakfast_date);
      const instance = existingInstance ?? (maximumInstanceByRecord.get(recordId) ?? 0) + 1;

      return {
        uic_ori: recordId,
        redcap_repeat_instrument: 'breakfast_attendance',
        redcap_repeat_instance: String(instance),
        breakfast_date: row.breakfast_date,
        breakfast_present: row.breakfast_present,
      };
    });

    const form = new URLSearchParams({
      token: REDCAP_API_TOKEN,
      content: 'record',
      action: 'import',
      format: 'json',
      type: 'flat',
      overwriteBehavior: 'normal',
      forceAutoNumber: 'false',
      data: JSON.stringify(records),
      returnContent: 'count',
      returnFormat: 'json',
    });

    const response = await fetch(REDCAP_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
      cache: 'no-store',
    });

    const text = await response.text();
    let result: unknown = text;

    if (text) {
      try {
        result = JSON.parse(text);
      } catch {
        // Some REDCap installations return plain text for API errors.
      }
    }

    if (!response.ok) {
      const error = result && typeof result === 'object' && 'error' in result ? String((result as { error: unknown }).error) : text || `REDCap returned HTTP ${response.status}.`;

      return NextResponse.json({ error }, { status: 502 });
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error('REDCap breakfast import error:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Unable to save breakfast attendance to REDCap.',
      },
      { status: 502 },
    );
  }
}
