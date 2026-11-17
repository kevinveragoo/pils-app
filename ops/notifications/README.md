# Mobile notifications

Implemented categories: **Clinic Queue — patient arrivals** and **Outreach — reactive HIV rapid test**. Any approved user can
open `/notifications` and toggle their account preference. Only users whose
PILS roles grant Clinic Queue access can subscribe to the arrival category.
Multi-role users receive one alert per device per daily queue entry.

All approved users whose organization is `PILS`, regardless of staff role, can
opt into **Outreach — reactive HIV rapid test**. `PILS_VOLUNTEER`, CUT, AILES,
and other organizations cannot subscribe. The new category is off by default.
After deploying this change, apply `npm run db:migrate`, regenerate Prisma,
and restart both the app and notification worker.

The outreach trigger is a successfully imported app outreach contact whose
`oc_hiv_rapid_result` is `1` (reactive). Its saved `RedcapActivity` entry is the
durable outbox; edits made directly in REDCap do not trigger it. If REDCap saves
but local activity logging fails, no alert can be queued; the existing
`activityLogged: false` response and server error identify this condition.
The contact date does not control delivery: recording a reactive result now
can alert even when its contact date is earlier.

Outreach push messages ask staff to review a result without including the
patient's identity or HIV result. Tapping opens the exact saved activity in
Logs, behind the existing PILS authentication/access checks. Delivery IDs use
a hash of record ID and outreach instance to deduplicate repeated activity
logs for the same contact. New outreach instances can notify again. The
existing session checks, opt-out, ten-minute expiry, retry limits, and device
activation checks also apply. Each category tracks its own activation time,
so opting into one does not replay old events or suppress the other category.

See [notification safeguards](../../docs/SAFEGUARDS.md#n1--only-todays-actual-arrivals-may-push)
for date examples, test-exercise limits and troubleshooting.

## Staff setup

1. Open https://eli3a.ddns.net. On iPhone/iPad (16.4+), add PILS to the Home
   Screen and open that installed app. Log in there (its session may differ
   from the browser tab).
2. Open Notifications from the navigation.
3. Enable account notifications and the Clinic Queue patient-arrival category.
4. Enable notifications on this device and allow the browser/OS permission.
5. Use Send test notification to verify the device. No patient data is used.

Alerts show the patient's display name and code, or “Code pending”. These
appear on lock screens according to OS settings. Tapping an arrival opens the
queue, with its normal login and page checks. Test alerts open settings.
Account preferences are shared across devices; device enable/disable is local.
Device registration is tied to its login session: logout/expiry stops future
sends. Re-enable the device after a new sign-in. Already delivered/in-flight
notifications cannot be recalled. Browser permission and Focus/battery/network
settings can delay or prevent delivery; the queue remains the source of truth.

## Server setup

```sh
npm ci
npm run db:generate
npm run db:migrate
node scripts/setup-notifications.mjs
bash scripts/install-notification-launchdaemon.sh
```

The last command needs the Mac administrator password. Paths in the plist
match this Mac Mini, like the existing app and Caddy services. The worker runs
as kevin at boot, restarts after exit, and reads `.env.local`. Keep the VAPID
key pair permanent and back it up securely; changing it requires devices to
unsubscribe/resubscribe. No private keys, push endpoints, or patient payloads
are printed in worker logs. The subject currently identifies the HTTPS site;
it may be changed to a monitored `mailto:` address. Restart the app after
Prisma generation or environment changes; restart the worker after code/key
changes. FileVault may require an initial unlock after a cold boot.

Check the worker:

```sh
sudo launchctl print system/mu.pils.notifications
tail -n 40 ~/Library/Logs/pils-app/notifications-error.log
npm run notifications:worker -- --once
```

Do not run an additional continuous worker when the boot service is active.
A one-shot run also uses delivery claims to prevent ordinary concurrent sends,
but it is not a dry run: eligible arrivals can produce real notifications.

## Delivery behavior

The existing transactional queue audit events form the durable outbox:
`ARRIVED` for Expected → Waiting, and `WALK_IN_CHECKED_IN` for entries created
already Waiting (including newly persisted scheduled arrivals). Merely adding
an Expected appointment or moving between stations does not trigger alerts.

The sender polls every three seconds. Only queue entries dated today in
Indian/Mauritius can notify, and their arrival event must also have occurred on
that queue date. Past/future date exercises never notify, including on retries
across midnight. Exercises dated today still count as live arrivals. It rechecks current user approval,
organisation, role access, preferences, and the associated active session
before each attempt. Devices/preferences activated after an event do not get
historical arrivals. Completed, cancelled, no-show and reset-to-Expected visits
are skipped. A unique delivery row per daily queue entry/device deduplicates
retries and repeated arrivals; a new queue date/entry can notify again.

Transient failures retry with backoff, up to five attempts; 404/410 endpoints
are removed. Arrival alerts expire after ten minutes to avoid sending stale
clinical alerts after an outage. Database delivery records are retained seven
days and contain no patient name/code. The service worker never caches pages,
patient data or API responses. Push delivery is at least once around a crash
after sending; stable Web Push topic and notification tags reduce duplicate
visible alerts, but cannot guarantee exactly-once OS presentation.

## Validation

`npm run test:notifications` uses a temporary SQLite database and mocked push
transport. It checks role/page parity, multi-role access, authentication,
origin validation, preference authorization, subscription ownership, endpoint
restrictions, duplicate/concurrent sends, retries, expiry, and logout. No real
patient records or push subscriptions are created by the tests.

After setup, perform a real iPhone and Android device test, followed by a
scheduled arrival and a walk-in. Confirm disabled categories/accounts/devices
receive no new alerts and a multi-role recipient gets only one alert per device.

## Outreach reactive HIV category

Approved PILS Outreach Workers, Healthcare Assistants and Admins can separately
opt in to **Outreach — reactive HIV result**. A successful Outreach save through
the app must contain `oc_hiv_rapid_result = 1` (Reactive). Its local REDCap activity
log is the durable outbox; failed REDCap saves and edits made directly in REDCap
do not produce an app activity and therefore do not notify. If local activity
logging fails, the successful clinical save is not retried automatically and no
alert is generated; the response's `activityLogged` indicates this condition.

The alert contains a generic follow-up message, with no patient name or HIV
result on the lock screen. Tapping it opens the signed-in Outreach workflow for
the saved client. Recipients must have an active device session and must have
enabled this category before the activity was recorded. Clinic arrival and
Outreach category preferences are independent. New devices do not get earlier
alerts. Deliveries deduplicate by REDCap record/contact repeat and device, retry
transient failures, expire after ten minutes and recheck access at each attempt.
A newly saved backdated contact can notify; old activity logs are not replayed.

Apply database migrations and regenerate Prisma before restarting the app and
notification worker. Existing accounts start with this category switched off.
`npm run test:outreach-notifications` uses a temporary database and mocked transport;
it never sends a real push notification.
