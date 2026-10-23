# Safeguards and operational rules

A reference for rules that are easy to forget when changing the application.
Reviewed against the `notification` branch on 23 October 2026. These describe
implemented behavior, including its limits; they are not guarantees about
browser delivery or operations outside the app. Keep this file updated when
changing a rule, together with its source and regression tests.

## Before testing on the live host

- Use the **Send test notification** button for a device-only sample without
  patient data. It intentionally bypasses arrival preferences and date filtering.
- An arrival on a queue date other than Mauritius today is suppressed. An
  exercise dated **today** can send real notifications. There is no separate
  “training mode” switch implemented.
- A non-today queue date suppresses push only. It does **not** turn the workflow
  into a sandbox: patient-code saves, no-show actions, clinical submissions or
  other REDCap writes can still affect the configured project.
- `npm run notifications:worker -- --once` is **not a dry run**: it processes
  eligible real arrivals and can send real alerts.
- Use a separate development REDCap project and SQLite database for data-write
  testing. A different date alone is not isolation.

## N1 — Only today's actual arrivals may push

**Purpose:** avoid alerting staff during exercises on historical/future queues.

All three dates must match, using **Indian/Mauritius**, not UTC or the Mac's
configured timezone:

```text
queue entry date = arrival event date = sender's current date
```

The sender checks this on every processing cycle, including retries. The
selected queue date is stored on the queue entry; the worker uses that stored
value, not whichever date another staff member currently has open.

| Scenario | Eligible by date? | Reason |
| --- | --- | --- |
| Today is 24 Oct; arrive on the 24 Oct queue today | Yes | All three dates match |
| Today is 24 Oct; exercise on the 23 Oct queue | No | Historical queue |
| Today is 24 Oct; exercise on the 25 Oct queue | No | Future queue |
| Arrive on 23 Oct; a retry runs just after midnight on 24 Oct | No | Sender date no longer matches |
| Exercise on the 24 Oct queue late on 23 Oct; retry runs after midnight | No | Arrival event happened on the wrong date |
| At 20:00 UTC on 23 Oct, arrive on the 24 Oct queue | Yes | Mauritius has already reached 24 Oct |

“Yes” here means the date check passes; all other delivery checks still apply.
Today-dated exercises are indistinguishable from live arrivals by this rule.

**Source:** [notification-sender.mjs](../lib/notification-sender.mjs),
`isLiveArrivalDate()` and `sendArrivalNotifications()`.
**Check:** `npm run test:notifications` covers past/future queues and the
Mauritius midnight boundary. Update those cases before changing the date rule.

## N2 — Arrival events only, not general queue edits

Only `ARRIVED` and `WALK_IN_CHECKED_IN` events are candidates. Expected
appointments, editing notes and moving stations alone do not generate alerts.
An entry currently Expected, Done, Cancelled or marked no-show is skipped,
even if it has an earlier arrival event. Thus a visit finished before the
worker processes it may produce no notification.

**Purpose:** avoid repeated or obsolete alerts during ordinary workflow edits.
**Source:** [clinic-queue.ts](../lib/clinic-queue.ts) and
[notification-sender.mjs](../lib/notification-sender.mjs).
**Checks:** `test:clinic-queue`, `test:notifications`.

## N3 — Eligibility is checked when sending, not just at enrollment

Arrival recipients must currently be approved PILS users with Facility Staff,
Healthcare Assistant or Administrator among their saved roles. They also need:

- The account master switch and Clinic Queue arrival switch enabled.
- A registered device and its associated, unexpired login session.
- Device registration and preference activation no later than the arrival event.

Role/organisation/account changes can therefore stop future sends. Multiple
roles do not multiply alerts. Opting in later does not replay earlier arrivals.
Logout or the seven-day session expiry stops future sends for that sign-in;
enable the device again after a new login. Already delivered or in-flight
notifications cannot be recalled by revoking access.

**Source:** [notification-policy.mjs](../lib/notification-policy.mjs),
[notification-sender.mjs](../lib/notification-sender.mjs),
[notification API](../app/api/notifications/route.ts).
**Check:** `test:notifications` verifies roles, opt-out, session logout, access
revocation and activation times. Revisit policy/page parity if adding roles.

## N4 — Delivery is deduplicated and expires

A unique `(queueEntryId, subscriptionId)` delivery row and an atomic claim stop
ordinary repeated/concurrent sends. Resetting/re-arriving the same daily entry
on the same subscription does not create a second successful delivery. A new
queue entry on another date can notify again.

Transient failures retry with backoff, up to five attempts; 404/410 responses
remove unusable subscriptions. Arrival events expire after ten minutes. This
avoids hours-old alerts after an outage, at the cost of losing late delivery.
Delivery records are pruned after seven days.

A crash after the push provider accepts a message but before the database marks
it Sent can produce a retry. Stable provider topics and device notification tags
reduce duplicate presentation; they are not an exactly-once guarantee.

**Source:** [schema](../prisma/schema.prisma),
[notification-sender.mjs](../lib/notification-sender.mjs).
**Check:** `test:notifications` tests atomic claims, duplicates, retries and expiry.

## N5 — Name/code payload and explicit sample exception

Arrival payloads contain the patient's display name and code. A missing/blank
code is **Code pending** (translated for French/Creole subscriptions). Do not
block initial arrival delivery merely because file retrieval is incomplete.
There is no automatic follow-up push solely when a code is filled in later.

Payloads may appear on a phone's lock screen. The service worker never caches
patient pages or API responses. Tapping an arrival opens `/clinic-queue` and
still requires normal access. The sample button sends no patient information,
opens `/notifications`, and bypasses arrival category switches/date checks.

**Source:** [notification-policy.mjs](../lib/notification-policy.mjs),
[service worker](../public/notifications-sw.js),
[settings UI](../components/NotificationSettings.tsx).
**Checks:** `test:notifications` plus a real iPhone/Android sample notification.

## N6 — Device registration cannot be an arbitrary network destination

The API accepts HTTPS subscription endpoints only on recognised provider
hosts and validates the browser key shapes. It ties subscriptions to the
signed-in user/session, checks the POST Origin host, limits users to ten
devices, and only lets users unsubscribe their own endpoints.

**Purpose:** keep device setup from becoming an arbitrary server-side URL
request facility or a means to remove someone else's device. If a new browser
provider needs support, review its official endpoint domains before extending
the allowlist; do not remove endpoint validation to make registration work.

**Source:** [notification-policy.mjs](../lib/notification-policy.mjs),
[notification API](../app/api/notifications/route.ts).
**Check:** `test:notifications` includes invalid endpoints, authentication,
origin, category authorisation and unsubscribe ownership cases.

## Q1 — One persisted visit per enrolled client/date

The queue normalises record IDs and uses a database unique constraint on
`(recordId, queueDate)`. Creation handles competing/repeated requests by
returning the existing row where possible. Persisted rows suppress matching
virtual REDCap appointment rows in the combined queue.

**Purpose:** stop double-clicks, retries and scheduled/walk-in paths from
creating multiple visits for the same client/day. The migration that introduced
uniqueness archives duplicate rows and preserves their audit events. Do not
remove the index or bypass the helper to resolve a UI symptom.

**Source:** [clinic-queue.ts](../lib/clinic-queue.ts),
[uniqueness migration](../prisma/migrations/20261023120000_unique_daily_queue_client/migration.sql).
**Checks:** `test:queue-deduplication`, `test:clinic-queue`.

## Q2 — Verify the patient code before leaving file retrieval

For enrolled clients, use the existing REDCap code when present. A submitted
conflicting code is rejected. New codes are normalised and checked against
other clients; after import, a read-back must verify the save before the
queue advances. Only the code field is imported by this helper.

**Purpose:** avoid moving a client with an unsaved, mismatched or duplicate
patient code. Network failure is not proof a write failed: reload/retry through
the helper rather than directly overwriting the field.

**Limit:** the duplicate check is a read/check/write sequence against REDCap,
not a cross-system unique database constraint; do not assume it provides global
atomicity across independent app instances or external REDCap editors.

**Source:** [queue-patient-code.ts](../lib/queue-patient-code.ts),
[queue update API](../app/api/clinic-queue/[id]/route.ts).
**Check:** `test:queue-patient-code` verifies conflicts, one-field writes,
read-back and queue advancement failure behavior.

## Q3 — No-show operations preserve linked clinical visits

Only expected clients can be newly marked no-show. The helper reserves and
persists a particular clinic repeat instance before remote writes, so retries
can reuse it. Marking and undo act on that linked instance; they refuse to
alter a row with other clinical data or conflicting visit identity/state.
The write is verified in REDCap before completing the local transition.

**Purpose:** a no-show is not permission to overwrite an actual clinical visit.
Undo returns to Expected; a no-show must be returned before it can move normally.
Requests for the same entry are serialised inside one server process; that
in-memory lock is not a distributed lock for multiple server processes.

**Source:** [queue-no-show.ts](../lib/queue-no-show.ts).
**Check:** `test:queue-no-show` covers repeat-instance reuse, clinical-data
protection, double clicks, retries and undo. Review REDCap if protection rejects
an action; do not clear clinical fields to force the operation through.

## Q4 — Appointment retries and correct-client completion

Scheduling validates a real date from Mauritius today onward, supported service
type and existing client. A matching non-no-show clinic appointment for the
same service/date returns `alreadyScheduled`. New repeat instances account for
remote instances and reserved no-show instances, and imports are read back.
Per-client serialisation is local to the server process, not cluster-wide.

Queue completion also verifies that the queue entry belongs to the submitted
record before marking it Done. Do not complete an arbitrary selected row after
saving a different patient's workflow.

**Source:** [new-appointment.ts](../lib/new-appointment.ts),
[clinic-queue.ts](../lib/clinic-queue.ts), `completeQueueEntry()`.
**Checks:** `test:new-appointment`, `test:clinic-queue`.

## A1 — Organisation and field privacy are separate from navigation

Non-PILS saved administrator/multiple roles do not grant PILS workflow access.
Patient-list responses exclude clinical codes for external users. PILS lookup
still filters clinical and risk/violence instruments according to current roles;
a “partial lookup” link is not itself sufficient privacy protection.

**Branch caveat:** `main` commit `0917b51` additionally blocks non-PILS Logs
list/details. This branch has **not** incorporated it and still grants external
Logs access. Preserve the restriction when merging; do not mistake documentation
of intended behavior for enforcement in this branch.

**Source:** [auth.ts](../lib/auth.ts),
[organisation policy](../lib/organization-access.ts),
[lookup privacy](../lib/lookup-privacy.ts),
[patient API](../app/api/redcap/patients/route.ts).
**Checks:** `test:organization-access`, `test:lookup`. Update server guards,
navigation, descriptive role/page lists and denied-access tests together.

## O1 — Infrastructure and data are not rolled back by Git

- Switching branches does not switch SQLite, `.env.local`, REDCap, generated
  Prisma clients or installed launchd configurations. Stop affected services,
  install target dependencies, regenerate the client and review migrations.
- HTTPS requires a trusted certificate. Keep external TCP 80/443 forwarding to
  Caddy, not directly to Next.js. Caddy proxies to localhost:3000. Keep No-IP
  updates and hostname confirmation current.
- Keep VAPID keys permanent. Restoring a database with new push keys can leave
  saved subscriptions unusable; back up keys and data securely together.
- Never make a “backup” by copying only the main SQLite file while writers use
  WAL. Use SQLite's backup mechanism, or stop all writers consistently.
- The app boot service currently runs development mode. `HTTPS works` and
  `production deployment is configured` are different claims.

**Runbooks:** [app](../ops/launchd/README.md),
[HTTPS](../ops/caddy/README.md), [push](../ops/notifications/README.md).

## Troubleshooting: an arrival did not notify

Check in this order before changing code:

1. Was it a real arrival event, not just an Expected appointment or station edit?
2. Do queue date, event date and current date all match in Mauritius?
3. Is it under ten minutes old, still active, and not a no-show?
4. Was the account/category enabled and the device registered before the event?
5. Does the recipient still have the required PILS access and an active session?
6. Has that daily entry/subscription already been sent or exhausted its retries?
7. Is the worker running with the same database and permanent VAPID keys as the app?
8. Does the explicit sample reach that device? Check permission, Home Screen
   installation on iOS, connectivity and OS notification/Focus settings.

Do not log patient payloads or full subscription endpoints while debugging.
Use the temporary-database notification test for simulated date/retry cases.
