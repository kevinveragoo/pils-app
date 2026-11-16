# PILS work routines SOP

The current editable draft is [PILS-Work-Routines-SOP-v0.8.docx](PILS-Work-Routines-SOP-v0.8.docx).

- **Document ID:** PILS-SOP-001 (proposed)
- **Current version:** 0.8
- **Status:** Draft for review, not approved for operational use
- **Draft date:** 10 November 2026
- **Owner and approver:** To be assigned
- **Effective date and review date:** To be set at approval

The draft contains the cover, document control, role responsibilities and all nine supplied work routines, named in English followed by French:

1. Beneficiary Registration (Inscription des bénéficiaires)
2. Massage Parlour Outreach (Sortie salons de massage)
3. Testing Outreach (Sortie dépistage)
4. Beneficiary Accompaniment (Accompagnement des bénéficiaires)
5. Thursdays@Banian (Les jeudis à Banian)
6. Clinic Visit (Visite à la clinique)
7. New Clinic Appointment (Nouveau rendez-vous à la clinique)
8. Beneficiary Lookup (Recherche de bénéficiaires)
9. Data Entry Logs (Journal des saisies de données)

Each routine follows the reviewed cleaner layout: a By role line, App workflow, Required, As Applicable where needed, Procedure, and REDCap instruments affected. Required uses the rendered English app labels, including capitalization and punctuation; conditional fields are identified separately. App workflow names remain as displayed in the interface. Workflow and instrument mappings were checked against commit `d0df54f`; organization restrictions apply.

The earlier `PILS-Work-Routines-SOP.docx`, `PILS-Work-Routines-SOP-v0.2.docx` and `PILS-Work-Routines-SOP-v0.3.docx` are superseded drafts retained for reference. Make further edits in the 0.8 file only. Git versioning can replace separate draft files once the working master is agreed.

## Items to resolve during review

- The app has no separate Tester role; confirm the access/recording arrangement for other qualified testers.
- Outreach Workers can register through New client in Outreach Workflow, but standalone Client Enrollment currently requires Facility Staff or Administrator access. Confirm the route for registration without an outreach service.
- Lookup and Logs are PILS-only. Clinical and risk/violence lookup permissions differ by role, as described in WR08.
- Assign the document owner, approver, Thursday clinic handovers and escalation contacts. No app permissions or REDCap data were changed while drafting this document.

## Editing and approval

Edit the Word master and update its revision history. Confirm routine steps and REDCap instrument mappings before approval. Record the owner, approver, effective date and review date. Keep the Word master and its revision history in the same Git commit when revising it.

After approval, export a versioned PDF to `published/` for staff distribution. No approved PDF has been issued for this draft. Avoid keeping a separate Markdown copy of the manual's full text.

Use fictional examples and exclude patient information, API tokens and credentials. Rendering previews and other working files belong in the ignored `reports/sop-qa/` directory, not beside the manual.

## Design

The document uses the logo and crimson, burgundy and pale-pink palette from `public/pils-logo.svg` and `app/globals.css`, with an Office-safe sans-serif font for portability. Headers and footers identify the document and draft status. Word remains the editable master; the draft is not generated from this README.
