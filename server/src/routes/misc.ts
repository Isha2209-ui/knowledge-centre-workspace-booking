import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole, wrap, audit, HttpError } from "../lib";

export const misc = Router();
misc.use(requireAuth);

// ---- Waitlist
misc.post("/waitlist", wrap(async (req, res) => {
  const d = z.object({ spaceId: z.number().int(), startsAt: z.string(), endsAt: z.string() }).parse(req.body);
  const startsAt = new Date(d.startsAt), endsAt = new Date(d.endsAt);
  if (isNaN(+startsAt) || endsAt <= startsAt || startsAt <= new Date()) throw new HttpError(400, "Invalid waitlist window");
  const clash = await prisma.booking.findFirst({ where: { spaceId: d.spaceId, status: { in: ["CONFIRMED", "CHECKED_IN"] }, startsAt: { lt: endsAt }, endsAt: { gt: startsAt } } });
  if (!clash) throw new HttpError(409, "That slot is free - book it directly instead of joining the waitlist");
  const dup = await prisma.waitlistEntry.findFirst({ where: { userId: req.user!.id, spaceId: d.spaceId, startsAt, endsAt, status: { in: ["WAITING", "NOTIFIED"] } } });
  if (dup) throw new HttpError(409, "You are already on the waitlist for this slot");
  const e = await prisma.waitlistEntry.create({ data: { userId: req.user!.id, spaceId: d.spaceId, startsAt, endsAt } });
  const position = await prisma.waitlistEntry.count({ where: { spaceId: d.spaceId, status: "WAITING", startsAt: { lt: endsAt }, endsAt: { gt: startsAt }, id: { lte: e.id } } });
  await audit(req.user!.id, "WAITLIST_JOINED", "WaitlistEntry", e.id);
  res.status(201).json({ ...e, position });
}));
misc.get("/waitlist/mine", wrap(async (req, res) => {
  res.json(await prisma.waitlistEntry.findMany({ where: { userId: req.user!.id }, include: { space: { include: { floor: true } } }, orderBy: { createdAt: "desc" } }));
}));
misc.delete("/waitlist/:id", wrap(async (req, res) => {
  const e = await prisma.waitlistEntry.findUnique({ where: { id: Number(req.params.id) } });
  if (!e || e.userId !== req.user!.id) throw new HttpError(404, "Waitlist entry not found");
  res.json(await prisma.waitlistEntry.update({ where: { id: e.id }, data: { status: "CANCELLED" } }));
}));

// ---- Notifications
misc.get("/notifications", wrap(async (req, res) => {
  res.json(await prisma.notification.findMany({ where: { userId: req.user!.id }, orderBy: { sentAt: "desc" }, take: 50 }));
}));
misc.post("/notifications/read", wrap(async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, read: false }, data: { read: true } });
  res.json({ ok: true });
}));

// ---- Admin: rules
const admin = requireRole("ADMIN");
misc.get("/rules", wrap(async (_req, res) => res.json(await prisma.bookingRule.findMany({ orderBy: { id: "asc" } }))));
misc.put("/rules/:role", admin, wrap(async (req, res) => {
  const role = z.enum(["STUDENT", "FACULTY", "ADMIN"]).parse(req.params.role);
  const d = z.object({ maxDurationMin: z.number().int().min(15), advanceDays: z.number().int().min(1), maxActive: z.number().int().min(1) }).parse(req.body);
  const r = await prisma.bookingRule.upsert({ where: { role }, update: d, create: { role, ...d } });
  await audit(req.user!.id, "RULE_UPDATED", "BookingRule", r.id, d);
  res.json(r);
}));

// ---- Admin: blackouts
misc.get("/blackouts", wrap(async (_req, res) => res.json(await prisma.blackout.findMany({ include: { space: true, floor: true }, orderBy: { startsAt: "desc" } }))));
misc.post("/blackouts", admin, wrap(async (req, res) => {
  const d = z.object({ spaceId: z.number().int().optional(), floorId: z.number().int().optional(), startsAt: z.string(), endsAt: z.string(), reason: z.string().optional() }).parse(req.body);
  if (!d.spaceId && !d.floorId) throw new HttpError(400, "Provide a spaceId or floorId");
  const startsAt = new Date(d.startsAt), endsAt = new Date(d.endsAt);
  if (isNaN(+startsAt) || endsAt <= startsAt) throw new HttpError(400, "Invalid blackout window");
  const b = await prisma.blackout.create({ data: { ...d, startsAt, endsAt } });
  await audit(req.user!.id, "BLACKOUT_CREATED", "Blackout", b.id, d);
  res.status(201).json(b);
}));
misc.delete("/blackouts/:id", admin, wrap(async (req, res) => {
  await prisma.blackout.delete({ where: { id: Number(req.params.id) } });
  await audit(req.user!.id, "BLACKOUT_DELETED", "Blackout", Number(req.params.id));
  res.json({ deleted: true });
}));

// ---- Admin: reports, audit, users
misc.get("/reports/utilization", admin, wrap(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const to = q.to ? new Date(q.to) : new Date();
  const from = q.from ? new Date(q.from) : new Date(+to - 30 * 86400000);
  const bs = await prisma.booking.findMany({
    where: { startsAt: { gte: from, lte: to } },
    include: { space: { include: { floor: true } }, user: { select: { id: true, name: true } } },
  });
  const used = bs.filter((b) => ["CONFIRMED", "CHECKED_IN", "COMPLETED"].includes(b.status));
  const hrs = (b: { startsAt: Date; endsAt: Date }) => (+b.endsAt - +b.startsAt) / 3600000;
  const bySpace: Record<string, any> = {};
  const byDay: Record<string, number> = {};
  const byUser: Record<string, any> = {};
  for (const b of used) {
    const k = `${b.space.id}`;
    bySpace[k] ??= { spaceId: b.space.id, name: b.space.name, floor: b.space.floor.number, bookings: 0, hours: 0 };
    bySpace[k].bookings++; bySpace[k].hours += hrs(b);
    const d = b.startsAt.toISOString().slice(0, 10); byDay[d] = (byDay[d] ?? 0) + 1;
    byUser[b.user.id] ??= { name: b.user.name, bookings: 0 }; byUser[b.user.id].bookings++;
  }
  const statusCounts: Record<string, number> = {};
  for (const b of bs) statusCounts[b.status] = (statusCounts[b.status] ?? 0) + 1;
  res.json({
    from, to, totalBookings: bs.length, usedBookings: used.length, statusCounts,
    bySpace: Object.values(bySpace).sort((a: any, b: any) => b.hours - a.hours),
    byDay: Object.entries(byDay).sort().map(([date, count]) => ({ date, count })),
    topUsers: Object.values(byUser).sort((a: any, b: any) => b.bookings - a.bookings).slice(0, 5),
  });
}));
misc.get("/audit-logs", admin, wrap(async (_req, res) => {
  res.json(await prisma.auditLog.findMany({ include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 200 }));
}));
misc.get("/users", admin, wrap(async (_req, res) => {
  res.json(await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, createdAt: true }, orderBy: { id: "asc" } }));
}));
misc.patch("/users/:id/role", admin, wrap(async (req, res) => {
  const { role } = z.object({ role: z.enum(["STUDENT", "FACULTY", "ADMIN"]) }).parse(req.body);
  const u = await prisma.user.update({ where: { id: Number(req.params.id) }, data: { role }, select: { id: true, name: true, role: true } });
  await audit(req.user!.id, "USER_ROLE_CHANGED", "User", u.id, { role });
  res.json(u);
}));
