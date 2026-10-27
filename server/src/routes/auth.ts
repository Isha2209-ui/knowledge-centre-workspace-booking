import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../db";
import { HttpError, signToken, requireAuth, wrap, audit, notify } from "../lib";

export const auth = Router();

const reg = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["STUDENT", "FACULTY"]),
  institutionId: z.string().optional(),
});

auth.post("/register", wrap(async (req, res) => {
  const d = reg.parse(req.body);
  const email = d.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(409, "Email already registered");
  const u = await prisma.user.create({
    data: { name: d.name, email, passwordHash: await bcrypt.hash(d.password, 10), role: d.role, institutionId: d.institutionId },
  });
  await audit(u.id, "USER_REGISTERED", "User", u.id);
  const au = { id: u.id, role: u.role, name: u.name, email: u.email };
  res.status(201).json({ token: signToken(au), user: au });
}));

auth.post("/login", wrap(async (req, res) => {
  const d = z.object({ email: z.string().email(), password: z.string(), role: z.enum(["STUDENT", "FACULTY", "ADMIN"]).optional() }).parse(req.body);
  const u = await prisma.user.findUnique({ where: { email: d.email.toLowerCase() } });
  if (!u || !(await bcrypt.compare(d.password, u.passwordHash))) throw new HttpError(401, "Invalid email or password");
  if (d.role && d.role !== u.role) throw new HttpError(403, `This account is not a ${d.role.toLowerCase()} account. Choose the correct login type.`);
  const au = { id: u.id, role: u.role, name: u.name, email: u.email };
  res.json({ token: signToken(au), user: au });
}));

auth.get("/me", requireAuth, wrap(async (req, res) => res.json({ user: req.user })));

// Password reset: token is returned in the response in dev (no SMTP). Also delivered as notification/console email.
auth.post("/forgot-password", wrap(async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  const u = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  let devToken: string | undefined;
  if (u) {
    const token = crypto.randomBytes(20).toString("hex");
    await prisma.passwordReset.create({ data: { userId: u.id, token, expiresAt: new Date(Date.now() + 3600_000) } });
    await notify(u.id, "PASSWORD_RESET", `Password reset token: ${token}`);
    if (process.env.NODE_ENV !== "production") devToken = token;
  }
  res.json({ message: "If the email exists, a reset token has been sent.", devToken });
}));

auth.post("/reset-password", wrap(async (req, res) => {
  const d = z.object({ token: z.string(), password: z.string().min(8) }).parse(req.body);
  const r = await prisma.passwordReset.findUnique({ where: { token: d.token } });
  if (!r || r.used || r.expiresAt < new Date()) throw new HttpError(400, "Invalid or expired reset token");
  await prisma.user.update({ where: { id: r.userId }, data: { passwordHash: await bcrypt.hash(d.password, 10) } });
  await prisma.passwordReset.update({ where: { id: r.id }, data: { used: true } });
  await audit(r.userId, "PASSWORD_RESET", "User", r.userId);
  res.json({ message: "Password updated" });
}));