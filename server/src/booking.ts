import crypto from "node:crypto";
import { prisma } from "./db";
import {
  HttpError,
  audit,
  notify,
  TZ_OFFSET_MIN,
  OPEN_HOUR,
  CLOSE_HOUR,
  CHECKIN_EARLY_MIN,
  NOSHOW_GRACE_MIN,
  type AuthUser,
} from "./lib";

const ACTIVE = ["CONFIRMED", "CHECKED_IN"] as const;
const fmt = (d: Date) => d.toISOString().replace("T", " ").slice(0, 16) + " UTC";

function localHour(d: Date) {
  return new Date(d.getTime() + TZ_OFFSET_MIN * 60000);
}

export async function getRule(role: AuthUser["role"]) {
  return (
    (await prisma.bookingRule.findUnique({ where: { role } })) ?? {
      role,
      maxDurationMin: 120,
      advanceDays: 7,
      maxActive: 2,
    }
  );
}

export async function validateWindow(user: AuthUser, spaceId: number, start: Date, end: Date, excludeBookingId?: number) {
  if (isNaN(+start) || isNaN(+end)) throw new HttpError(400, "Invalid date/time");
  if (end <= start) throw new HttpError(400, "End time must be after start time");
  const now = new Date();
  if (start <= now) throw new HttpError(400, "Booking must start in the future");

  const space = await prisma.space.findUnique({ where: { id: spaceId }, include: { floor: true } });
  if (!space) throw new HttpError(404, "Space not found");
  if (space.status !== "ACTIVE") throw new HttpError(409, "Space is under maintenance");
  if (!space.floor.active) throw new HttpError(409, "This floor is currently closed");

  // opening hours (campus local time)
  const ls = localHour(start);
  const le = localHour(end);
  const sameDay = ls.toISOString().slice(0, 10) === le.toISOString().slice(0, 10);
  const startH = ls.getUTCHours() + ls.getUTCMinutes() / 60;
  const endH = le.getUTCHours() + le.getUTCMinutes() / 60;
  if (!sameDay || startH < OPEN_HOUR || endH > CLOSE_HOUR)
    throw new HttpError(400, `Bookings must be within opening hours (${OPEN_HOUR}:00-${CLOSE_HOUR}:00) on a single day`);

  const rule = await getRule(user.role);
  const mins = (+end - +start) / 60000;
  if (mins > rule.maxDurationMin) throw new HttpError(400, `Maximum booking duration is ${rule.maxDurationMin} minutes`);
  if (+start > now.getTime() + rule.advanceDays * 86400000)
    throw new HttpError(400, `You can only book up to ${rule.advanceDays} days in advance`);

  const activeCount = await prisma.booking.count({
    where: {
      userId: user.id,
      status: { in: [...ACTIVE] },
      endsAt: { gt: now },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
    },
  });
  if (!excludeBookingId && activeCount >= rule.maxActive)
    throw new HttpError(409, `You already have ${rule.maxActive} active bookings (your limit)`);

  const blackout = await prisma.blackout.findFirst({
    where: {
      startsAt: { lt: end },
      endsAt: { gt: start },
      OR: [{ spaceId }, { floorId: space.floorId }],
    },
  });
  if (blackout) throw new HttpError(409, `Space is blacked out for this period${blackout.reason ? `: ${blackout.reason}` : ""}`);
  return space;
}

function isOverlapError(e: any) {
  const s = `${e?.code ?? ""} ${e?.message ?? ""} ${e?.cause?.message ?? ""} ${JSON.stringify(e?.meta ?? {})} ${e?.cause?.originalCode ?? ""}`;
  return s.includes("23P01") || s.includes("Booking_no_overlap") || s.includes("conflicting key value violates exclusion");
}

export async function createBooking(user: AuthUser, spaceId: number, start: Date, end: Date) {
  const space = await validateWindow(user, spaceId, start, end);
  try {
    const b = await prisma.booking.create({
      data: { userId: user.id, spaceId, startsAt: start, endsAt: end, qrToken: crypto.randomBytes(16).toString("hex") },
      include: { space: { include: { floor: true } } },
    });
    await audit(user.id, "BOOKING_CREATED", "Booking", b.id, { spaceId, start, end });
    await notify(user.id, "BOOKING_CONFIRMED", `Booking confirmed: ${space.name} (Floor ${space.floor.number}) ${fmt(start)} - ${fmt(end)}`);
    return b;
  } catch (e) {
    if (isOverlapError(e)) throw new HttpError(409, "That slot was just taken. Please pick another time or join the waitlist.");
    throw e;
  }
}

async function ownBooking(user: AuthUser, id: number) {
  const b = await prisma.booking.findUnique({ where: { id } });
  if (!b) throw new HttpError(404, "Booking not found");
  if (b.userId !== user.id && user.role !== "ADMIN") throw new HttpError(403, "Not your booking");
  return b;
}

export async function rescheduleBooking(user: AuthUser, id: number, start: Date, end: Date) {
  const b = await ownBooking(user, id);
  if (!ACTIVE.includes(b.status as any)) throw new HttpError(409, `Cannot modify a ${b.status.toLowerCase()} booking`);
  if (b.startsAt <= new Date()) throw new HttpError(409, "Cannot modify a booking whose slot has already started");
  await validateWindow({ ...user, role: (await prisma.user.findUniqueOrThrow({ where: { id: b.userId } })).role }, b.spaceId, start, end, id);
  try {
    const nb = await prisma.booking.update({ where: { id }, data: { startsAt: start, endsAt: end, status: "CONFIRMED" } });
    await audit(user.id, "BOOKING_RESCHEDULED", "Booking", id, { from: b.startsAt, to: start, end });
    await notify(b.userId, "BOOKING_UPDATED", `Booking #${id} rescheduled to ${fmt(start)} - ${fmt(end)}`);
    await promoteWaitlist(b.spaceId, b.startsAt, b.endsAt);
    return nb;
  } catch (e) {
    if (isOverlapError(e)) throw new HttpError(409, "That slot is already booked");
    throw e;
  }
}

export async function cancelBooking(user: AuthUser, id: number) {
  const b = await ownBooking(user, id);
  if (!ACTIVE.includes(b.status as any)) throw new HttpError(409, `Booking is already ${b.status.toLowerCase()}`);
  if (b.startsAt <= new Date()) throw new HttpError(409, "Cannot cancel a booking whose slot has already started");
  const nb = await prisma.booking.update({ where: { id }, data: { status: "CANCELLED" } });
  await audit(user.id, "BOOKING_CANCELLED", "Booking", id);
  await notify(b.userId, "BOOKING_CANCELLED", `Booking #${id} was cancelled (${fmt(b.startsAt)})`);
  await promoteWaitlist(b.spaceId, b.startsAt, b.endsAt);
  return nb;
}

export async function checkIn(user: AuthUser, qrToken: string) {
  const b = await prisma.booking.findUnique({ where: { qrToken }, include: { space: true } });
  if (!b) throw new HttpError(404, "Invalid QR code");
  if (b.userId !== user.id && user.role !== "ADMIN") throw new HttpError(403, "This QR code belongs to another user");
  if (b.status === "CHECKED_IN") throw new HttpError(409, "Already checked in");
  if (b.status !== "CONFIRMED") throw new HttpError(409, `Booking is ${b.status.toLowerCase()}`);
  const now = Date.now();
  if (now < +b.startsAt - CHECKIN_EARLY_MIN * 60000) throw new HttpError(409, `Check-in opens ${CHECKIN_EARLY_MIN} minutes before start`);
  if (now > +b.startsAt + NOSHOW_GRACE_MIN * 60000) throw new HttpError(409, "Check-in window has closed");
  const nb = await prisma.booking.update({ where: { id: b.id }, data: { status: "CHECKED_IN", checkedInAt: new Date() } });
  await audit(user.id, "BOOKING_CHECKED_IN", "Booking", b.id);
  return nb;
}

// Notify first waiting member whose requested window is now free
export async function promoteWaitlist(spaceId: number, from: Date, to: Date) {
  const entries = await prisma.waitlistEntry.findMany({
    where: { spaceId, status: "WAITING", startsAt: { lt: to, gt: new Date() }, endsAt: { gt: from } },
    orderBy: { createdAt: "asc" },
  });
  for (const e of entries) {
    const clash = await prisma.booking.findFirst({
      where: { spaceId, status: { in: [...ACTIVE] }, startsAt: { lt: e.endsAt }, endsAt: { gt: e.startsAt } },
    });
    if (clash) continue;
    await prisma.waitlistEntry.update({ where: { id: e.id }, data: { status: "NOTIFIED" } });
    await notify(e.userId, "WAITLIST_AVAILABLE", `A slot you waitlisted is now free (${fmt(e.startsAt)} - ${fmt(e.endsAt)}). Book it now before someone else does!`);
    return;
  }
}

// Periodic job: release no-shows, complete finished bookings, send reminders
export async function runMaintenance() {
  const now = new Date();
  const noShows = await prisma.booking.findMany({
    where: { status: "CONFIRMED", startsAt: { lt: new Date(+now - NOSHOW_GRACE_MIN * 60000) } },
  });
  for (const b of noShows) {
    await prisma.booking.update({ where: { id: b.id }, data: { status: "NO_SHOW" } });
    await audit(null, "BOOKING_AUTO_RELEASED", "Booking", b.id);
    await notify(b.userId, "BOOKING_RELEASED", `Booking #${b.id} was released because you did not check in on time`);
    await promoteWaitlist(b.spaceId, now, b.endsAt);
  }
  await prisma.booking.updateMany({ where: { status: "CHECKED_IN", endsAt: { lt: now } }, data: { status: "COMPLETED" } });

  const soon = await prisma.booking.findMany({
    where: { status: "CONFIRMED", startsAt: { gt: now, lt: new Date(+now + 15 * 60000) } },
  });
  for (const b of soon) {
    const tag = `Reminder: booking #${b.id}`;
    const already = await prisma.notification.findFirst({ where: { userId: b.userId, type: "REMINDER", message: { startsWith: tag } } });
    if (!already) await notify(b.userId, "REMINDER", `${tag} starts at ${fmt(b.startsAt)}. Check in via your QR code.`);
  }
}
