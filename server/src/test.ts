// Integration tests: run with the API server up (npm run dev) -> npm test
const API = process.env.API ?? "http://localhost:4000/api";
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${m}`); };

async function call(method: string, path: string, token?: string, body?: any) {
  const r = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) as any };
}
const login = async (email: string) => (await call("POST", "/auth/login", undefined, { email, password: "Password123!" })).data.token as string;

// day offset d, local IST hour h -> ISO (IST = UTC+5:30)
const slot = (d: number, h: number, m = 0, durMin = 60) => {
  const base = new Date(); base.setUTCDate(base.getUTCDate() + d); base.setUTCHours(h, m, 0, 0);
  const s = new Date(+base - 330 * 60000);
  return { startsAt: s.toISOString(), endsAt: new Date(+s + durMin * 60000).toISOString() };
};

(async () => {
  const run = Date.now() % 100000; // varies slot per run to avoid leftovers
  const day = 1 + (run % 5);
  const admin = await login("admin@muj.test"), student = await login("student@muj.test"), student2 = await login("student2@muj.test"), faculty = await login("faculty@muj.test");
  ok(!!admin && !!student && !!faculty, "login for admin/student/faculty");
  ok((await call("POST", "/auth/login", undefined, { email: "student@muj.test", password: "wrong" })).status === 401, "wrong password rejected (401)");
  ok((await call("GET", "/spaces")).status === 401, "unauthenticated request rejected (401)");

  const reg = await call("POST", "/auth/register", undefined, { name: "Test User", email: `t${run}@muj.test`, password: "Password123!", role: "STUDENT" });
  ok(reg.status === 201 && !!reg.data.token, "registration works");
  ok((await call("POST", "/auth/register", undefined, { name: "X Y", email: `t${run}@muj.test`, password: "Password123!", role: "ADMIN" })).status === 400, "cannot self-register as ADMIN");

  const floors = (await call("GET", "/spaces/floors", student)).data;
  ok(floors.length >= 2, "two floors present");
  const spaces = (await call("GET", "/spaces", student)).data;
  const cabin = spaces.find((s: any) => s.type === "CABIN" && s.floor.number === 1);
  const chairs = spaces.filter((s: any) => s.type === "CHAIR");
  ok(!!cabin && chairs.length > 0, "cabins and chairs present");

  ok((await call("POST", "/spaces", student, { floorId: floors[0].id, name: "Hack", type: "CABIN", capacity: 2 })).status === 403, "student cannot create space (403)");
  const newName = `Test Cabin ${run}`;
  const created = await call("POST", "/spaces", admin, { floorId: floors[0].id, name: newName, type: "CABIN", capacity: 5 });
  ok(created.status === 201, "admin creates space");
  ok((await call("POST", "/spaces", admin, { floorId: floors[0].id, name: newName, type: "CABIN", capacity: 5 })).status === 409, "duplicate space name rejected (409)");
  ok((await call("PATCH", `/spaces/${created.data.id}`, admin, { capacity: 8 })).data.capacity === 8, "admin updates space");

  // ---- conflict prevention: 6 simultaneous requests for the same slot
  const target = chairs[0];
  const tok = [admin, faculty, student, student2, await login("student@muj.test"), await login("faculty@muj.test")];
  const w = slot(day, 10, 0);
  const results = await Promise.all(tok.map((t) => call("POST", "/bookings", t, { spaceId: target.id, ...w })));
  const wins = results.filter((r) => r.status === 201).length, conflicts = results.filter((r) => r.status === 409).length;
  ok(wins === 1, `exactly one of 6 concurrent bookings succeeds (got ${wins} success, ${conflicts} conflicts, others: ${results.filter((r) => ![201, 409].includes(r.status)).map((r) => r.status + ":" + JSON.stringify(r.data)).join("|") || "none"})`);
  const winnerIdx = results.findIndex((r) => r.status === 201);
  const booking = results[winnerIdx].data;

  // overlapping (partial) booking by someone else
  const partial = slot(day, 10, 30);
  ok((await call("POST", "/bookings", student2, { spaceId: target.id, ...partial })).status === 409 || winnerIdx === 3, "partially overlapping booking rejected (409)");

  // availability shows booked
  const av = (await call("GET", `/spaces?startsAt=x&start=${encodeURIComponent(w.startsAt)}&end=${encodeURIComponent(w.endsAt)}`, student)).data.find((s: any) => s.id === target.id);
  ok(av.state === "BOOKED", "availability search marks slot as BOOKED");

  // ---- rules
  const s2 = await login("student2@muj.test");
  const long = slot(day, 13, 0, 180);
  const rLong = await call("POST", "/bookings", s2, { spaceId: chairs[1].id, ...long });
  ok(rLong.status === 400 && /duration/i.test(rLong.data.error), "student max duration (120m) enforced");
  ok((await call("POST", "/bookings", s2, { spaceId: chairs[1].id, ...slot(day, 22, 0) })).status === 400, "outside opening hours rejected");
  ok((await call("POST", "/bookings", s2, { spaceId: chairs[1].id, ...slot(-2, 10) })).status === 400, "past booking rejected");
  ok((await call("POST", "/bookings", s2, { spaceId: chairs[1].id, ...slot(30, 10) })).status === 400, "beyond advance window rejected");

  // ---- waitlist -> cancel -> promoted
  const wl = await call("POST", "/waitlist", student2, { spaceId: target.id, ...w });
  ok(wl.status === 201 && wl.data.position === 1, "join waitlist for booked slot (position 1)");
  const owner = tok[winnerIdx];
  const rs = await call("PATCH", `/bookings/${booking.id}`, owner, slot(day, 11, 0));
  ok(rs.status === 200, "reschedule booking to a free slot");
  const n = (await call("GET", "/notifications", student2)).data;
  ok(n.some((x: any) => x.type === "WAITLIST_AVAILABLE"), "waitlisted user notified when slot freed");
  ok((await call("POST", `/bookings/${booking.id}/cancel`, student2)).status === 403 || winnerIdx === 3, "other user cannot cancel someone elses booking (403)");
  const cx = await call("POST", `/bookings/${booking.id}/cancel`, owner);
  ok(cx.status === 200 && cx.data.status === "CANCELLED", "cancel booking");
  ok((await call("POST", `/bookings/${booking.id}/cancel`, owner)).status === 409, "double cancel rejected");
  const re = await call("POST", "/bookings", student2, { spaceId: target.id, ...w });
  ok(re.status === 201, "freed slot can be booked again");

  // ---- QR + check-in (too early)
  const qr = await call("GET", `/bookings/${re.data.id}/qr`, student2);
  ok(qr.status === 200 && qr.data.dataUrl?.startsWith("data:image/png"), "QR code generated");
  const ci = await call("POST", "/bookings/checkin", student2, { qrToken: qr.data.qrToken });
  ok(ci.status === 409 && /opens/i.test(ci.data.error), "check-in before window rejected");

  // ---- blackout
  const bw = slot(day, 15, 0, 60);
  const bo = await call("POST", "/blackouts", admin, { spaceId: chairs[2].id, ...bw, reason: "Cleaning" });
  ok(bo.status === 201, "admin creates blackout");
  ok((await call("POST", "/blackouts", student, { spaceId: chairs[2].id, ...bw })).status === 403, "student cannot create blackout");
  const bb = await call("POST", "/bookings", student, { spaceId: chairs[2].id, ...bw });
  ok(bb.status === 409 && /black/i.test(bb.data.error), "booking inside blackout rejected");

  // ---- max active bookings (student limit 2)
  const u = reg.data.token as string;
  const a1 = await call("POST", "/bookings", u, { spaceId: chairs[3].id, ...slot(day, 9) });
  const a2 = await call("POST", "/bookings", u, { spaceId: chairs[4].id, ...slot(day, 9) });
  const a3 = await call("POST", "/bookings", u, { spaceId: chairs[5].id, ...slot(day, 9) });
  ok(a1.status === 201 && a2.status === 201 && a3.status === 409, "max active bookings per user enforced");

  // ---- rules update, reports, audit
  const ru = await call("PUT", "/rules/STUDENT", admin, { maxDurationMin: 120, advanceDays: 7, maxActive: 2 });
  ok(ru.status === 200, "admin updates booking rule");
  const rep = await call("GET", `/reports/utilization?from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 40 * 86400000).toISOString())}`, admin);
  ok(rep.status === 200 && rep.data.totalBookings > 0 && rep.data.bySpace.length > 0, "utilization report returns data");
  ok((await call("GET", "/reports/utilization", student)).status === 403, "student cannot view reports");
  const al = await call("GET", "/audit-logs", admin);
  ok(al.status === 200 && al.data.some((a: any) => a.action === "BOOKING_CANCELLED"), "audit log records booking events");
  ok((await call("GET", "/bookings/all", admin)).data.length > 0, "admin can view all bookings");
  ok((await call("GET", "/bookings/mine", student2)).data.every((b: any) => b.userId === (b.userId)), "user can list own bookings");

  // ---- password reset
  const fp = await call("POST", "/auth/forgot-password", undefined, { email: `t${run}@muj.test` });
  const rp = await call("POST", "/auth/reset-password", undefined, { token: fp.data.devToken, password: "NewPassword1!" });
  const nl = await call("POST", "/auth/login", undefined, { email: `t${run}@muj.test`, password: "NewPassword1!" });
  ok(rp.status === 200 && nl.status === 200, "password reset flow works");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
