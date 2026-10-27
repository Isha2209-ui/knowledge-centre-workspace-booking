import { useEffect, useState } from "react";
import { api, fmtRange, toLocalInput } from "../api";
import { useApp } from "../App";

export default function MyBookings() {
  const { refreshUnread } = useApp();
  const [rows, setRows] = useState<any[]>([]);
  const [wl, setWl] = useState<any[]>([]);
  const [qr, setQr] = useState<{ id: number; dataUrl: string; qrToken: string } | null>(null);
  const [resched, setResched] = useState<{ id: number; start: string; end: string } | null>(null);
  const [token, setTokenIn] = useState("");
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  const load = () => { api("GET", "/bookings/mine").then(setRows); api("GET", "/waitlist/mine").then(setWl); };
  useEffect(load, []);
  const run = async (fn: () => Promise<any>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ t: ok }); refreshUnread(); } catch (e: any) { setMsg({ t: e.message, err: true }); }
    load();
  };
  const upcoming = (b: any) => ["CONFIRMED", "CHECKED_IN"].includes(b.status) && new Date(b.startsAt) > new Date();

  return (
    <>
      <h1>My bookings</h1>
      {msg && <div className={"msg" + (msg.err ? " err" : "")}>{msg.t}</div>}
      <div className="row">
        <label>Check in (paste QR token)<input value={token} onChange={(e) => setTokenIn(e.target.value)} placeholder="QR token" style={{ width: 280 }} /></label>
        <button className="primary" disabled={!token} onClick={() => run(() => api("POST", "/bookings/checkin", { qrToken: token }), "Checked in!")}>Check in</button>
      </div>
      <div className="card"><table>
        <thead><tr><th>Space</th><th>When</th><th>Status</th><th></th></tr></thead>
        <tbody>{rows.map((b) => (
          <tr key={b.id}>
            <td><b>{b.space.name}</b><div className="meta">{b.space.floor.name}</div></td>
            <td>{fmtRange(b.startsAt, b.endsAt)}</td>
            <td><span className={`badge ${b.status}`}>{b.status.replace("_", " ")}</span></td>
            <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {["CONFIRMED", "CHECKED_IN"].includes(b.status) && <button className="sm ghost" onClick={async () => setQr({ ...(await api<{ dataUrl: string; qrToken: string }>("GET", `/bookings/${b.id}/qr`)), id: b.id })}>QR</button>}
              {upcoming(b) && <button className="sm ghost" onClick={() => setResched({ id: b.id, start: toLocalInput(new Date(b.startsAt)), end: toLocalInput(new Date(b.endsAt)) })}>Reschedule</button>}
              {upcoming(b) && <button className="sm danger" onClick={() => confirm("Cancel this booking?") && run(() => api("POST", `/bookings/${b.id}/cancel`), "Booking cancelled")}>Cancel</button>}
            </td>
          </tr>))}
          {!rows.length && <tr><td colSpan={4} className="meta">No bookings yet.</td></tr>}
        </tbody></table></div>
      <h2 style={{ marginTop: "1.5rem" }}>My waitlist</h2>
      <div className="card"><table><tbody>
        {wl.map((w) => (<tr key={w.id}><td><b>{w.space.name}</b></td><td>{fmtRange(w.startsAt, w.endsAt)}</td><td><span className={`badge ${w.status}`}>{w.status}</span></td>
          <td>{["WAITING", "NOTIFIED"].includes(w.status) && <button className="sm danger" onClick={() => run(() => api("DELETE", `/waitlist/${w.id}`), "Removed from waitlist")}>Leave</button>}</td></tr>))}
        {!wl.length && <tr><td className="meta">Not on any waitlist.</td></tr>}
      </tbody></table></div>

      {qr && <div className="modal" onClick={() => setQr(null)}><div className="card" onClick={(e) => e.stopPropagation()}>
        <h3>Booking #{qr.id} — check-in QR</h3><img src={qr.dataUrl} alt="QR" /><div className="busy" style={{ wordBreak: "break-all" }}>{qr.qrToken}</div>
        <p className="meta">Check-in opens 10 min before start; unclaimed slots are released 15 min after start.</p><button onClick={() => setQr(null)}>Close</button></div></div>}
      {resched && <div className="modal" onClick={() => setResched(null)}><div className="card" onClick={(e) => e.stopPropagation()} style={{ textAlign: "left" }}>
        <h3>Reschedule booking #{resched.id}</h3>
        <div className="row"><label>From<input type="datetime-local" value={resched.start} onChange={(e) => setResched({ ...resched, start: e.target.value })} /></label>
          <label>Until<input type="datetime-local" value={resched.end} onChange={(e) => setResched({ ...resched, end: e.target.value })} /></label></div>
        <div className="row"><button className="primary" onClick={() => { const r = resched; setResched(null); run(() => api("PATCH", `/bookings/${r.id}`, { startsAt: new Date(r.start).toISOString(), endsAt: new Date(r.end).toISOString() }), "Booking rescheduled"); }}>Save</button><button className="ghost" onClick={() => setResched(null)}>Close</button></div>
      </div></div>}
    </>
  );
}
