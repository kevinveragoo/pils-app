This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## REDCap configuration

The app uses `REDCAP_API_URL` and `REDCAP_API_TOKEN` from `.env.local` for the cleaned-up project. Field names were last checked against its API metadata on 6 October 2026. PrEP data is split between the non-repeating `prep_treatment_profile` instrument (`ptp_` fields) and the repeating `prep_visit` instrument (`pv_` fields).

`lib/redcap-field-rules.json` holds the current validation rules. `scripts/fixtures/redcap-schema.json` holds the API schema used by the mocked submission tests. Refresh these snapshots when the REDCap schema changes.

Run `npm run test:redcap-fields` to check field names, instrument ownership, checkbox encoding, UIC generation, patient lookup, and dashboard aggregation without contacting REDCap or writing records. Historical sample-generation scripts target the original schema and are separate from the app runtime.

The home page redirects to `/outreach`. Breakfast remains at `/breakfast`; Breakfast and Dashboard navigation links are temporarily disabled.

## Local authentication database

Application users and sessions are stored in `data/pils.db` through Prisma. The database and SQLite WAL/SHM sidecar files are intentionally ignored by Git. REDCap remains the source of client and programme data.

After installing dependencies, prepare or update the database with:

```bash
npm run db:migrate
npm run db:seed
```

The seed is idempotent. On a new database it creates the original administrator with username `kevin` and temporary password `admin`; it never resets an existing account. The temporary password must be changed at first sign-in.

Back up the live database while the application is stopped, or use SQLite's `.backup` command while it is running. Keep the copied database outside the project checkout. Restoring requires the database file and a deployment containing the matching `prisma/migrations` history.

Set `AUTH_COOKIE_SECURE=true` once the site is served through HTTPS. Leave it unset while the current site is accessed over plain HTTP, otherwise browsers will not return the login cookie.

## Localization

English is the development language and fallback. French and Mauritian Creole use the ISO language identifiers `fr` and `mfe`. Following Apple's localized-resource layout, translations live in matching files under:

- `locales/en.lproj/Localizable.strings`
- `locales/fr.lproj/Localizable.strings`
- `locales/mfe.lproj/Localizable.strings`

Keep the same keys in all three catalogs and run `npm run test:localization` after editing them. The language picker stores the selected language in the `pils_locale` cookie; first-time visitors default to English.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
