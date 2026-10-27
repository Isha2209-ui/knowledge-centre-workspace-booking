# Knowledge Centre Cabin / Workspace Booking System

React + TypeScript (Vite) frontend, Node + Express + TypeScript API, PostgreSQL via Prisma 7, JWT + bcrypt.

## Run on macOS

Requires Node 20+ (`node -v`) and Homebrew.

```bash
# 1. PostgreSQL (once)
brew install postgresql@16
brew services start postgresql@16
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"     # Intel Mac: /usr/local/opt/postgresql@16/bin
psql postgres -c "CREATE USER kc WITH PASSWORD kc SUPERUSER;" -c "CREATE DATABASE kcbooking OWNER kc;"

# 2. API (terminal 1) - installs deps, generates Prisma client, applies migration, seeds demo data
cd server
npm install
npm run setup
npm run dev                 # http://localhost:4000

# 3. Web app (terminal 2)
cd client
npm install
npm run dev                 # http://localhost:5173
```

Demo logins (password `Password123!`): `admin@muj.test`, `faculty@muj.test`, `student@muj.test`, `student2@muj.test`.

## Tests

With the API running (terminal 1): `cd server && npm test` (38 integration checks against the live API + DB).

## Config (`server/.env`)

`DATABASE_URL`, `JWT_SECRET`, `PORT`; optional `TZ_OFFSET_MIN` (default 330 = IST), `OPEN_HOUR` (8), `CLOSE_HOUR` (20).

## Design notes

- Double-booking is prevented by a PostgreSQL exclusion constraint (`Booking_no_overlap`, btree_gist) in `prisma/migrations/0001_init/migration.sql`, so simultaneous requests cannot both succeed.
- Use `npm run migrate` (`prisma migrate deploy`) to apply migrations. Do not use `prisma migrate dev`/`db push` - they may try to drop the exclusion constraint, which Prisma cannot model.
- Background job (every 60 s): releases no-shows 15 min after start, completes finished bookings, sends reminders 15 min before start.
- Emails are simulated: each notification is stored in-app and printed to the API console.
