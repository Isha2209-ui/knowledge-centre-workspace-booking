import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { prisma } from "./db";
import type { Role } from "./generated/client";

const SECRET = process.env.JWT_SECRET || "dev-secret";
export const TZ_OFFSET_MIN = Number(process.env.TZ_OFFSET_MIN ?? 330); // IST
export const OPEN_HOUR = Number(process.env.OPEN_HOUR ?? 8);
export const CLOSE_HOUR = Number(process.env.CLOSE_HOUR ?? 20);
export const CHECKIN_EARLY_MIN = 10;
export const NOSHOW_GRACE_MIN = 15;

export type AuthUser = { id: number; role: Role; name: string; email: string };
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const signToken = (u: AuthUser) => jwt.sign(u, SECRET, { expiresIn: "8h" });

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return next(new HttpError(401, "Authentication required"));
  try {
    const p = jwt.verify(h.slice(7), SECRET) as AuthUser;
    req.user = { id: p.id, role: p.role, name: p.name, email: p.email };
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired token"));
  }
}

export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) =>
    req.user && roles.includes(req.user.role) ? next() : next(new HttpError(403, "Insufficient permissions"));

export const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

export async function audit(actorId: number | null, action: string, entity: string, entityId?: number, meta?: object) {
  await prisma.auditLog.create({ data: { actorId, action, entity, entityId, meta: meta as any } });
}

// In-app notification + simulated email (logged to console; no SMTP configured)
export async function notify(userId: number, type: string, message: string) {
  await prisma.notification.create({ data: { userId, type, message } });
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  console.log(`[email -> ${u?.email}] ${type}: ${message}`);
}
