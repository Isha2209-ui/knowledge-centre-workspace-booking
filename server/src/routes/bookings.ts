import { Router } from "express";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole, wrap, HttpError } from "../lib";
import { createBooking, rescheduleBooking, cancelBooking, checkIn } from "../booking";

export const bookings = Router();
bookings.use(requireAuth);

const inc = { space: { include: { floor: true } } };
const win = z.object({ spaceId: z.number().int(), startsAt: z.string(), endsAt: z.string() });

bookings.post("/", wrap(async (req, res) => {
  const d = win.parse(req.body);
  res.status(201).json(await createBooking(req.user!, d.spaceId, new Date(d.startsAt), new Date(d.endsAt)));
}));

bookings.get("/mine", wrap(async (req, res) => {
  res.json(await prisma.booking.findMany({ where: { userId: req.user!.id }, include: inc, orderBy: { startsAt: "desc" } }));
}));

// Admin: all bookings with filters
bookings.get("/all", requireRole("ADMIN"), wrap(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const where: any = {};
  if (q.status) where.status = q.status;
  if (q.spaceId) where.spaceId = Number(q.spaceId);
  if (q.q) where.user = { OR: [{ name: { contains: q.q, mode: "insensitive" } }, { email: { contains: q.q, mode: "insensitive" } }] };
  res.json(await prisma.booking.findMany({ where, include: { ...inc, user: { select: { id: true, name: true, email: true, role: true } } }, orderBy: { startsAt: "desc" }, take: 300 }));
}));

bookings.get("/:id", wrap(async (req, res) => {
  const b = await prisma.booking.findUnique({ where: { id: Number(req.params.id) }, include: inc });
  if (!b) throw new HttpError(404, "Booking not found");
  if (b.userId !== req.user!.id && req.user!.role !== "ADMIN") throw new HttpError(403, "Not your booking");
  res.json(b);
}));

bookings.patch("/:id", wrap(async (req, res) => {
  const d = z.object({ startsAt: z.string(), endsAt: z.string() }).parse(req.body);
  res.json(await rescheduleBooking(req.user!, Number(req.params.id), new Date(d.startsAt), new Date(d.endsAt)));
}));

bookings.post("/:id/cancel", wrap(async (req, res) => {
  res.json(await cancelBooking(req.user!, Number(req.params.id)));
}));

bookings.get("/:id/qr", wrap(async (req, res) => {
  const b = await prisma.booking.findUnique({ where: { id: Number(req.params.id) } });
  if (!b) throw new HttpError(404, "Booking not found");
  if (b.userId !== req.user!.id && req.user!.role !== "ADMIN") throw new HttpError(403, "Not your booking");
  res.json({ qrToken: b.qrToken, dataUrl: await QRCode.toDataURL(b.qrToken, { width: 240 }) });
}));

bookings.post("/checkin", wrap(async (req, res) => {
  const { qrToken } = z.object({ qrToken: z.string().min(8) }).parse(req.body);
  res.json(await checkIn(req.user!, qrToken.trim()));
}));
