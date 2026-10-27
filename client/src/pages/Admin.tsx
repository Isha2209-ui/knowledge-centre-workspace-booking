import { useEffect, useState } from "react";
import { api, fmtRange, toLocalInput } from "../api";
import AdminOverview from "./AdminOverview";

type Msg = { t: string; err?: boolean } | null;
const TABS = ["Overview", "Spaces", "Rules", "Blackouts", "Bookings", "Reports", "Audit log", "Users"] as const;

export default function Admin() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [msg, setMsg] = useState<Msg>(null);
  const run = async (fn: () => Promise<any>, ok: string, after?: () => void) => {
    setMsg(null);
    try { await fn(); setMsg({ t: ok }); } catch (e: any) { setMsg({ t: e.message, err: true }); }
    after?.();
  };
  return (
    <>
      <h1>Administration</h1>
      <div className="tabs">{TABS.map((t) => <button key={t} className={t === tab ? "on" : ""} onClick={() => { setTab(t); setMsg(null); }}>{t}</button>)}</div>
      {msg && <div className={"msg" + (msg.err ? " err" : "")}>{msg.t}</div>}
      {tab === "Overview" && <AdminOverview run={run} />}
      {tab === "Spaces" && <Spaces run={run} />}
      {tab === "Rules" && <Rules run={run} />}
      {tab === "Blackouts" && <Blackouts run={run} />}
      {tab === "Bookings" && <Bookings run={run} />}
      {tab === "Reports" && <Reports />}
      {tab === "Audit log" && <Audit />}
      {tab === "Users" && <Users run={run} />}
    </>
  );
}
type P = { run: (fn: () => Promise<any>, ok: string, after?: () => void) => void };

function Spaces({ run }: P) {
  const [floors, setFloors] = useState<any[]>([]);
  const [spaces, setSpaces] = useState<any[]>([]);
  const [n, setN] = useState({ floorId: "", name: "", type: "CABIN", capacity: 4, details: "" });
  const [nf, setNf] = useState({ number: "", name: "" });
  const load = () => { api("GET", "/spaces/floors").then(setFloors); api("GET", "/spaces").then(setSpaces); };
  useEffect(load, []);
  return (
    <>
      <h2>Floors</h2>
      <div className="row">{floors.map((f) => (
        <div key={f.id} className="card" style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <b>{f.name}</b><span className={`badge ${f.active ? "AVAILABLE" : "MAINTENANCE"}`}>{f.active ? "open" : "closed"}</span>
          <button className="sm ghost" onClick={() => run(() => api("PATCH", `/spaces/floors/${f.id}`, { active: !f.active }), "Floor updated", load)}>{f.active ? "Close" : "Open"}</button>
        </div>))}
        <div className="row" style={{ margin: 0 }}>
          <label>Floor no.<input type="number" style={{ width: 80 }} value={nf.number} onChange={(e) => setNf({ ...nf, number: e.target.value })} /></label>
          <label>Name<input value={nf.name} onChange={(e) => setNf({ ...nf, name: e.target.value })} /></label>
          <button className="primary" onClick={() => run(() => api("POST", "/spaces/floors", { number: Number(nf.number), name: nf.name }), "Floor added", load)}>Add floor</button>
        </div>
      </div>
      <h2>Add cabin / chair</h2>
      <div className="row">
        <label>Floor<select value={n.floorId} onChange={(e) => setN({ ...n, floorId: e.target.value })}><option value="">Select…</option>{floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label>Name<input value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} /></label>
        <label>Type<select value={n.type} onChange={(e) => setN({ ...n, type: e.target.value })}><option value="CABIN">Cabin</option><option value="CHAIR">Chair</option></select></label>
        <label>Capacity<input type="number" min={1} style={{ width: 80 }} value={n.capacity} onChange={(e) => setN({ ...n, capacity: Number(e.target.value) })} /></label>
        <label>Details<input value={n.details} onChange={(e) => setN({ ...n, details: e.target.value })} /></label>
        <button className="primary" disabled={!n.floorId || !n.name} onClick={() => run(() => api("POST", "/spaces", { ...n, floorId: Number(n.floorId), details: n.details || undefined }), "Space added", load)}>Add</button>
      </div>
      <div className="card"><table><thead><tr><th>Name</th><th>Floor</th><th>Type</th><th>Cap.</th><th>Status</th><th></th></tr></thead><tbody>
        {spaces.map((s) => (<tr key={s.id}><td><b>{s.name}</b></td><td>{s.floor.name}</td><td>{s.type}</td><td>{s.capacity}</td><td><span className={`badge ${s.status === "ACTIVE" ? "AVAILABLE" : "MAINTENANCE"}`}>{s.status}</span></td>
          <td style={{ display: "flex", gap: 6 }}>
            <button className="sm ghost" onClick={() => run(() => api("PATCH", `/spaces/${s.id}`, { status: s.status === "ACTIVE" ? "MAINTENANCE" : "ACTIVE" }), "Status updated", load)}>{s.status === "ACTIVE" ? "Block (maintenance)" : "Reactivate"}</button>
            <button className="sm danger" onClick={() => confirm(`Delete ${s.name}?`) && run(() => api("DELETE", `/spaces/${s.id}`), "Space removed", load)}>Delete</button></td></tr>))}
      </tbody></table></div>
    </>
  );
}

function Rules({ run }: P) {
  const [rules, setRules] = useState<any[]>([]);
  const load = () => api("GET", "/rules").then(setRules);
  useEffect(() => { load(); }, []);
  const upd = (i: number, k: string, v: number) => setRules(rules.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="card"><table><thead><tr><th>Role</th><th>Max duration (min)</th><th>Advance window (days)</th><th>Max active bookings</th><th></th></tr></thead><tbody>
      {rules.map((r, i) => (<tr key={r.id}><td><b>{r.role}</b></td>
        {(["maxDurationMin", "advanceDays", "maxActive"] as const).map((k) => <td key={k}><input type="number" min={1} style={{ width: 100 }} value={r[k]} onChange={(e) => upd(i, k, Number(e.target.value))} /></td>)}
        <td><button className="primary sm" onClick={() => run(() => api("PUT", `/rules/${r.role}`, { maxDurationMin: r.maxDurationMin, advanceDays: r.advanceDays, maxActive: r.maxActive }), `${r.role} rule saved`, load)}>Save</button></td></tr>))}
    </tbody></table></div>
  );
}

function Blackouts({ run }: P) {
  const [rows, setRows] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [spaces, setSpaces] = useState<any[]>([]);
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0);
  const [f, setF] = useState({ target: "", start: toLocalInput(d), end: toLocalInput(new Date(+d + 4 * 3600000)), reason: "" });
  const load = () => api("GET", "/blackouts").then(setRows);
  useEffect(() => { load(); api("GET", "/spaces/floors").then(setFloors); api("GET", "/spaces").then(setSpaces); }, []);
  const submit = () => {
    const [kind, id] = f.target.split(":");
    run(() => api("POST", "/blackouts", { [kind === "f" ? "floorId" : "spaceId"]: Number(id), startsAt: new Date(f.start).toISOString(), endsAt: new Date(f.end).toISOString(), reason: f.reason || undefined }), "Blackout created", load);
  };
  return (
    <>
      <div className="row">
        <label>Applies to<select value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })}><option value="">Select…</option>
          <optgroup label="Whole floor">{floors.map((x) => <option key={x.id} value={`f:${x.id}`}>{x.name}</option>)}</optgroup>
          <optgroup label="Single space">{spaces.map((x) => <option key={x.id} value={`s:${x.id}`}>{x.name}</option>)}</optgroup></select></label>
        <label>From<input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
        <label>Until<input type="datetime-local" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
        <label>Reason<input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
        <button className="primary" disabled={!f.target} onClick={submit}>Add blackout</button>
      </div>
      <div className="card"><table><thead><tr><th>Target</th><th>Period</th><th>Reason</th><th></th></tr></thead><tbody>
        {rows.map((b) => (<tr key={b.id}><td>{b.space?.name ?? b.floor?.name}</td><td>{fmtRange(b.startsAt, b.endsAt)}</td><td>{b.reason}</td><td><button className="sm danger" onClick={() => run(() => api("DELETE", `/blackouts/${b.id}`), "Blackout removed", load)}>Remove</button></td></tr>))}
        {!rows.length && <tr><td className="meta" colSpan={4}>No blackout periods.</td></tr>}</tbody></table></div>
    </>
  );
}

function Bookings({ run }: P) {
  const [rows, setRows] = useState<any[]>([]);
  const [q, setQ] = useState(""); const [status, setStatus] = useState("");
  const load = () => { const p = new URLSearchParams(); if (q) p.set("q", q); if (status) p.set("status", status); api("GET", "/bookings/all?" + p).then(setRows); };
  useEffect(load, [q, status]);
  return (
    <>
      <div className="row"><label>Search user<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="name or email" /></label>
        <label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{["CONFIRMED", "CHECKED_IN", "CANCELLED", "NO_SHOW", "COMPLETED"].map((s) => <option key={s}>{s}</option>)}</select></label></div>
      <div className="card"><table><thead><tr><th>#</th><th>User</th><th>Space</th><th>When</th><th>Status</th><th></th></tr></thead><tbody>
        {rows.map((b) => (<tr key={b.id}><td>{b.id}</td><td>{b.user.name}<div className="meta">{b.user.email}</div></td><td>{b.space.name}</td><td>{fmtRange(b.startsAt, b.endsAt)}</td><td><span className={`badge ${b.status}`}>{b.status}</span></td><td>{["CONFIRMED", "CHECKED_IN"].includes(b.status) && new Date(b.startsAt) > new Date() && <button className="sm danger" onClick={() => confirm(`Cancel booking #${b.id}?`) && run(() => api("POST", `/bookings/${b.id}/cancel`), "Booking cancelled", load)}>Cancel</button>}</td></tr>))}
      </tbody></table></div>
    </>
  );
}

function Reports() {
  const [r, setR] = useState<any>(null);
  const [days, setDays] = useState(30);
  useEffect(() => { api("GET", `/reports/utilization?from=${encodeURIComponent(new Date(Date.now() - days * 86400000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 30 * 86400000).toISOString())}`).then(setR); }, [days]);
  if (!r) return null;
  const max = Math.max(1, ...r.bySpace.map((s: any) => s.hours));
  return (
    <>
      <div className="row"><label>Look back<select value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></label>
        <div className="card">Total bookings <b>{r.totalBookings}</b> · Used <b>{r.usedBookings}</b> · {Object.entries(r.statusCounts).map(([k, v]) => `${k}: ${v}`).join(" · ")}</div></div>
      <div className="grid"><div className="card"><h3>Space utilisation (hours booked)</h3>
        {r.bySpace.map((s: any) => (<div key={s.spaceId} style={{ marginBottom: 8 }}><div style={{ display: "flex", justifyContent: "space-between" }}><span>{s.name}</span><span className="meta">{s.hours.toFixed(1)} h · {s.bookings} bookings</span></div><div className="bar"><i style={{ width: `${(s.hours / max) * 100}%` }} /></div></div>))}
        {!r.bySpace.length && <p className="meta">No data in range.</p>}</div>
        <div className="card"><h3>Bookings per day</h3><table><tbody>{r.byDay.map((d: any) => <tr key={d.date}><td>{d.date}</td><td>{d.count}</td></tr>)}</tbody></table></div>
        <div className="card"><h3>Most frequent users</h3><table><tbody>{r.topUsers.map((u: any, i: number) => <tr key={i}><td>{u.name}</td><td>{u.bookings}</td></tr>)}</tbody></table></div></div>
    </>
  );
}

function Audit() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api("GET", "/audit-logs").then(setRows); }, []);
  return (<div className="card"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead><tbody>
    {rows.map((a) => (<tr key={a.id}><td className="busy">{new Date(a.createdAt).toLocaleString()}</td><td>{a.actor?.name ?? "system"}</td><td><span className="badge BOOKED">{a.action}</span></td><td>{a.entity} #{a.entityId}</td></tr>))}</tbody></table></div>);
}

function Users({ run }: P) {
  const [rows, setRows] = useState<any[]>([]);
  const load = () => api("GET", "/users").then(setRows);
  useEffect(() => { load(); }, []);
  return (<div className="card"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th></tr></thead><tbody>
    {rows.map((u) => (<tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td><select value={u.role} onChange={(e) => run(() => api("PATCH", `/users/${u.id}/role`, { role: e.target.value }), "Role updated", load)}>{["STUDENT", "FACULTY", "ADMIN"].map((r) => <option key={r}>{r}</option>)}</select></td></tr>))}</tbody></table></div>);
}
