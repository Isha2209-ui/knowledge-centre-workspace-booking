import { useState } from "react";
import { api, type User } from "../api";

export default function Auth({ onAuth }: { onAuth: (t: string, u: User) => void }) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [f, setF] = useState({ name: "", email: "", password: "", role: "STUDENT", token: "" });
  const [msg, setMsg] = useState<{ t: string; err?: boolean } | null>(null);
  const [resetStage, setResetStage] = useState(false);
  const [loginRole, setLoginRole] = useState<"STUDENT" | "FACULTY" | "ADMIN">("STUDENT");
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      if (mode === "login") { const r = await api("POST", "/auth/login", { email: f.email, password: f.password, role: loginRole }); onAuth(r.token, r.user); }
      else if (mode === "register") { const r = await api("POST", "/auth/register", f); onAuth(r.token, r.user); }
      else if (!resetStage) {
        const r = await api("POST", "/auth/forgot-password", { email: f.email });
        setMsg({ t: r.message + (r.devToken ? ` (dev token auto-filled)` : "") });
        if (r.devToken) setF({ ...f, token: r.devToken });
        setResetStage(true);
      } else {
        const r = await api("POST", "/auth/reset-password", { token: f.token, password: f.password });
        setMsg({ t: r.message + " - you can sign in now." }); setMode("login"); setResetStage(false);
      }
    } catch (er: any) { setMsg({ t: er.message, err: true }); }
  }
  return (
    <div className="auth card">
      <h1>Knowledge Centre</h1>
      <p className="meta">Cabin &amp; workspace booking</p>
      {msg && <div className={"msg" + (msg.err ? " err" : "")}>{msg.t}</div>}
      {mode === "login" && (
        <div className="tabs">
          {([["STUDENT", "Student"], ["FACULTY", "Faculty"], ["ADMIN", "Admin"]] as const).map(([r, label]) => (
            <button key={r} type="button" className={loginRole === r ? "on" : ""} onClick={() => setLoginRole(r)}>{label}</button>
          ))}
        </div>
      )}
      <form onSubmit={submit}>
        {mode === "register" && <label>Full name<input required value={f.name} onChange={set("name")} /></label>}
        <label>Email<input required type="email" value={f.email} onChange={set("email")} /></label>
        {mode === "forgot" && resetStage && <label>Reset token<input required value={f.token} onChange={set("token")} /></label>}
        {(mode !== "forgot" || resetStage) && <label>{mode === "forgot" ? "New password" : "Password"}<input required type="password" minLength={8} value={f.password} onChange={set("password")} /></label>}
        {mode === "register" && <label>I am a<select value={f.role} onChange={set("role")}><option value="STUDENT">Student</option><option value="FACULTY">Faculty member</option></select></label>}
        <button className="primary">{mode === "login" ? "Sign in" : mode === "register" ? "Create account" : resetStage ? "Set new password" : "Send reset token"}</button>
      </form>
      <p className="meta">
        {mode !== "login" && <a href="#" onClick={(e) => { e.preventDefault(); setMode("login"); setResetStage(false); }}>Back to sign in</a>}
        {mode === "login" && <><a href="#" onClick={(e) => { e.preventDefault(); setMode("register"); }}>Create account</a> · <a href="#" onClick={(e) => { e.preventDefault(); setMode("forgot"); }}>Forgot password?</a></>}
      </p>
      <p className="meta">Demo: student@muj.test / faculty@muj.test / admin@muj.test — Password123!</p>
    </div>
  );
}
