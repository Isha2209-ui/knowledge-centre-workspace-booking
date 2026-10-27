import bcrypt from "bcryptjs";
import { prisma } from "./db";

async function main() {
  const pw = await bcrypt.hash("Password123!", 10);
  const users = [
    { name: "Library Admin", email: "admin@muj.test", role: "ADMIN" as const },
    { name: "Dr. Faculty", email: "faculty@muj.test", role: "FACULTY" as const },
    { name: "Isha Goyal", email: "student@muj.test", role: "STUDENT" as const },
    { name: "Aarushi Singh", email: "student2@muj.test", role: "STUDENT" as const },
  ];
  for (const u of users) await prisma.user.upsert({ where: { email: u.email }, update: {}, create: { ...u, passwordHash: pw } });

  const floors = [{ number: 1, name: "Ground Floor" }, { number: 2, name: "First Floor" }];
  for (const f of floors) {
    const fl = await prisma.floor.upsert({ where: { number: f.number }, update: {}, create: f });
    const cabins = f.number === 1 ? 4 : 3;
    for (let i = 1; i <= cabins; i++)
      await prisma.space.upsert({ where: { floorId_name: { floorId: fl.id, name: `F${f.number}-Cabin ${i}` } }, update: {}, create: { floorId: fl.id, name: `F${f.number}-Cabin ${i}`, type: "CABIN", capacity: i % 2 ? 4 : 6, details: "Glass-walled discussion cabin with whiteboard" } });
    for (let i = 1; i <= 6; i++)
      await prisma.space.upsert({ where: { floorId_name: { floorId: fl.id, name: `F${f.number}-Chair ${i}` } }, update: {}, create: { floorId: fl.id, name: `F${f.number}-Chair ${i}`, type: "CHAIR", capacity: 1, details: "Individual study seat" } });
  }
  const rules = [
    { role: "STUDENT" as const, maxDurationMin: 120, advanceDays: 7, maxActive: 2 },
    { role: "FACULTY" as const, maxDurationMin: 240, advanceDays: 14, maxActive: 5 },
    { role: "ADMIN" as const, maxDurationMin: 480, advanceDays: 30, maxActive: 20 },
  ];
  for (const r of rules) await prisma.bookingRule.upsert({ where: { role: r.role }, update: {}, create: r });
  console.log("Seed complete. Login: admin@muj.test / faculty@muj.test / student@muj.test  (password: Password123!)");
}
main().finally(() => prisma.$disconnect());
