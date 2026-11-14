import { useEffect, useMemo, useState } from "react";
import { APP_NAME, apiCall, isConfigured } from "./api";
import { Logo } from "./Brand";
import ThemeToggle from "./Theme";
import "./admin.css";

/* ───────── session (kept only for this browser tab, so closing the tab signs the admin out) ───────── */
const KEY = "qorvena-admin";
const readSession = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch { return null; } };
const saveSession = (s) => { try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } };
const clearSession = () => { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } };

/* ───────── helpers ───────── */
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayOffset = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const startOf = (a) => new Date(`${a.date}T${a.time}:00`);
const fmtWhen = (a) => { const d = startOf(a); return isNaN(d) ? `${a.date} ${a.time}` : `${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(d)} · ${new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(d)}`; };
const fmtDay = (v) => { const d = new Date(v); return isNaN(d) ? "—" : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(d); };
const initials = (name = "") => name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
const statusOf = (a, now) => a.status === "done" ? "done" : startOf(a).getTime() < now - 3600000 ? "missed" : "upcoming";
const STATUS_LABEL = { upcoming: "Upcoming", done: "Done", missed: "Missed" };
const reminderText = (a) => Number(a.remindBefore) < 0 ? "Off" : /^\d{4}-/.test(a.reminderSentAt || "") ? "Sent" : a.reminderSentAt === "skipped" ? "Skipped" : "Scheduled";

/* ───────── demo back end (only used when the site isn't connected to Apps Script) ───────── */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let demo = null;
function makeDemo() {
  const names = ["Maria Santos", "Carlo Reyes", "Anna Dela Cruz", "Jude Jabeguero", "Liza Ramos", "Paolo Mendoza", "Grace Tan", "Ken Villanueva"];
  const users = names.map((fullName, i) => ({ id: `USR-${i + 1}`, fullName, email: `${fullName.toLowerCase().replace(/[^a-z]+/g, ".")}@mail.com`, active: i !== 6, createdAt: new Date(Date.now() - (i * 2.3 + 0.5) * 86400000).toISOString(), appointments: 0 }));
  const titles = ["Dentist check-up", "Project meeting", "Haircut", "Car service", "Doctor visit", "Study session", "Birthday dinner", "Bank appointment"];
  const appointments = Array.from({ length: 22 }, (_, i) => {
    const u = users[(i * 3) % users.length], off = ((i * 5) % 15) - 6, done = off < 0 && i % 3 !== 0;
    return { id: `APT-${i + 1}`, userId: u.id, userName: u.fullName, userEmail: u.email, title: titles[i % titles.length], date: dayOffset(off), time: `${pad(8 + (i % 9))}:${i % 2 ? "30" : "00"}`, timezone: "UTC", remindBefore: i % 5 === 4 ? -1 : 60, status: done ? "done" : "upcoming", notes: "", reminderSentAt: off < 0 ? new Date().toISOString() : "" };
  });
  users.forEach((u) => { u.appointments = appointments.filter((a) => a.userId === u.id).length; });
  return { users, appointments };
}
async function adminApi(action, data, token) {
  if (isConfigured) return apiCall(action, data, token);
  demo = demo || makeDemo();
  await wait(350);
  const copy = (x) => JSON.parse(JSON.stringify(x));
  switch (action) {
    case "adminLogin":
      if (data.email === "admin" && data.password === "admin") return { token: "ADM-demo", expiresAt: "", admin: { id: "ADM-1", fullName: "Demo Admin", email: data.email } };
      throw new Error("Incorrect admin username or password.");
    case "adminLogout": return { status: "ok" };
    case "adminOverview": return { admin: { id: "ADM-1", fullName: "Demo Admin", email: "admin" }, ...copy(demo) };
    case "adminSetUserActive": demo.users.find((u) => u.id === data.id).active = !!data.active; return { id: data.id, active: !!data.active };
    case "adminDeleteUser": demo.users = demo.users.filter((u) => u.id !== data.id); demo.appointments = demo.appointments.filter((a) => a.userId !== data.id); return { status: "deleted" };
    case "adminSendReset": return { message: "Demo mode: no email was sent." };
    case "adminDeleteAppointment": { const a = demo.appointments.find((x) => x.id === data.id); if (a) { const u = demo.users.find((x) => x.id === a.userId); if (u) u.appointments--; } demo.appointments = demo.appointments.filter((x) => x.id !== data.id); return { status: "deleted" }; }
    case "adminSetAppointmentStatus": demo.appointments.find((a) => a.id === data.id).status = data.status; return { id: data.id, status: data.status };
    default: throw new Error("Unknown action.");
  }
}

/* ───────── small pieces ───────── */
function Icon({ name }) {
  const paths = {
    overview: <path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z" />,
    users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" /><path d="M16 5.2a3 3 0 0 1 0 5.6M18.2 14.6c1.6.7 2.6 2.1 2.8 4.4" /></>,
    calendar: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>,
    shield: <path d="M12 3l7.5 3v5.5c0 4.4-3 7.8-7.5 9.5-4.5-1.7-7.5-5.1-7.5-9.5V6L12 3Zm-3 9 2.2 2.2L15.5 10" />,
    refresh: <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />,
    out: <path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" />
  };
  return <svg className="a-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function Toast({ toast, onClose }) {
  useEffect(() => { if (!toast) return; const id = setTimeout(onClose, 4500); return () => clearTimeout(id); }, [toast]);
  if (!toast) return null;
  return <div className={`toast toast-${toast.type}`} role="status" key={toast.id}><span className="toast-icon">{toast.type === "error" ? "!" : "✓"}</span><p>{toast.message}</p><button onClick={onClose} aria-label="Dismiss">×</button></div>;
}

/** Two-tap button for risky actions: first tap asks, second tap does it. */
function Confirm({ label, sure = "Sure?", onConfirm, tone = "danger", disabled }) {
  const [ask, setAsk] = useState(false);
  useEffect(() => { if (!ask) return; const id = setTimeout(() => setAsk(false), 3500); return () => clearTimeout(id); }, [ask]);
  return <button type="button" disabled={disabled} className={`a-btn a-${tone} ${ask ? "is-asking" : ""}`} onClick={() => (ask ? (setAsk(false), onConfirm()) : setAsk(true))}>{ask ? sure : label}</button>;
}

/* ───────── sign in ───────── */
function AdminLogin({ onDone, onExit }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError("");
    try { const r = await adminApi("adminLogin", { email: email.trim().toLowerCase(), password }); const s = { token: r.token, admin: r.admin }; saveSession(s); onDone(s); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <div className="al-shell">
    <div className="al-orb al-orb-a" /><div className="al-orb al-orb-b" />
    <div className="al-top"><ThemeToggle /></div>
    <form className="al-card" onSubmit={submit}>
      <div className="al-badge"><Logo size={46} /><span className="al-shield"><Icon name="shield" /></span></div>
      <h1>Admin portal</h1>
      <p className="muted">Restricted area for {APP_NAME} administrators. This sign-in is separate from the one customers use.</p>
      <div className="ff"><input id="ad-email" type="text" placeholder=" " required autoFocus autoComplete="username" autoCapitalize="none" spellCheck="false" value={email} onChange={(e) => setEmail(e.target.value)} /><label htmlFor="ad-email">Username</label></div>
      <div className="ff ff-pass"><input id="ad-pass" type={show ? "text" : "password"} placeholder=" " required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /><label htmlFor="ad-pass">Password</label><button type="button" className="show-btn" aria-pressed={show} onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button></div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <button className="btn btn-primary btn-block go" disabled={busy || !email || !password}>{busy ? <span className="spinner" /> : null}<span>Sign in to admin</span>{!busy && <span className="go-arrow" aria-hidden="true">→</span>}</button>
      {!isConfigured && <p className="al-hint">Demo mode: use <b>admin</b> / <b>admin</b></p>}
      <button type="button" className="foot-btn al-back" onClick={onExit}><span className="ico" aria-hidden="true">←</span>Back to {APP_NAME}</button>
    </form>
  </div>;
}

/* ───────── overview ───────── */
function Stat({ icon, label, value, hint, tone }) {
  return <div className={`a-stat stat-${tone}`}><span className="stat-icon" aria-hidden="true">{icon}</span><div><strong>{value}</strong><span>{label}</span><small>{hint}</small></div></div>;
}

function Overview({ users, appointments, now }) {
  const s = useMemo(() => {
    const st = { upcoming: 0, done: 0, missed: 0, today: 0, sent: 0 };
    appointments.forEach((a) => { const k = statusOf(a, now); st[k]++; if (k === "upcoming" && a.date === iso(new Date(now))) st.today++; if (/^\d{4}-/.test(a.reminderSentAt || "")) st.sent++; });
    return { ...st, active: users.filter((u) => u.active).length, fresh: users.filter((u) => now - new Date(u.createdAt).getTime() < 7 * 86400000).length };
  }, [users, appointments, now]);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => { const key = dayOffset(i - 6); return { key, n: appointments.filter((a) => a.date === key).length }; }), [appointments]);
  const max = Math.max(1, ...days.map((d) => d.n));
  const total = Math.max(1, s.upcoming + s.done + s.missed);
  const pU = (s.upcoming / total) * 100, pD = (s.done / total) * 100;
  const recent = [...users].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  const top = [...users].sort((a, b) => b.appointments - a.appointments).slice(0, 5);
  return <div className="a-stack">
    <div className="a-stats">
      <Stat icon="👥" label="Total users" value={users.length} hint={`${s.active} active`} tone="teal" />
      <Stat icon="✨" label="New this week" value={s.fresh} hint="Sign-ups in 7 days" tone="blue" />
      <Stat icon="📅" label="Appointments" value={appointments.length} hint={`${s.today} today`} tone="amber" />
      <Stat icon="📧" label="Reminders sent" value={s.sent} hint="Emails delivered" tone="green" />
    </div>
    <div className="a-grid-2">
      <section className="panel"><header className="panel-head"><h3>Appointments by day</h3><span className="muted small">Last 6 days · next 7</span></header>
        <div className="a-bars" role="img" aria-label="Appointments per day">{days.map((d, i) => <div className={`a-bar ${i === 6 ? "is-today" : ""}`} key={d.key} title={`${d.key}: ${d.n}`}><span className="a-bar-n">{d.n || ""}</span><div className="a-track"><i style={{ height: `${Math.max(d.n ? 8 : 3, (d.n / max) * 100)}%` }} /></div><em>{d.key.slice(8)}</em></div>)}</div></section>
      <section className="panel"><header className="panel-head"><h3>Status</h3></header>
        <div className="a-donut-wrap"><div className="a-donut" style={{ "--a": `${pU}%`, "--b": `${pU + pD}%` }}><span><strong>{appointments.length}</strong>total</span></div>
          <ul className="a-legend"><li><i className="l-up" />Upcoming <b>{s.upcoming}</b></li><li><i className="l-done" />Done <b>{s.done}</b></li><li><i className="l-miss" />Missed <b>{s.missed}</b></li></ul></div></section>
    </div>
    <div className="a-grid-2">
      <section className="panel"><header className="panel-head"><h3>Newest members</h3></header><ul className="a-people">{recent.map((u) => <li key={u.id}><span className="avatar">{initials(u.fullName)}</span><div><b>{u.fullName}</b><small>{u.email}</small></div><span className="muted small">{fmtDay(u.createdAt)}</span></li>)}{!recent.length && <li className="muted">No users yet.</li>}</ul></section>
      <section className="panel"><header className="panel-head"><h3>Most active</h3></header><ul className="a-people">{top.map((u) => <li key={u.id}><span className="avatar">{initials(u.fullName)}</span><div><b>{u.fullName}</b><small>{u.email}</small></div><span className="chip chip-info">{u.appointments} appt{u.appointments === 1 ? "" : "s"}</span></li>)}{!top.length && <li className="muted">No users yet.</li>}</ul></section>
    </div>
  </div>;
}

/* ───────── users ───────── */
function Users({ users, query, run, busyId }) {
  const list = users.filter((u) => `${u.fullName} ${u.email}`.toLowerCase().includes(query.toLowerCase()));
  if (!list.length) return <div className="empty"><div className="empty-bell">🔎</div><h3>No users found</h3><p className="muted">{users.length ? "Try a different search." : "Nobody has signed up yet."}</p></div>;
  return <div className="a-table-wrap"><table className="a-table"><thead><tr><th>User</th><th>Joined</th><th>Appointments</th><th>Status</th><th className="r">Actions</th></tr></thead><tbody>
    {list.map((u) => <tr key={u.id} className={u.active ? "" : "is-off"}>
      <td data-label="User"><div className="a-user"><span className="avatar">{initials(u.fullName)}</span><div><b>{u.fullName}</b><small>{u.email}</small></div></div></td>
      <td data-label="Joined">{fmtDay(u.createdAt)}</td>
      <td data-label="Appointments">{u.appointments}</td>
      <td data-label="Status"><span className={`chip ${u.active ? "chip-ok" : "chip-muted"}`}>{u.active ? "Active" : "Deactivated"}</span></td>
      <td className="r a-actions"><button type="button" className="a-btn" disabled={busyId === u.id} onClick={() => run("adminSetUserActive", { id: u.id, active: !u.active }, u.active ? "Account deactivated." : "Account reactivated.", { type: "user-active", id: u.id, value: !u.active })}>{u.active ? "Deactivate" : "Activate"}</button>
        <button type="button" className="a-btn" disabled={busyId === u.id || !u.active} onClick={() => run("adminSendReset", { id: u.id })}>Send reset code</button>
        <Confirm label="Delete" sure="Delete user?" disabled={busyId === u.id} onConfirm={() => run("adminDeleteUser", { id: u.id }, "User and their appointments deleted.", { type: "user-delete", id: u.id })} /></td>
    </tr>)}
  </tbody></table></div>;
}

/* ───────── appointments ───────── */
function Appointments({ appointments, query, filter, now, run, busyId }) {
  const list = appointments.filter((a) => (filter === "all" || statusOf(a, now) === filter) && `${a.title} ${a.userName} ${a.userEmail}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => startOf(b) - startOf(a));
  if (!list.length) return <div className="empty"><div className="empty-bell">📭</div><h3>No appointments found</h3><p className="muted">Try a different search or filter.</p></div>;
  return <div className="a-table-wrap"><table className="a-table"><thead><tr><th>Appointment</th><th>Booked by</th><th>When</th><th>Status</th><th>Reminder</th><th className="r">Actions</th></tr></thead><tbody>
    {list.map((a) => { const st = statusOf(a, now); return <tr key={a.id}>
      <td data-label="Appointment"><b>{a.title}</b>{a.notes && <small>{a.notes}</small>}</td>
      <td data-label="Booked by"><div className="a-user"><span className="avatar sm">{initials(a.userName)}</span><div><b>{a.userName}</b><small>{a.userEmail}</small></div></div></td>
      <td data-label="When">{fmtWhen(a)}</td>
      <td data-label="Status"><span className={`chip ${st === "done" ? "chip-ok" : st === "missed" ? "chip-muted" : "chip-info"}`}>{STATUS_LABEL[st]}</span></td>
      <td data-label="Reminder">{reminderText(a)}</td>
      <td className="r a-actions">{a.status !== "done" && <button type="button" className="a-btn" disabled={busyId === a.id} onClick={() => run("adminSetAppointmentStatus", { id: a.id, status: "done" }, "Marked as done.", { type: "appt-status", id: a.id, value: "done" })}>Mark done</button>}
        <Confirm label="Delete" sure="Delete?" disabled={busyId === a.id} onConfirm={() => run("adminDeleteAppointment", { id: a.id }, "Appointment deleted.", { type: "appt-delete", id: a.id })} /></td>
    </tr>; })}
  </tbody></table></div>;
}

/* ───────── shell ───────── */
const TABS = [["overview", "Overview", "overview"], ["users", "Users", "users"], ["appointments", "Appointments", "calendar"]];

function Dashboard({ session, onSignOut, onExit }) {
  const [tab, setTab] = useState("overview");
  const [data, setData] = useState({ users: [], appointments: [] });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState("");
  const [toast, setToast] = useState(null);
  const [now, setNow] = useState(Date.now());
  const notify = (message, type = "success") => setToast({ message, type, id: Date.now() });

  const load = async (quiet) => {
    if (!quiet) setLoading(true);
    try { const r = await adminApi("adminOverview", {}, session.token); setData({ users: r.users || [], appointments: r.appointments || [] }); setNow(Date.now()); }
    catch (e) { if (/session|sign in|admin access/i.test(e.message)) onSignOut(e.message); else notify(e.message, "error"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const run = async (action, payload, okMessage, patch) => {
    setBusyId(payload.id);
    try {
      const r = await adminApi(action, payload, session.token);
      setData((d) => {
        if (!patch) return d;
        if (patch.type === "user-active") return { ...d, users: d.users.map((u) => u.id === patch.id ? { ...u, active: patch.value } : u) };
        if (patch.type === "user-delete") return { users: d.users.filter((u) => u.id !== patch.id), appointments: d.appointments.filter((a) => a.userId !== patch.id) };
        if (patch.type === "appt-status") return { ...d, appointments: d.appointments.map((a) => a.id === patch.id ? { ...a, status: patch.value } : a) };
        if (patch.type === "appt-delete") { const gone = d.appointments.find((a) => a.id === patch.id); return { users: d.users.map((u) => gone && u.id === gone.userId ? { ...u, appointments: Math.max(0, u.appointments - 1) } : u), appointments: d.appointments.filter((a) => a.id !== patch.id) }; }
        return d;
      });
      notify(okMessage || r?.message || "Done.");
    } catch (e) { if (/session|sign in|admin access/i.test(e.message)) onSignOut(e.message); else notify(e.message, "error"); }
    finally { setBusyId(""); }
  };

  const title = TABS.find((t) => t[0] === tab)[1];
  const change = (t) => { setTab(t); setQuery(""); setFilter("all"); window.scrollTo({ top: 0 }); };

  return <div className="adm">
    <aside className="adm-side">
      <div className="adm-brand"><Logo size={36} /><div><strong>{APP_NAME}</strong><small>Admin portal</small></div></div>
      <nav aria-label="Admin sections">{TABS.map(([key, label, icon]) => <button type="button" key={key} className={tab === key ? "on" : ""} aria-current={tab === key ? "page" : undefined} onClick={() => change(key)}><Icon name={icon} /><span>{label}</span>{key === "users" && <em>{data.users.length}</em>}{key === "appointments" && <em>{data.appointments.length}</em>}</button>)}</nav>
      <button type="button" className="adm-site" onClick={onExit}>← Back to {APP_NAME}</button>
    </aside>
    <div className="adm-main">
      <header className="adm-top">
        <div><h1>{title}</h1><p className="muted">{tab === "overview" ? "How your system is doing right now." : tab === "users" ? "Manage who can use the system." : "Every appointment across all users."}</p></div>
        <div className="adm-tools"><ThemeToggle /><button type="button" className="icon-btn" onClick={() => load(true)} aria-label="Refresh data" title="Refresh"><Icon name="refresh" /></button><span className="adm-me"><span className="avatar">{initials(session.admin.fullName)}</span><span className="adm-me-name">{session.admin.fullName}</span></span><button type="button" className="a-btn a-out" onClick={() => onSignOut()}><Icon name="out" /><span>Sign out</span></button></div>
      </header>
      {tab !== "overview" && <div className="adm-filters"><div className="search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg><input type="search" placeholder={tab === "users" ? "Search name or email…" : "Search title, name or email…"} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search" /></div>
        {tab === "appointments" && <div className="seg" role="group" aria-label="Filter by status">{[["all", "All"], ["upcoming", "Upcoming"], ["done", "Done"], ["missed", "Missed"]].map(([k, l]) => <button type="button" key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}</div>}</div>}
      <main className="adm-body" key={tab}>
        {loading ? <div className="skeletons">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ "--i": i }} />)}</div>
          : tab === "overview" ? <Overview users={data.users} appointments={data.appointments} now={now} />
          : tab === "users" ? <Users users={data.users} query={query} run={run} busyId={busyId} />
          : <Appointments appointments={data.appointments} query={query} filter={filter} now={now} run={run} busyId={busyId} />}
      </main>
    </div>
    <nav className="adm-bottom" aria-label="Admin sections">{TABS.map(([key, label, icon]) => <button type="button" key={key} className={tab === key ? "on" : ""} onClick={() => change(key)}><Icon name={icon} /><span>{label}</span></button>)}</nav>
    <Toast toast={toast} onClose={() => setToast(null)} />
  </div>;
}

export default function Admin({ onExit }) {
  const [session, setSession] = useState(() => (isConfigured ? readSession() : null));
  const [notice, setNotice] = useState("");
  const signOut = (message) => { if (session?.token) adminApi("adminLogout", {}, session.token).catch(() => {}); clearSession(); setSession(null); setNotice(message || ""); };
  useEffect(() => { document.title = `Admin · ${APP_NAME}`; return () => { document.title = `${APP_NAME} · Appointment management`; }; }, []);
  if (!session) return <>{notice && <div className="al-notice" role="alert">{notice}</div>}<AdminLogin onDone={(s) => { setNotice(""); setSession(s); }} onExit={onExit} /></>;
  return <Dashboard session={session} onSignOut={signOut} onExit={onExit} />;
}
