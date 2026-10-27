import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../App";

export default function Notifications() {
  const { refreshUnread } = useApp();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { api("GET", "/notifications").then(setRows).then(() => api("POST", "/notifications/read")).then(refreshUnread); }, []);
  return (
    <>
      <h1>Notifications</h1>
      <div className="card"><table><tbody>
        {rows.map((n) => (<tr key={n.id} style={{ fontWeight: n.read ? 400 : 600 }}><td className="busy">{new Date(n.sentAt).toLocaleString()}</td><td><span className="badge BOOKED">{n.type.replace(/_/g, " ")}</span></td><td>{n.message}</td></tr>))}
        {!rows.length && <tr><td className="meta">Nothing yet.</td></tr>}
      </tbody></table></div>
      <p className="meta">Emails are simulated: each notification is also printed to the server console (no SMTP configured).</p>
    </>
  );
}
