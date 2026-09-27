This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## REDCap configuration

The app uses `REDCAP_API_URL` and `REDCAP_API_TOKEN` from `.env.local` for the cleaned-up project. Field names were checked against its API metadata on 27 September 2026 using `New-old_fields.csv` (new names in row 1, old names in row 2).

`lib/redcap-field-rules.json` holds the current validation rules. `scripts/fixtures/redcap-schema.json` holds the API schema used by the mocked submission tests. Refresh these snapshots when the REDCap schema changes.

Run `npm run test:redcap-fields` to check field names, instrument ownership, checkbox encoding, UIC generation, patient lookup, and dashboard aggregation without contacting REDCap or writing records. Historical sample-generation scripts target the original schema and are separate from the app runtime.

The home page redirects to `/outreach`. Breakfast remains at `/breakfast`; Breakfast and Dashboard navigation links are temporarily disabled.

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
