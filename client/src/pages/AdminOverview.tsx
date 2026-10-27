import { useEffect, useState } from "react";
import { api, fmtRange } from "../api";

type Run = (fn: () => Promise<any>, ok: string, after?: () => void) => void;

export default function AdminOverview({ run }: { run: Run }) {
  const [bookings, setBookings] = useState<any[]>([]);
  const [spaces, setSpaces] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const load = () => {
    const now = new Date();
    const p = new URLSearchParams({ start: now.toISOString(), end: new Date(+now + 60000).toISOString() });
    api("GET", "/bookings/all").then(setBookings);
    api("GET", "/spaces?" + p).then(setSpaces);
    api("GET", "/users").then(setUsers);
  };
  useEffect(load, []);

  const now = new Date();
  const active = bookings.filter((b) => ["CONFIRMED", "CHECKED_IN"].includes(b.status));
  const inProgress = active.filter((b) => new Date(b.startsAt) <= now && new Date(b.endsAt) > now);
  const upcoming = active.filter((b) => new Date(b.startsAt) > now).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const floors = Array.from(new Map(spaces.map((s) => [s.floor.id, s.floor])).values()).sort((a: any, b: any) => a.number - b.number);
  const occupied = spaces.filter((s) => s.state === "BOOKED").length;
  const usable = spaces.filter((s) => s.state !== "MAINTENANCE").length;
  const stat = (label: string, value: string | number) => (
    <div className="card"><div className="meta">{label}</div><div style={{ fontFamily: "var(--serif)", fontSize: "1.8rem", fontWeight: 700 }}>{value}</div></div>
  );

  return (
    <>
      <div className="grid" style={{ marginBottom: "1.2rem" }}>
        {stat("Occupied right now", `${occupied} / ${usable}`)}
        {stat("Bookings in progress", inProgress.length)}
        {stat("Upcoming bookings", upcoming.length)}
        {stat("Users (students / faculty)", `${users.filter((u) => u.role === "STUDENT").length} / ${users.filter((u) => u.role === "FACULTY").length}`)}
      </div>

      <h2>Live availability by floor</h2>
      <div className="grid" style={{ marginBottom: "1.2rem" }}>
        {floors.map((f: any) => {
          const fs = spaces.filter((s) => s.floor.id === f.id);
          return (
            <div key={f.id} className="card">
              <h3>{f.name} {!f.active && <span className="badge MAINTENANCE">closed</span>}</h3>
              <div className="meta">{fs.filter((s) => s.state === "AVAILABLE").length} free · {fs.filter((s) => s.state === "BOOKED").length} in use · {fs.filter((s) => ["MAINTENANCE", "BLACKED_OUT"].includes(s.state)).length} unavailable</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {fs.map((s) => <span key={s.id} className={`badge ${s.state}`} title={`${s.name} (${s.type.toLowerCase()}, ${s.state.toLowerCase().replace("_", " ")})`}>{s.name.replace(/^F\d-/, "")}</span>)}
              </div>
            </div>
          );
        })}
      </div>

      <h2>Next bookings</h2>
      <div className="card"><table><thead><tr><th>User</th><th>Space</th><th>When</th><th></th></tr></thead><tbody>
        {upcoming.slice(0, 8).map((b) => (
          <tr key={b.id}><td>{b.user.name}<div className="meta">{b.user.role.toLowerCase()}</div></td><td>{b.space.name}<div className="meta">{b.space.floor.name}</div></td><td>{fmtRange(b.startsAt, b.endsAt)}</td>
            <td><button className="sm danger" onClick={() => confirm(`Cancel booking #${b.id}?`) && run(() => api("POST", `/bookings/${b.id}/cancel`), "Booking cancelled", load)}>Cancel</button></td></tr>))}
        {!upcoming.length && <tr><td colSpan={4} className="meta">No upcoming bookings.</td></tr>}
      </tbody></table></div>
      <p className="meta">Bookings are confirmed automatically under the booking rules; there is no approval step. Use the tabs above for spaces, rules, blackouts, all bookings, reports, audit log and user roles.</p>
    </>
  );
}
