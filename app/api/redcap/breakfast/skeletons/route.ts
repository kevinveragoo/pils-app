import { NextResponse } from 'next/server';
import { getCurrentUser, hasAnyRole } from '@/lib/auth';

const REDCAP_API_URL = process.env.REDCAP_API_URL;
const REDCAP_API_TOKEN = process.env.REDCAP_API_TOKEN;
type Client = { alias: string; uic: string };
type RedcapRow = { uic_ori?: string };
const genderCodes: Record<string, string> = { M: '1', F: '2', T: '3', O: '5', R: '9' };

function parseClient(value: unknown): (Client & { enrollment: Record<string, string> }) | null {
  if (!value || typeof value !== 'object') return null;
  const input = value as Record<string, unknown>;
  if (typeof input.alias !== 'string' || typeof input.uic !== 'string') return null;
  const alias = input.alias.trim(); const uic = input.uic.trim().toUpperCase();
  const match = uic.match(/^([MFTOR])(\d{2})(\d{2})(\d{4})([A-Z])([A-Z]*)_([A-Z]+)$/);
  if (!match) return null;
  const [, gender, day, month, year, firstName, middleNames, surname] = match;
  const dob = `${year}-${month}-${day}`; const date = new Date(`${dob}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dob) return null;
  return { alias, uic, enrollment: { uic_ori: uic, ce_alias: alias, ce_gender_identity: genderCodes[gender], ce_dob: dob, ce_first_name: firstName, ...(middleNames ? { ce_middle_name_1: middleNames } : {}), ce_last_name: surname } };
}

async function redcap(params: Record<string, string>) {
  if (!REDCAP_API_URL || !REDCAP_API_TOKEN) throw new Error('REDCap API configuration is missing.');
  const response = await fetch(REDCAP_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: REDCAP_API_TOKEN, ...params }), cache: 'no-store' });
  const text = await response.text(); let result: unknown = text;
  try { result = JSON.parse(text); } catch { /* REDCap can return plain text. */ }
  if (!response.ok || (result && typeof result === 'object' && 'error' in result)) throw new Error(result && typeof result === 'object' && 'error' in result ? String((result as { error: unknown }).error) : text || `REDCap returned HTTP ${response.status}.`);
  return result;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!hasAnyRole(user, ['FACILITY_STAFF', 'ADMIN'])) return NextResponse.json({ error: 'Facility Staff access required.' }, { status: 403 });
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'The request body must be valid JSON.' }, { status: 400 }); }
  const values = body && typeof body === 'object' && 'clients' in body ? (body as { clients?: unknown }).clients : null;
  if (!Array.isArray(values) || !values.length) return NextResponse.json({ error: 'No clients were supplied.' }, { status: 400 });
  const clients = values.map(parseClient);
  if (clients.some((client) => !client)) return NextResponse.json({ error: 'Every UIC must use gender + DDMMYYYY + name initials + underscore + surname format, and contain a valid date.' }, { status: 400 });
  const parsed = clients as NonNullable<(typeof clients)[number]>[];
  if (new Set(parsed.map((client) => client.uic)).size !== parsed.length) return NextResponse.json({ error: 'Duplicate UICs were supplied.' }, { status: 400 });
  try {
    const existing = await redcap({ content: 'record', action: 'export', format: 'json', type: 'flat', rawOrLabel: 'raw', rawOrLabelHeaders: 'raw', exportDataAccessGroups: 'false', returnFormat: 'json', 'fields[0]': 'uic_ori' });
    const existingIds = new Set((Array.isArray(existing) ? existing as RedcapRow[] : []).map((row) => String(row.uic_ori ?? '').trim().toUpperCase()).filter(Boolean));
    const conflicts = parsed.filter((client) => existingIds.has(client.uic)).map((client) => client.uic);
    if (conflicts.length) return NextResponse.json({ error: `These UICs already exist in REDCap: ${conflicts.join(', ')}. Upload the CSV again to refresh the tables.` }, { status: 409 });
    const records = parsed.map((client) => client.enrollment);
    const result = await redcap({ content: 'record', action: 'import', format: 'json', type: 'flat', overwriteBehavior: 'normal', forceAutoNumber: 'false', dateFormat: 'YMD', data: JSON.stringify(records), returnContent: 'count', returnFormat: 'json' });
    return NextResponse.json({ success: true, created: records.length, result });
  } catch (error) {
    console.error('REDCap skeleton import error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create skeleton records in REDCap.' }, { status: 502 });
  }
}
