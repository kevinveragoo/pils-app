'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

type AttendanceReview = {
  date: string;
  attendees: Person[];
  rows: { record_id: string; uic: string; breakfast_date: string; breakfast_present: '0' | '1'; extra_servings: string }[];
};

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
  const [review, setReview] = useState<AttendanceReview | null>(null);
  const [saveError, setSaveError] = useState('');
  const [extraServings, setExtraServings] = useState<Record<string, string>>({});
  const reviewDialog = useRef<HTMLDialogElement>(null);
  const saving = useRef(false);

  const today = new Date().toLocaleDateString('en-CA');

  useEffect(() => {
    if (review && !reviewDialog.current?.open) {
      reviewDialog.current?.showModal();
    }
  }, [review]);

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

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || saving.current || people.length === 0) return;

    setMessage('');
    setSaveError('');
    setReview({
      date: today,
      attendees: people.filter((person) => attendance[person.record_id]),
      rows: people.map((person) => ({
        record_id: person.record_id,
        uic: person.uic,
        breakfast_date: today,
        breakfast_present: attendance[person.record_id] ? '1' : '0',
        extra_servings: attendance[person.record_id] ? (extraServings[`${today}:${person.record_id}`] ?? '0') : '0',
      })),
    });
  }

  function closeReview() {
    if (saving.current) return;
    reviewDialog.current?.close();
    setReview(null);
    setSaveError('');
  }

  async function saveAttendance() {
    if (!review || saving.current) return;
    if (review.rows.some((row) => !/^\d+$/.test(row.extra_servings) || !Number.isSafeInteger(Number(row.extra_servings)))) {
      setSaveError('Enter a whole number of extra servings, zero or more, for each attendee.');
      return;
    }
    saving.current = true;

    try {
      setSubmitting(true);
      setSaveError('');

      const response = await fetch('/api/redcap/breakfast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rows: review.rows.map((row) => ({ ...row, extra_servings: Number(row.extra_servings) })) }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || 'REDCap submission failed.');
      }

      setMessage(`Saved breakfast attendance for ${review.date}: ${review.attendees.length} attended.`);
      reviewDialog.current?.close();
      setReview(null);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save attendance.');
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className='attendance-page mx-auto max-w-6xl px-4 py-5 sm:p-6'>
      <form onSubmit={handleSubmit} className='space-y-5 sm:space-y-6'>
        {/* Header */}
        <div className='space-y-3'>
          <div>
            <h1 className='text-3xl font-bold tracking-tight sm:text-4xl'>Breakfast Attendance</h1>

            <p className='mt-2 text-sm text-muted-foreground'>{today}</p>
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
          <section className='attendance-card' aria-labelledby='not-attended-heading'>
            <div className='flex items-center justify-between border-b bg-muted/40 px-4 py-3'>
              <h2 id='not-attended-heading' className='font-semibold'>Not attended</h2>
              <span className='attendance-count'>{people.filter((person) => !attendance[person.record_id]).length}</span>
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

          <section className='attendance-card attendance-card-present' aria-labelledby='attended-heading'>
            <div className='flex items-center justify-between border-b bg-muted/40 px-4 py-3'>
              <h2 id='attended-heading' className='font-semibold'>Attended</h2>
              <span className='attendance-count'>{attendedPeople.length}</span>
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
      <dialog
        ref={reviewDialog}
        aria-labelledby='attendance-review-title'
        aria-describedby='attendance-review-description'
        onCancel={(event) => {
          event.preventDefault();
          closeReview();
        }}
        className='attendance-review fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-hidden border bg-card p-0 text-foreground'
      >
        {review && (
          <div className='flex max-h-[85dvh] flex-col'>
            <div className='border-b px-5 py-4'>
              <h2 id='attendance-review-title' className='text-lg font-semibold'>Review breakfast attendance</h2>
              <p id='attendance-review-description' className='mt-1 text-sm text-muted-foreground'>
                {review.date} · {review.attendees.length} attended. Select Save to send attendance to REDCap.
              </p>
            </div>
            <div className='min-h-0 overflow-y-auto px-5'>
              {review.attendees.length === 0 ? (
                <p className='py-6 text-sm text-muted-foreground'>No attendees selected.</p>
              ) : (
                <table className='w-full table-fixed text-left'>
                  <thead className='sticky top-0 bg-card text-sm text-muted-foreground'>
                    <tr className='border-b'>
                      <th scope='col' className='py-3 pr-3 font-medium'>Attendee</th>
                      <th scope='col' className='w-28 py-3 text-center font-medium'>Extra servings</th>
                    </tr>
                  </thead>
                  <tbody className='divide-y'>
                  {review.attendees.map((person) => (
                    <tr key={person.record_id}>
                      <td className='py-3 pr-3 align-middle'>
                      <p className='break-words text-sm text-muted-foreground'>{person.uic}</p>
                      <p className='break-words font-medium'>{person.display_name}</p>
                      </td>
                      <td className='py-3 align-middle'>
                        <Input
                          id={`extra-servings-${person.record_id}`}
                          aria-label={`Extra servings for ${person.display_name} (${person.uic})`}
                          type='number'
                          min={0}
                          step={1}
                          required
                          inputMode='numeric'
                          className='mx-auto w-20 text-center'
                          disabled={submitting}
                          value={review.rows.find((row) => row.record_id === person.record_id)?.extra_servings ?? '0'}
                          onChange={(event) => {
                            const value = event.target.value;
                            setExtraServings((current) => ({ ...current, [`${review.date}:${person.record_id}`]: value }));
                            setReview((current) => current && ({
                              ...current,
                              rows: current.rows.map((row) => row.record_id === person.record_id ? { ...row, extra_servings: value } : row),
                            }));
                            setSaveError('');
                          }}
                        />
                      </td>
                    </tr>
                  ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className='space-y-3 border-t px-5 py-4'>
              {saveError && <p role='alert' className='text-sm text-destructive'>{saveError}</p>}
              <div className='flex justify-end gap-2'>
                <Button type='button' variant='outline' onClick={closeReview} disabled={submitting}>Cancel</Button>
                <Button type='button' onClick={saveAttendance} disabled={submitting}>{submitting ? 'Saving...' : 'Save'}</Button>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </div>
  );
}
