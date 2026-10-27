import { useEffect, useState } from "react";
import { api, fmtRange, toLocalInput } from "../api";
import { useApp } from "../App";

const defStart = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; };

export default function Browse() {
  const { refreshUnread } = useApp();
  const [floors, setFloors] = useState<any[]>([]);
  const [spaces, setSpaces] = useState<any[]>([]);
  const [floorId, setFloorId] = useState("");
  const [type, setType] = useState("");
  const [minCap, setMinCap] = useState("");
  const [start, setStart] = useState(toLocalInput(defStart()));
  const [end, setEnd] = useState(toLocalInput(new Date(+defStart() + 3600000)));
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);

  useEffect(() => { api("GET", "/spaces/floors").then(setFloors); }, []);
  async function load() {
    const p = new URLSearchParams({ start: new Date(start).toISOString(), end: new Date(end).toISOString() });
    if (floorId) p.set("floorId", floorId); if (type) p.set("type", type); if (minCap) p.set("minCapacity", minCap);
    try { setSpaces(await api("GET", "/spaces?" + p)); } catch (e: any) { setMsg({ t: e.message, err: true }); }
  }
  useEffect(() => { if (!isNaN(+new Date(start)) && !isNaN(+new Date(end))) load(); }, [floorId, type, minCap, start, end]);

  const win = () => ({ startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() });
  async function book(s: any) {
    setMsg(null);
    try { await api("POST", "/bookings", { spaceId: s.id, ...win() }); setMsg({ t: `Booked ${s.name}. See "My bookings" for your QR code.` }); refreshUnread(); }
    catch (e: any) { setMsg({ t: e.message, err: true }); }
    load();
  }
  async function wait(s: any) {
    setMsg(null);
    try { const r = await api("POST", "/waitlist", { spaceId: s.id, ...win() }); setMsg({ t: `Joined waitlist for ${s.name} — position ${r.position}.` }); }
    catch (e: any) { setMsg({ t: e.message, err: true }); }
  }

  return (
    <>
      <h1>Find a space</h1>
      <div className="row">
        <label>From<input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label>Until<input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></label>
        <label>Floor<select value={floorId} onChange={(e) => setFloorId(e.target.value)}><option value="">Both floors</option>{floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label>Type<select value={type} onChange={(e) => setType(e.target.value)}><option value="">Cabins &amp; chairs</option><option value="CABIN">Cabins</option><option value="CHAIR">Chairs</option></select></label>
        <label>Min capacity<input type="number" min={1} style={{ width: 90 }} value={minCap} onChange={(e) => setMinCap(e.target.value)} /></label>
      </div>
      {msg && <div className={"msg" + (msg.err ? " err" : "")}>{msg.t}</div>}
      <div className="grid">
        {spaces.map((s) => (
          <div key={s.id} className="card spacecard">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span className="name">{s.name}</span><span className={`badge ${s.state}`}>{s.state.replace("_", " ")}</span>
            </div>
            <div className="meta">{s.floor.name} · {s.type === "CABIN" ? "Cabin" : "Chair"} · seats {s.capacity}</div>
            {s.details && <div className="meta">{s.details}</div>}
            {s.busy.map((b: any, i: number) => <div key={i} className="busy">{b.kind === "BLACKOUT" ? "Blackout" : b.mine ? "Your booking" : "Booked"}: {fmtRange(b.start, b.end)}</div>)}
            <div style={{ marginTop: "auto", paddingTop: 6 }}>
              {s.state === "AVAILABLE" && <button className="primary" onClick={() => book(s)}>Book this slot</button>}
              {s.state === "BOOKED" && <button className="ghost" onClick={() => wait(s)}>Join waitlist</button>}
              {(s.state === "BLACKED_OUT" || s.state === "MAINTENANCE") && <button disabled>Unavailable</button>}
            </div>
          </div>
        ))}
        {!spaces.length && <p className="meta">No spaces match these filters.</p>}
      </div>
    </>
  );
}
