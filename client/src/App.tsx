import { useEffect, useState, createContext, useContext, useCallback } from "react";
import { NavLink, Route, Routes, Navigate, useNavigate } from "react-router-dom";
import { api, setToken, type User } from "./api";
import Auth from "./pages/Auth";
import Browse from "./pages/Browse";
import MyBookings from "./pages/MyBookings";
import Notifications from "./pages/Notifications";
import Admin from "./pages/Admin";

const Ctx = createContext<{ user: User; unread: number; refreshUnread: () => void }>(null as any);
export const useApp = () => useContext(Ctx);

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    api("GET", "/auth/me").then((r) => setUser(r.user)).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);
  const refreshUnread = useCallback(() => {
    api("GET", "/notifications").then((n: any[]) => setUnread(n.filter((x) => !x.read).length)).catch(() => {});
  }, []);
  useEffect(() => {
    if (!user) return;
    refreshUnread();
    const t = setInterval(refreshUnread, 30000);
    return () => clearInterval(t);
  }, [user, refreshUnread]);

  if (!ready) return null;
  if (!user) return <Auth onAuth={(t, u) => { setToken(t); setUser(u); navigate(u.role === "ADMIN" ? "/admin" : "/"); }} />;

  return (
    <Ctx.Provider value={{ user, unread, refreshUnread }}>
      <header className="top">
        <div className="brand"><small>Manipal University Jaipur</small>Knowledge Centre</div>
        <nav>
          <NavLink to="/" end>Book a space</NavLink>
          <NavLink to="/my">My bookings</NavLink>
          <NavLink to="/notifications">Notifications{unread > 0 && <span className="dot">{unread}</span>}</NavLink>
          {user.role === "ADMIN" && <NavLink to="/admin">Admin</NavLink>}
        </nav>
        <div className="who">{user.name} · {user.role.toLowerCase()}<button className="ghost sm" onClick={() => { setToken(null); setUser(null); }}>Sign out</button></div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Browse />} />
          <Route path="/my" element={<MyBookings />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/admin" element={user.role === "ADMIN" ? <Admin /> : <Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </Ctx.Provider>
  );
}
