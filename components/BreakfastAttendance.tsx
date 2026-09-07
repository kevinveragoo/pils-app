'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';

type Person = {
  record_id: string;
  uic: string;
  display_name: string;
};

type AttendanceMap = Record<string, boolean>;

const PEOPLE_STORAGE_KEY = 'pils:breakfast:people';

function attendanceStorageKey(date: string) {
  return `pils:breakfast:attendance:${date}`;
}

function attendanceOrderStorageKey(date: string) {
  return `pils:breakfast:attendance-order:${date}`;
}

function readStoredPeople(): Person[] {
  try {
    const value = localStorage.getItem(PEOPLE_STORAGE_KEY);

    if (!value) return [];

    const parsed: unknown = JSON.parse(value);

    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (person): person is Person =>
        typeof person === 'object' &&
        person !== null &&
        typeof person.record_id === 'string' &&
        typeof person.uic === 'string' &&
        typeof person.display_name === 'string',
    );
  } catch {
    return [];
  }
}

function readStoredAttendance(date: string): AttendanceMap {
  try {
    const value = localStorage.getItem(attendanceStorageKey(date));

    if (!value) return {};

    const parsed: unknown = JSON.parse(value);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
  } catch {
    return {};
  }
}

function readStoredAttendanceOrder(date: string): string[] {
  try {
    const value = localStorage.getItem(attendanceOrderStorageKey(date));

    if (!value) return [];

    const parsed: unknown = JSON.parse(value);

    return Array.isArray(parsed) ? parsed.filter((recordId): recordId is string => typeof recordId === 'string') : [];
  } catch {
    return [];
  }
}

function storePeople(people: Person[]) {
  try {
    localStorage.setItem(PEOPLE_STORAGE_KEY, JSON.stringify(people));
  } catch {
    // The live REDCap response still works when browser storage is unavailable.
  }
}

function storeAttendance(date: string, attendance: AttendanceMap) {
  try {
    localStorage.setItem(attendanceStorageKey(date), JSON.stringify(attendance));
  } catch {
    // Attendance remains available for the current session in React state.
  }
}

function storeAttendanceOrder(date: string, recordIds: string[]) {
  try {
    localStorage.setItem(attendanceOrderStorageKey(date), JSON.stringify(recordIds));
  } catch {
    // Check-in order remains available for the current session in React state.
  }
}

export default function BreakfastAttendance() {
  const [people, setPeople] = useState<Person[]>([]);
  const [attendance, setAttendance] = useState<AttendanceMap>({});
  const [attendanceOrder, setAttendanceOrder] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const today = new Date().toLocaleDateString('en-CA');

  useEffect(() => {
    const storedPeople = readStoredPeople();
    const storedAttendance = readStoredAttendance(today);
    const storedAttendanceOrder = readStoredAttendanceOrder(today);
    let cancelled = false;
    let refreshInProgress = false;

    if (storedPeople.length > 0) {
      queueMicrotask(() => {
        if (cancelled) return;

        setPeople(storedPeople);
        setAttendance(Object.fromEntries(storedPeople.map((person) => [person.record_id, storedAttendance[person.record_id] ?? false])));
        setAttendanceOrder([
          ...storedAttendanceOrder.filter((recordId) => storedAttendance[recordId] && storedPeople.some((person) => person.record_id === recordId)),
          ...storedPeople.filter((person) => storedAttendance[person.record_id] && !storedAttendanceOrder.includes(person.record_id)).map((person) => person.record_id),
        ]);
        setLoading(false);
      });
    }

    async function refreshPeople(showError: boolean) {
      if (refreshInProgress) return;

      refreshInProgress = true;

      try {
        if (showError) setMessage('');

        const response = await fetch('/api/redcap/patients', {
          cache: 'no-store',
        });

        const body = await response.json();

        if (!response.ok) {
          throw new Error(body.error || 'Unable to load patients.');
        }

        if (cancelled) return;

        const patients = body as Person[];

        setPeople(patients);
        storePeople(patients);
        setAttendance((current) => {
          const updated = Object.fromEntries(patients.map((person) => [person.record_id, current[person.record_id] ?? storedAttendance[person.record_id] ?? false]));

          storeAttendance(today, updated);
          return updated;
        });
        setAttendanceOrder((current) => {
          const patientIds = new Set(patients.map((person) => person.record_id));
          const updated = current.filter((recordId) => patientIds.has(recordId));

          storeAttendanceOrder(today, updated);
          return updated;
        });
      } catch (error) {
        if (showError && !cancelled) {
          const errorMessage = error instanceof Error ? error.message : 'Unable to load patients.';
          setMessage(storedPeople.length > 0 ? `Showing saved patients. ${errorMessage}` : errorMessage);
        }
      } finally {
        refreshInProgress = false;
        if (showError && !cancelled) setLoading(false);
      }
    }

    void refreshPeople(true);

    const refreshInterval = window.setInterval(() => {
      void refreshPeople(false);
    }, 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
    };
  }, [today]);

  const unattendedPeople = useMemo(() => {
    const query = search.trim().toLowerCase();
    const unattended = people.filter((person) => !attendance[person.record_id]);

    if (!query) {
      return unattended;
    }

    return unattended.filter((person) => person.uic.toLowerCase().startsWith(query) || person.display_name.toLowerCase().includes(query));
  }, [attendance, people, search]);

  const attendedPeople = useMemo(() => {
    const peopleById = new Map(people.map((person) => [person.record_id, person]));

    return attendanceOrder
      .map((recordId) => peopleById.get(recordId))
      .filter((person): person is Person => person !== undefined)
      .filter((person) => attendance[person.record_id]);
  }, [attendance, attendanceOrder, people]);

  function toggleAttendance(recordId: string, checked: boolean) {
    setAttendance((current) => {
      const updated = {
        ...current,
        [recordId]: checked,
      };

      storeAttendance(today, updated);
      return updated;
    });

    setAttendanceOrder((current) => {
      const updated = checked ? (current.includes(recordId) ? current : [...current, recordId]) : current.filter((currentRecordId) => currentRecordId !== recordId);

      storeAttendanceOrder(today, updated);
      return updated;
    });

    // Clear UIC search when someone is marked present
    if (checked) {
      setSearch('');
    }
  }

  function resetAttendance() {
    const reset = Object.fromEntries(people.map((person) => [person.record_id, false]));

    setAttendance(reset);
    storeAttendance(today, reset);
    setAttendanceOrder([]);
    storeAttendanceOrder(today, []);

    setSearch('');
    setMessage('');
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setSubmitting(true);
      setMessage('');

      const rows = people.map((person) => ({
        record_id: person.record_id,
        uic: person.uic,
        breakfast_date: today,
        breakfast_present: attendance[person.record_id] ? '1' : '0',
      }));

      const response = await fetch('/api/redcap/breakfast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rows }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'REDCap submission failed.');
      }

      setMessage(`Saved breakfast attendance for ${rows.length} patients.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save attendance.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className='mx-auto max-w-6xl px-4 py-5 sm:p-6'>
      <form onSubmit={handleSubmit} className='space-y-5 sm:space-y-6'>
        {/* Header */}
        <div className='space-y-3'>
          <div>
            <h1 className='text-2xl font-semibold'>Breakfast Attendance</h1>

            <p className='text-sm text-muted-foreground'>{today}</p>
          </div>

          {/* Submit */}
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4'>
            <Button type='submit' className='w-full sm:w-auto' disabled={loading || submitting || people.length === 0}>
              {submitting ? 'Saving...' : 'Submit Attendance'}
            </Button>

            {message && (
              <p aria-live='polite' className='text-sm text-muted-foreground'>
                {message}
              </p>
            )}
          </div>
        </div>

        {/* Search + Reset */}
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
          <div className='relative w-full sm:max-w-sm'>
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder='Search by UIC or name...' className='pr-10' />

            {search && (
              <button type='button' onClick={() => setSearch('')} className='absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground' aria-label='Clear search'>
                <X className='h-4 w-4' />
              </button>
            )}
          </div>

          <Button type='button' variant='outline' className='w-full sm:w-auto' onClick={resetAttendance} disabled={loading || people.length === 0}>
            Reset Attendance
          </Button>
        </div>

        <div className='grid gap-4 md:grid-cols-2'>
          <section className='overflow-hidden rounded-md border' aria-labelledby='not-attended-heading'>
            <div className='flex items-center justify-between border-b bg-muted/40 px-4 py-3'>
              <h2 id='not-attended-heading' className='font-semibold'>Not attended</h2>
              <span className='text-sm text-muted-foreground'>{people.filter((person) => !attendance[person.record_id]).length}</span>
            </div>

            {loading ? (
              <p className='px-4 py-10 text-center text-sm text-muted-foreground'>Loading patients...</p>
            ) : unattendedPeople.length === 0 ? (
              <p className='px-4 py-10 text-center text-sm text-muted-foreground'>{search ? 'No patients found.' : 'Everyone has attended.'}</p>
            ) : (
              <div className='divide-y'>
                {unattendedPeople.map((person) => {
                  const checkboxId = `not-attended-${person.record_id}`;

                  return (
                    <label key={person.record_id} htmlFor={checkboxId} className='flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/40 active:bg-muted/60'>
                      <Checkbox id={checkboxId} className='size-5 border-2 border-foreground/60' checked={false} onCheckedChange={(checked) => toggleAttendance(person.record_id, checked === true)} aria-label={`Mark ${person.uic} as attended`} />
                      <span className='min-w-0 flex-1'>
                        <span className='block text-sm text-muted-foreground'>{person.uic}</span>
                        <span className='block truncate font-medium'>{person.display_name}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>

          <section className='overflow-hidden rounded-md border' aria-labelledby='attended-heading'>
            <div className='flex items-center justify-between border-b bg-muted/40 px-4 py-3'>
              <h2 id='attended-heading' className='font-semibold'>Attended</h2>
              <span className='text-sm text-muted-foreground'>{attendedPeople.length}</span>
            </div>

            {attendedPeople.length === 0 ? (
              <p className='px-4 py-10 text-center text-sm text-muted-foreground'>No attendees yet.</p>
            ) : (
              <div className='divide-y'>
                {attendedPeople.map((person) => {
                  const checkboxId = `attended-${person.record_id}`;

                  return (
                    <label key={person.record_id} htmlFor={checkboxId} className='flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/40 active:bg-muted/60'>
                      <Checkbox id={checkboxId} className='size-5 border-2 border-foreground/60' checked onCheckedChange={(checked) => toggleAttendance(person.record_id, checked === true)} aria-label={`Mark ${person.uic} as not attended`} />
                      <span className='min-w-0 flex-1'>
                        <span className='block text-sm text-muted-foreground'>{person.uic}</span>
                        <span className='block truncate font-medium'>{person.display_name}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </form>
    </div>
  );
}
