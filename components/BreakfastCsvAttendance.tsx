'use client';

import { useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type RedcapPatient = { alias: string; uic: string; record_id: string; first_name: string; last_name: string; display_name: string };
type UploadedClient = { alias: string; uic: string; record_id?: string; suggestions?: RedcapPatient[] };

function partialUicKey(uic: string) { return `${uic.charAt(0).toUpperCase()}${uic.replace(/\D/g, '')}`; }

function parseCsv(text: string) {
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') { if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; } else quoted = !quoted; }
    else if (character === ',' && !quoted) { row.push(cell.trim()); cell = ''; }
    else if ((character === '\n' || character === '\r') && !quoted) { if (character === '\r' && text[index + 1] === '\n') index += 1; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; }
    else cell += character;
  }
  if (quoted) throw new Error('The CSV contains an unclosed quoted value.');
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); return rows;
}

function clientsFromCsv(text: string): UploadedClient[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ''));
  if (!rows.length) throw new Error('The CSV file is empty.');
  const headings = rows[0].map((heading) => heading.trim().toLowerCase());
  if (headings[0] !== 'alias' || headings[1] !== 'uic') throw new Error('The first two CSV columns must be alias and uic, in that order.');
  const seen = new Set<string>();
  const clients = rows.slice(1).map((values, index) => {
    const alias = values[0]?.trim() ?? ''; const uic = (values[1] ?? '').replace(/\s+/g, '').replace(/-/g, '_').toUpperCase();
    if (!uic) throw new Error(`Row ${index + 2} has no UIC.`);
    if (seen.has(uic)) throw new Error(`UIC ${uic} appears more than once in the CSV.`);
    seen.add(uic); return { alias, uic };
  });
  if (!clients.length) throw new Error('The CSV does not contain any client rows.');
  return clients;
}

function ClientTable({ title, clients, emptyMessage, found, onSuggestion }: { title: string; clients: UploadedClient[]; emptyMessage: string; found?: boolean; onSuggestion?: (client: UploadedClient, patient: RedcapPatient) => void }) {
  return <section className={cn('attendance-card', found && 'attendance-card-present')} aria-label={title}><div className='flex items-center justify-between border-b bg-muted/40 px-4 py-3'><h2 className='font-semibold'>{title}</h2><span className='attendance-count'>{clients.length}</span></div>{clients.length === 0 ? <p className='px-4 py-10 text-center text-sm text-muted-foreground'>{emptyMessage}</p> : <div className='overflow-x-auto'><table className='w-full text-left text-sm'><thead className='border-b bg-muted/20 text-muted-foreground'><tr><th className='px-4 py-3 font-medium'>Alias</th><th className='px-4 py-3 font-medium'>UIC</th></tr></thead><tbody className='divide-y'>{clients.map((client) => <tr key={client.uic}><td className='px-4 py-3 font-medium'>{client.alias || '—'}</td><td className='px-4 py-3'><span className='font-mono'>{client.uic}</span>{client.suggestions?.map((patient) => <button key={patient.record_id} type='button' className='mt-2 block rounded-lg bg-secondary px-3 py-2 text-left text-xs font-medium text-secondary-foreground hover:bg-primary hover:text-primary-foreground' onClick={() => onSuggestion?.(client, patient)}>Could be {patient.last_name || '—'}, {patient.first_name || patient.display_name} · <span className='font-mono'>{patient.uic}</span></button>)}</td></tr>)}</tbody></table></div>}</section>;
}

export default function BreakfastCsvAttendance() {
  const [fileName, setFileName] = useState(''); const [found, setFound] = useState<UploadedClient[]>([]); const [unfound, setUnfound] = useState<UploadedClient[]>([]);
  const [busy, setBusy] = useState<'checking' | 'creating' | 'submitting' | null>(null); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null); const today = new Date().toLocaleDateString('en-CA');

  async function upload(file: File | undefined) {
    if (!file) return; setBusy('checking'); setError(''); setMessage(''); setFound([]); setUnfound([]);
    try {
      const uploaded = clientsFromCsv(await file.text()); const response = await fetch('/api/redcap/patients', { cache: 'no-store' }); const body: unknown = await response.json();
      if (!response.ok) throw new Error(body && typeof body === 'object' && 'error' in body ? String(body.error) : 'Unable to check UICs in REDCap.');
      const patients = body as RedcapPatient[]; const records = new Map(patients.map((patient) => [patient.uic.toUpperCase(), patient])); const partialMatches = new Map<string, RedcapPatient[]>();
      patients.forEach((patient) => { const key = partialUicKey(patient.uic); partialMatches.set(key, [...(partialMatches.get(key) ?? []), patient]); });
      setFound(uploaded.filter((client) => records.has(client.uic)).map((client) => ({ ...client, record_id: records.get(client.uic)?.record_id })));
      setUnfound(uploaded.filter((client) => !records.has(client.uic)).map((client) => ({ ...client, suggestions: partialMatches.get(partialUicKey(client.uic)) ?? [] })));
      setFileName(file.name); setMessage(`Checked ${uploaded.length} UIC${uploaded.length === 1 ? '' : 's'} against REDCap.`);
    } catch (caught) { setFileName(''); setError(caught instanceof Error ? caught.message : 'Unable to read the CSV file.'); if (inputRef.current) inputRef.current.value = ''; }
    finally { setBusy(null); }
  }

  function useSuggestedUic(client: UploadedClient, patient: RedcapPatient) {
    if (found.some((item) => item.record_id === patient.record_id)) { setError(`${patient.uic} is already in the found UICs table.`); return; }
    setError(''); setUnfound((current) => current.filter((item) => item.uic !== client.uic)); setFound((current) => [...current, { alias: client.alias, uic: patient.uic, record_id: patient.record_id }]); setMessage(`Using REDCap UIC ${patient.uic} for ${client.alias || client.uic}.`);
  }

  async function createSkeletons() {
    if (!unfound.length) return; setBusy('creating'); setError(''); setMessage('');
    try { const response = await fetch('/api/redcap/breakfast/skeletons', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clients: unfound }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Unable to create skeleton records.'); const created = unfound.map((client) => ({ ...client, record_id: client.uic })); setFound((current) => [...current, ...created]); setUnfound([]); setMessage(`Created ${created.length} skeleton record${created.length === 1 ? '' : 's'} in REDCap.`); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to create skeleton records.'); } finally { setBusy(null); }
  }

  async function submitAttendance() {
    if (!found.length || unfound.length) return; setBusy('submitting'); setError(''); setMessage('');
    try { const rows = found.map((client) => ({ record_id: client.record_id ?? client.uic, uic: client.uic, breakfast_date: today, breakfast_present: '1', extra_servings: 0 })); const response = await fetch('/api/redcap/breakfast', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Unable to submit breakfast attendance.'); setMessage(`Submitted breakfast attendance for ${found.length} client${found.length === 1 ? '' : 's'} on ${today}.`); setFound([]); setUnfound([]); setFileName(''); if (inputRef.current) inputRef.current.value = ''; }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to submit breakfast attendance.'); } finally { setBusy(null); }
  }

  return <div className='attendance-page mx-auto max-w-6xl px-4 py-5 sm:p-6'><div className='space-y-6'><div><h1 className='text-3xl font-bold tracking-tight sm:text-4xl'>Breakfast Attendance</h1><p className='mt-2 text-sm text-muted-foreground'>{today}</p></div><div className='rounded-2xl border bg-card p-4 shadow-sm sm:p-5'><h2 className='font-semibold'>Upload today&apos;s attendance</h2><p className='mt-1 text-sm text-muted-foreground'>Choose a CSV whose first two columns are <strong>alias</strong> and <strong>uic</strong>.</p><div className='mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center'><label className={cn(buttonVariants({ size: 'lg' }), 'min-h-11 cursor-pointer rounded-full px-5')}><FileUp aria-hidden='true' />{busy === 'checking' ? 'Checking UICs…' : 'Upload CSV file'}<input ref={inputRef} type='file' accept='.csv,text/csv' className='sr-only' disabled={busy !== null} onChange={(event) => void upload(event.target.files?.[0])} /></label>{fileName && <span className='text-sm text-muted-foreground'>{fileName}</span>}</div></div>{(message || error) && <p role='status' aria-live='polite' className={cn('rounded-xl px-4 py-3 text-sm', error ? 'bg-destructive/10 text-destructive' : 'bg-secondary text-secondary-foreground')}>{error || message}</p>}<div className='grid gap-4 md:grid-cols-2'><ClientTable title='UICs not found in REDCap' clients={unfound} emptyMessage={fileName ? 'All uploaded UICs were found.' : 'Upload a CSV to check its UICs.'} onSuggestion={useSuggestedUic} /><ClientTable title='UICs found in REDCap' clients={found} emptyMessage={fileName ? 'No uploaded UICs were found.' : 'Upload a CSV to check its UICs.'} found /></div><div className='flex flex-col gap-3 sm:flex-row'><Button type='button' size='lg' variant='outline' disabled={!unfound.length || busy !== null} onClick={() => void createSkeletons()}>{busy === 'creating' ? 'Creating skeleton records in REDCap…' : 'Create skeleton records for unfound UICs in REDCap'}</Button><Button type='button' size='lg' disabled={!found.length || unfound.length > 0 || busy !== null} onClick={() => void submitAttendance()}>{busy === 'submitting' ? 'Submitting attendance to REDCap…' : 'Submit attendance to REDCap'}</Button></div></div></div>;
}
