# PILS application

PILS is a Next.js application for client enrollment, outreach, healthcare navigation, clinic workflows and queues, breakfast attendance, and REDCap reporting. Client and programme records remain in REDCap. Local users, sessions, activity logs, and clinic queue data are stored in SQLite through Prisma.

## Requirements

- Node.js 20.9 or newer
- npm
- Git
- A REDCap API URL and token for the cleaned PILS REDCap project

## Set up a new working copy

Clone the repository and enter its directory:

```powershell
git clone https://github.com/kevinveragoo/pils-app.git
cd pils-app
```

Run the complete local bootstrap:

```powershell
npm run setup:local
```

Stop any running PILS development server before running this command. On Windows, the server can lock native files that `npm ci` needs to replace.

This command:

1. Installs the exact dependencies in `package-lock.json` with `npm ci`.
2. Creates `.env.local` from `.env.example` if `.env.local` does not exist.
3. Generates the Prisma Client.
4. Creates or updates `data/pils.db` using all committed migrations.
5. Runs the idempotent database seed.

The setup command never replaces an existing `.env.local` and never resets an existing administrator.

## Configure REDCap

Open `.env.local` and replace the placeholder values:

```dotenv
REDCAP_API_URL=https://your-redcap.example/api/
REDCAP_API_TOKEN=replace-with-your-redcap-api-token
AUTH_COOKIE_SECURE=false
```

`REDCAP_API_URL` and `REDCAP_API_TOKEN` are required for REDCap lookups and submissions. Keep `AUTH_COOKIE_SECURE=false` for local HTTP development. Set it to `true` only when the application is served through HTTPS, otherwise the browser will not return the login cookie.

Do not commit `.env.local` or real REDCap credentials. Local environment files are ignored by Git.

## Start the application

```powershell
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

On a new database, use the temporary administrator account:

- Username: `kevin`
- Password: `admin`

The application requires this password to be changed at first sign-in.

## Update an existing working copy

After pulling changes, rerun the bootstrap command when dependencies or database migrations may have changed:

```powershell
git pull --ff-only
npm run setup:local
```

The migration and seed steps are safe to rerun. Existing account passwords and data are retained.

If dependencies are already installed and only the Prisma/database steps need to be rerun, use:

```powershell
npm run setup:local -- --skip-install
```

## Database commands

The local SQLite database is `data/pils.db`. It and its WAL/SHM sidecar files are intentionally ignored by Git.

```powershell
npm run db:generate  # Generate Prisma Client after schema/dependency changes
npm run db:migrate   # Apply committed migrations
npm run db:seed      # Create the initial admin only when it does not exist
```

To create a completely new development database, stop the development server, move `data/pils.db` and any `data/pils.db-*` sidecars to a backup location, then run `npm run setup:local`. Do not delete or replace a database containing data you need.

Back up a database while the application is stopped, or use SQLite's `.backup` command while it is running. Keep backups outside the repository. A restore needs both the database file and application code containing the matching `prisma/migrations` history.

## Checks

```powershell
npm run lint
npm run build
npm run test:redcap-fields
npm run test:localization
```

The REDCap field tests use committed fixtures and do not contact REDCap or write records. When the REDCap schema changes, refresh `lib/redcap-field-rules.json` and `scripts/fixtures/redcap-schema.json` before updating the tests.

## Localization

English is the fallback language. French and Mauritian Creole use the identifiers `fr` and `mfe`. Translations live in:

- `locales/en.lproj/Localizable.strings`
- `locales/fr.lproj/Localizable.strings`
- `locales/mfe.lproj/Localizable.strings`

Keep the same keys in all three catalogs and run `npm run test:localization` after editing them.
