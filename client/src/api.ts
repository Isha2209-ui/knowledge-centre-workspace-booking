export type Role = "STUDENT" | "FACULTY" | "ADMIN";
export type User = { id: number; name: string; email: string; role: Role };

let token: string | null = localStorage.getItem("kc_token");
export const setToken = (t: string | null) => {
  token = t;
  t ? localStorage.setItem("kc_token", t) : localStorage.removeItem("kc_token");
};

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.details ? `${data.error}: ${data.details.join("; ")}` : data.error || `Request failed (${r.status})`);
  return data as T;
}

export const fmtRange = (s: string, e: string) => {
  const a = new Date(s), b = new Date(e);
  return `${a.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · ${a.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}–${b.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};
export const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
