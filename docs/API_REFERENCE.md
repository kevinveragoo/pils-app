# HTTP API reference

Scope: the `notification` branch reviewed on 23 October 2026. These are internal
same-origin application endpoints, not a separately versioned public API.
Request types and detailed response shapes live in their linked handlers and
workflow components. See [developer guide](DEVELOPER_GUIDE.md) for data ownership,
authorisation semantics and branch differences.

## Conventions

- Workflow APIs authenticate using the `pils_session` cookie, not bearer tokens.
  The REDCap token remains on the server.
- JSON handlers generally return `{ "error": "..." }` on failure. Status usage
  is handler-specific: expect 401 for missing/expired authentication, 403 for
  denied access, and validation/conflict/upstream statuses as coded in each route.
- Page guards redirect; API handlers return responses. Test both paths.
- Dates are generally `YYYY-MM-DD`; queue “today” is Indian/Mauritius.
- No automatic retries of clinical POSTs unless the workflow explicitly
  supports them. A failed response does not prove that no upstream write occurred.
- `ADMIN` in the table means a PILS administrator. Non-PILS saved admin roles
  do not grant PILS-only workflow access.

## Endpoint index

| Endpoint | Methods | Purpose and access | Handler |
| --- | --- | --- | --- |
| `/api/clinic-queue` | GET, POST, DELETE | Read/add daily entries or clear a day's local queue; Facility Staff, Healthcare Assistant, Admin | [source](../app/api/clinic-queue/route.ts) |
| `/api/clinic-queue/[id]` | PATCH | Update status/station/tasks/notes, patient-code advancement, no-show operation; same queue roles | [source](../app/api/clinic-queue/[id]/route.ts) |
| `/api/notifications` | GET, POST | Settings, device opt-in/out and explicit sample push; signed-in users, with category eligibility enforced separately | [source](../app/api/notifications/route.ts) |
| `/api/locale` | POST | Save supported locale and redirect; form submission rather than JSON workflow API | [source](../app/api/locale/route.ts) |
| `/api/redcap/patients` | GET | Client selection data; signed-in users; clinical code excluded for external organisations | [source](../app/api/redcap/patients/route.ts) |
| `/api/redcap/client-enrollment` | GET, POST | Enrollment workflow; Facility Staff, Admin | [source](../app/api/redcap/client-enrollment/route.ts) |
| `/api/redcap/outreach` | GET, POST | Outreach workflow, including enrollment/contact data; signed-in users | [source](../app/api/redcap/outreach/route.ts) |
| `/api/redcap/healthcare-nav` | GET, POST | Navigator workflow; Healthcare Navigator, Admin | [source](../app/api/redcap/healthcare-nav/route.ts) |
| `/api/redcap/clinic` | GET, POST | Clinic workflow; Healthcare Assistant, Admin through `hasRole` | [source](../app/api/redcap/clinic/route.ts) |
| `/api/redcap/prep` | GET, POST | PrEP workflow; Healthcare Assistant, Admin | [source](../app/api/redcap/prep/route.ts) |
| `/api/redcap/appointments` | GET, POST | Daily appointment counts/scheduling; `appointmentRoles` | [source](../app/api/redcap/appointments/route.ts) |
| `/api/redcap/lookup` | GET | PILS-only read-only lookup; clinical and risk/violence sections filtered by role | [source](../app/api/redcap/lookup/route.ts) |
| `/api/redcap/dashboard` | GET | Aggregated reporting; Admin | [source](../app/api/redcap/dashboard/route.ts) |
| `/api/redcap/breakfast` | POST | Breakfast attendance submission; Facility Staff, Admin | [source](../app/api/redcap/breakfast/route.ts) |
| `/api/redcap/breakfast/skeletons` | POST | Breakfast enrollment skeleton operation; Facility Staff, Admin | [source](../app/api/redcap/breakfast/skeletons/route.ts) |

Export Index and `/api/export-index` were removed on this branch. Logs are
server-rendered pages (`/logs` and `/logs/details/[id]`) and have no dedicated
HTTP API route in this index. Account registration/login/admin changes are
server actions in [auth-actions.ts](../app/auth-actions.ts).

## Clinic queue contract notes

GET accepts `?date=YYYY-MM-DD`, defaulting to Mauritius today, and returns
virtual REDCap appointment rows combined with persisted queue entries. A
virtual row is not yet a local queue record.

POST requires an existing client record ID and display name, a date and service
selection. Walk-ins select a valid visit workflow and its relevant purposes.
Scheduled arrivals may enter `WAITING` at `FILE_RETRIEVAL`; walk-ins can enter
waiting at supported stations. Do not infer arrival from merely creating a row:
the handler/helper decides whether it starts `EXPECTED` or `WAITING`.
Successful creation returns 201; an existing same-client/date row returns 200
with `alreadyQueued`. See the handler for optional fields and routing defaults.

PATCH validates status/station/task enums. Before moving out of file retrieval
it saves/verifies the patient code. `noShow: true` delegates to the dedicated
no-show helper; reversing a no-show uses the return-to-Expected path. The
helper enforces clinical-data and repeat-instance protections.

DELETE clears the selected day's persisted queue entries, cascading their
queue events. It does not delete the underlying REDCap appointments, so virtual
expected rows can reappear. This is a destructive operation, not an example
request for a routine health check.

## Notification API

GET returns account master/category preferences, current arrival eligibility,
and the public VAPID key (or null), with `Cache-Control: no-store`.

POST takes JSON with an `action`:

| Action | Fields | Effect |
| --- | --- | --- |
| `preferences` | `enabled`, `clinicArrivals` booleans | Save account switches; enabling arrivals requires current Clinic Queue access |
| `subscribe` | `subscription` from `PushSubscription.toJSON()`, optional `locale` | Validate provider endpoint and keys; register against current user/session; maximum ten devices per user |
| `unsubscribe` | `endpoint` | Remove only an endpoint owned by the current user |
| `test` | `endpoint` | Send a sample to an owned device with an active associated session; no patient information |

POST checks the Origin host against the forwarded/current host. Enable/disable
from the app on its actual HTTPS origin rather than cross-origin tooling.
Only the public key is returned to clients; private keys are server-only.
Browser permission is requested by the user's explicit device-enable gesture.

Registration replaces the existing record for that endpoint, rather than
transferring its previous delivery history to another account. Account switches
affect arrival delivery across devices; browser permission/unsubscribe affects
the individual device. A device whose login expired must be enabled again.
The sample push is explicit and bypasses arrival preference/date filtering.

## Adding or changing an endpoint

1. Authenticate and enforce current organisation/roles before reading data.
2. Validate the request and allowed REDCap field set on the server.
3. Preserve field-level privacy in responses and repeat-instance identity on writes.
4. Return a response consistent with the existing workflow; keep sensitive values
   out of generic logs/errors.
5. Update the client, focused route tests, this index and relevant workflow docs.
6. Test denied requests and retry/conflict behavior, not only the successful path.
