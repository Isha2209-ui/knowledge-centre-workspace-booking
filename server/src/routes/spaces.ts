import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole, wrap, audit, HttpError } from "../lib";

export const spaces = Router();
spaces.use(requireAuth);

spaces.get("/floors", wrap(async (_req, res) => {
  res.json(await prisma.floor.findMany({ orderBy: { number: "asc" } }));
}));

// Availability: ?date=YYYY-MM-DD (UTC day window) or ?start=ISO&end=ISO ; optional floorId,type,minCapacity
spaces.get("/", wrap(async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const where: any = {};
  if (q.floorId) where.floorId = Number(q.floorId);
  if (q.type) where.type = q.type;
  if (q.minCapacity) where.capacity = { gte: Number(q.minCapacity) };
  const list = await prisma.space.findMany({ where, include: { floor: true }, orderBy: [{ floorId: "asc" }, { name: "asc" }] });

  let from: Date | undefined, to: Date | undefined;
  if (q.start && q.end) { from = new Date(q.start); to = new Date(q.end); }
  else if (q.date) { from = new Date(q.date + "T00:00:00Z"); to = new Date(+from + 86400000); }
  if (!from || !to || isNaN(+from) || isNaN(+to)) return res.json(list.map((s) => ({ ...s, state: s.status === "ACTIVE" ? "AVAILABLE" : "MAINTENANCE", busy: [] })));

  const ids = list.map((s) => s.id);
  const bookings = await prisma.booking.findMany({
    where: { spaceId: { in: ids }, status: { in: ["CONFIRMED", "CHECKED_IN"] }, startsAt: { lt: to }, endsAt: { gt: from } },
    select: { spaceId: true, startsAt: true, endsAt: true, userId: true, id: true },
  });
  const blackouts = await prisma.blackout.findMany({ where: { startsAt: { lt: to }, endsAt: { gt: from } } });
  const me = req.user!.id;
  res.json(list.map((s) => {
    const busy = [
      ...bookings.filter((b) => b.spaceId === s.id).map((b) => ({ kind: "BOOKED", start: b.startsAt, end: b.endsAt, mine: b.userId === me })),
      ...blackouts.filter((b) => b.spaceId === s.id || b.floorId === s.floorId).map((b) => ({ kind: "BLACKOUT", start: b.startsAt, end: b.endsAt, mine: false })),
    ];
    let state = "AVAILABLE";
    if (s.status !== "ACTIVE" || !s.floor.active) state = "MAINTENANCE";
    else if (q.start && q.end) {
      if (busy.some((b) => b.kind === "BLACKOUT")) state = "BLACKED_OUT";
      else if (busy.length) state = "BOOKED";
    }
    return { ...s, state, busy };
  }));
}));

const spaceBody = z.object({
  floorId: z.number().int(),
  name: z.string().min(1),
  type: z.enum(["CABIN", "CHAIR"]),
  capacity: z.number().int().min(1),
  status: z.enum(["ACTIVE", "MAINTENANCE"]).optional(),
  details: z.string().optional(),
});

spaces.post("/", requireRole("ADMIN"), wrap(async (req, res) => {
  const d = spaceBody.parse(req.body);
  try {
    const s = await prisma.space.create({ data: d });
    await audit(req.user!.id, "SPACE_CREATED", "Space", s.id, d);
    res.status(201).json(s);
  } catch (e: any) {
    if (String(e?.message).includes("Unique") || e?.code === "P2002" || String(e?.message).includes("duplicate")) throw new HttpError(409, "A space with that name already exists on this floor");
    throw e;
  }
}));

spaces.patch("/:id", requireRole("ADMIN"), wrap(async (req, res) => {
  const d = spaceBody.partial().parse(req.body);
  const s = await prisma.space.update({ where: { id: Number(req.params.id) }, data: d });
  await audit(req.user!.id, "SPACE_UPDATED", "Space", s.id, d);
  res.json(s);
}));

spaces.delete("/:id", requireRole("ADMIN"), wrap(async (req, res) => {
  const id = Number(req.params.id);
  if (await prisma.booking.count({ where: { spaceId: id } })) {
    // keep history: soft-disable instead of delete
    const s = await prisma.space.update({ where: { id }, data: { status: "MAINTENANCE" } });
    await audit(req.user!.id, "SPACE_DISABLED", "Space", id);
    return res.json({ ...s, note: "Space has booking history; marked as maintenance instead of deleted" });
  }
  await prisma.space.delete({ where: { id } });
  await audit(req.user!.id, "SPACE_DELETED", "Space", id);
  res.json({ deleted: true });
}));

// Floors (two by default; admin can add/rename/close)
spaces.post("/floors", requireRole("ADMIN"), wrap(async (req, res) => {
  const d = z.object({ number: z.number().int(), name: z.string().min(1) }).parse(req.body);
  const f = await prisma.floor.create({ data: d });
  await audit(req.user!.id, "FLOOR_CREATED", "Floor", f.id, d);
  res.status(201).json(f);
}));
spaces.patch("/floors/:id", requireRole("ADMIN"), wrap(async (req, res) => {
  const d = z.object({ name: z.string().min(1).optional(), active: z.boolean().optional() }).parse(req.body);
  const f = await prisma.floor.update({ where: { id: Number(req.params.id) }, data: d });
  await audit(req.user!.id, "FLOOR_UPDATED", "Floor", f.id, d);
  res.json(f);
}));
