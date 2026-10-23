# Mobile notifications

Implemented category: **Clinic Queue — patient arrivals**. Any approved user can
open `/notifications` and toggle their account preference. Only users whose
PILS roles grant Clinic Queue access can subscribe to the arrival category.
Multi-role users receive one alert per device per daily queue entry.

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
One-shot health checks are safe: delivery claims prevent concurrent sends.

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
