CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE "Role" AS ENUM ('STUDENT', 'FACULTY', 'ADMIN');
CREATE TYPE "SpaceType" AS ENUM ('CABIN', 'CHAIR');
CREATE TYPE "SpaceStatus" AS ENUM ('ACTIVE', 'MAINTENANCE');
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW', 'COMPLETED');
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'FULFILLED', 'CANCELLED');

CREATE TABLE "User" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'STUDENT',
  "institutionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "PasswordReset" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX "PasswordReset_token_key" ON "PasswordReset"("token");

CREATE TABLE "Floor" (
  "id" SERIAL PRIMARY KEY,
  "number" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX "Floor_number_key" ON "Floor"("number");

CREATE TABLE "Space" (
  "id" SERIAL PRIMARY KEY,
  "floorId" INTEGER NOT NULL REFERENCES "Floor"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "type" "SpaceType" NOT NULL,
  "capacity" INTEGER NOT NULL DEFAULT 1,
  "status" "SpaceStatus" NOT NULL DEFAULT 'ACTIVE',
  "details" TEXT
);
CREATE UNIQUE INDEX "Space_floorId_name_key" ON "Space"("floorId", "name");

CREATE TABLE "BookingRule" (
  "id" SERIAL PRIMARY KEY,
  "role" "Role" NOT NULL,
  "maxDurationMin" INTEGER NOT NULL DEFAULT 120,
  "advanceDays" INTEGER NOT NULL DEFAULT 7,
  "maxActive" INTEGER NOT NULL DEFAULT 2
);
CREATE UNIQUE INDEX "BookingRule_role_key" ON "BookingRule"("role");

CREATE TABLE "Blackout" (
  "id" SERIAL PRIMARY KEY,
  "spaceId" INTEGER REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "floorId" INTEGER REFERENCES "Floor"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT
);

CREATE TABLE "Booking" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "spaceId" INTEGER NOT NULL REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
  "qrToken" TEXT NOT NULL,
  "checkedInAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Booking_qrToken_key" ON "Booking"("qrToken");
CREATE INDEX "Booking_spaceId_startsAt_idx" ON "Booking"("spaceId", "startsAt");
CREATE INDEX "Booking_userId_idx" ON "Booking"("userId");

-- Atomic double-booking prevention: no two active bookings of one space may overlap in time
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_no_overlap"
  EXCLUDE USING gist ("spaceId" WITH =, tsrange("startsAt", "endsAt") WITH &&)
  WHERE ("status" IN ('CONFIRMED', 'CHECKED_IN'));
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_time_order" CHECK ("endsAt" > "startsAt");

CREATE TABLE "WaitlistEntry" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "spaceId" INTEGER NOT NULL REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Notification" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "type" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "read" BOOLEAN NOT NULL DEFAULT false,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "AuditLog" (
  "id" SERIAL PRIMARY KEY,
  "actorId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" INTEGER,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
