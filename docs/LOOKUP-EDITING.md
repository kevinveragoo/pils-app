# Editing existing entries from Lookup

Lookup offers **Edit client details** for existing client enrollment details and **Edit entry** for each existing instrument entry. Appointment lookup remains a booking/review flow. The editor loads current REDCap metadata and raw values; choice codes are preserved and only changed fields are submitted. Identifiers, calculated/hidden/read-only fields, descriptive content and file uploads are excluded from editing.

PILS-only permissions are enforced on opening and saving, independently of button visibility:

| Role | Instruments |
| --- | --- |
| Administrator | All instruments with supported editable fields |
| Outreach Worker | Outreach Contact, Risk Assessment, Violence Disclosure |
| Healthcare Assistant | Client/Clinic Enrollment, Clinic Visit, PrEP Profile/Visit, Outreach Contact, Risk Assessment, Violence Disclosure, HIV Treatment Profile/Clinical Monitoring |
| Healthcare Navigator | HIV Care Support, HIV Treatment Profile, HIV Clinical Monitoring |
| Facility Staff | Client Enrollment, Breakfast |

Secondary roles combine permissions. External organisations cannot edit. Edit access never adds view access to restricted sections.

The API confirms the record, instrument, event and repeat instance exist; it never allocates instance numbers or auto-numbers a client. Empty non-repeating instruments cannot be initialized here. A version digest of the selected instrument's metadata and raw values rejects stale submissions. REDCap does not provide an atomic compare-and-swap operation, so this check cannot eliminate changes made in the short interval between the final read and import.

Only changed visible values are written. Explicitly cleared fields use REDCap's overwrite mode; checkbox changes write each configured option as 0/1. Hidden historical values and unrelated instruments are retained. Required newly revealed questions and modified required fields are checked, while unrelated legacy blanks do not block corrections.

Before import, `AuditLog` stores the actor, time, exact entry identity and before/after values as `LOOKUP_EDIT_PENDING`. Successful read-back verification changes the event to `LOOKUP_ENTRY_UPDATED`. An uncertain import or verification outcome becomes `LOOKUP_EDIT_REQUIRES_REVIEW`; the UI asks the user to reload rather than blindly retry. These audit details contain confidential record data and belong within the existing private application database. REDCap also keeps its own import audit trail.

Run `npm run test:lookup-edit`, `npm run test:lookup`, `npm run test:organization-access`, and `npm run test:localization`. Editing tests use synthetic records and make no live REDCap writes.
