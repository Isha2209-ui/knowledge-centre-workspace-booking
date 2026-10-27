# PROJECT_STATUS

Last updated: 2026-10-24

## Completed (tested = automated API test or manual script against real PostgreSQL)
- Auth: register (student/faculty only), login, JWT sessions, bcrypt, forgot/reset password (token shown in dev) - tested
- Role-based access (student/faculty/admin) on all admin endpoints - tested
- Two seeded floors; admin can add/rename/close floors; cabins and chairs CRUD, maintenance blocking - tested (API)
- Availability search by window, floor, type, capacity; states AVAILABLE/BOOKED/BLACKED_OUT/MAINTENANCE - tested
- Booking create / reschedule / cancel; cannot modify after start - tested
- Atomic conflict prevention (DB exclusion constraint): 6 concurrent requests -> exactly 1 success - tested
- Booking rules per role (max duration, advance window, max active bookings) + opening hours - tested
- Blackouts (per space or whole floor) - tested
- Waitlist: join, position, notify next when slot freed - tested
- QR code generation; check-in success path and too-early rejection - tested
- No-show auto-release (maintenance job run manually once) - tested via script
- In-app notifications; emails simulated via console log
- Admin reports (utilisation per space, per day, top users), audit log, user role management - API tested
- Frontend (login, browse/book/waitlist, my bookings with QR/reschedule/cancel, notifications, 7 admin tabs): typechecks and builds; Vite proxy to API verified

## Test results
`server`: `npm test` -> 38 passed, 0 failed (run 2026-10-24, Linux sandbox, PostgreSQL 16).
Client: `tsc --noEmit` clean, `vite build` OK.

## Changed files
All files are new. Key: server/prisma/schema.prisma, server/prisma/migrations/0001_init/migration.sql, server/src/{booking,lib,app,index,seed,test}.ts, server/src/routes/*, client/src/{App,api}.tsx/ts, client/src/pages/*.

## Known issues / not verified
- UI was NOT exercised in a real browser (no browser in the build sandbox); only compiled and proxy-checked. Expect small visual/UX bugs.
- Migration SQL was hand-written (Prisma schema engine could not be downloaded in the sandbox) and applied with psql; `prisma generate` ran, `prisma migrate deploy` has not been run. Compare with `npx prisma migrate diff` if it errors on your Mac.
- Emails are console-only (no SMTP). Reminders/no-show job not tested on a long-running schedule.
- QR check-in is by pasting/scanning the token into the Check-in box; no camera scanner in the UI.
- Waitlist only notifies; the user must book manually. No admin edit of individual bookings.
- Times shown in browser local time; opening-hours rule uses TZ_OFFSET_MIN (IST default).
- Some tests have `|| winnerIdx===3` escapes for the case where the random concurrent winner is the same user; weak assertions.

## Next task
Run the app on your Mac per README, click through every screen as student and admin, and report any bug; then add SMTP (nodemailer) for real emails and a camera QR scanner.
