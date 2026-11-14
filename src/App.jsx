import { useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME, apiCall, isConfigured } from "./api";

/* ───────── helpers ───────── */

const REMINDERS = [
  { value: 1440, label: "1 day before" },
  { value: 60, label: "1 hour before" },
  { value: 15, label: "15 minutes before" },
  { value: 180, label: "3 hours before" },
  { value: 2880, label: "2 days before" },
  { value: 0, label: "At the time" },
  { value: -1, label: "No reminder email" }
];
const pad = (n) => String(n).padStart(2, "0");
const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return localIso(d); };
const startOf = (a) => new Date(`${a.date}T${a.time}:00`);
const timeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ""; } };
const roundedNextHour = () => { const d = new Date(Date.now() + 3600000); return `${pad(d.getHours())}:00`; };
const fmtTime = (a) => new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(startOf(a));
const fmtLong = (a) => new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(startOf(a));
const initials = (name = "") => name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
const reminderLabel = (v) => REMINDERS.find((r) => r.value === Number(v))?.label || "";

function relative(a, now) {
  const mins = Math.round((startOf(a).getTime() - now) / 60000);
  if (mins < -60) return "";
  if (mins <= 0) return "happening now";
  if (mins < 60) return `in ${mins} min`;
  if (mins < 1440) return `in ${Math.round(mins / 60)} h`;
  const days = Math.round(mins / 1440);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}
function groupOf(a) {
  const today = localIso(new Date());
  if (a.date === today) return "Today";
  if (a.date === addDays(1)) return "Tomorrow";
  if (a.date <= addDays(7)) return "This week";
  return "Later";
}
function reminderChip(a) {
  if (Number(a.remindBefore) < 0) return { text: "No reminder", tone: "muted" };
  if (/^\d{4}-/.test(a.reminderSentAt || "")) return { text: "Reminder sent", tone: "ok" };
  if (a.reminderSentAt === "skipped") return { text: "Reminder skipped", tone: "muted" };
  return { text: `Email ${reminderLabel(a.remindBefore).toLowerCase()}`, tone: "info" };
}

const SESSION_KEY = "remindly-session";
const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } };
const saveSession = (session, remember) => { try { const store = remember ? localStorage : sessionStorage; (remember ? sessionStorage : localStorage).removeItem(SESSION_KEY); store.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* storage blocked */ } };
const clearSession = () => { try { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } };
const lastEmail = () => { try { return localStorage.getItem("remindly-email") || ""; } catch { return ""; } };
const saveEmail = (e) => { try { localStorage.setItem("remindly-email", e); } catch { /* ignore */ } };

const demoUser = { id: "demo", fullName: "Demo User", email: "you@example.com" };
const demoAppointments = () => [
  { id: "D1", title: "Dentist check-up", date: addDays(1), time: "09:30", remindBefore: 1440, status: "upcoming", notes: "Bring insurance card", reminderSentAt: "" },
  { id: "D2", title: "Project meeting", date: addDays(0), time: `${pad(Math.min(23, new Date().getHours() + 2))}:00`, remindBefore: 60, status: "upcoming", notes: "", reminderSentAt: "" },
  { id: "D3", title: "Car service", date: addDays(5), time: "14:00", remindBefore: 2880, status: "upcoming", notes: "", reminderSentAt: "" }
];

/* ───────── small pieces ───────── */

function Brand() { return <div className="brand"><span className="brand-mark">🔔</span><strong>{APP_NAME}</strong></div>; }

function Toast({ toast, onClose }) {
  useEffect(() => { if (!toast) return; const id = setTimeout(onClose, 5000); return () => clearTimeout(id); }, [toast]);
  if (!toast) return null;
  return <div className={`toast toast-${toast.type}`} role="status" key={toast.id}><span className="toast-icon">{toast.type === "error" ? "!" : "✓"}</span><p>{toast.message}</p><button onClick={onClose} aria-label="Dismiss">×</button></div>;
}

function PasswordField({ label, value, onChange, autoComplete, placeholder }) {
  const [show, setShow] = useState(false);
  return <label>{label}<div className="password-input"><input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} required autoComplete={autoComplete} /><button type="button" onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button></div></label>;
}

/* ───────── sign in / sign up / reset ───────── */

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("signin");           // signin | signup | recovery
  const [step, setStep] = useState(1);                  // recovery: 1 = ask for code, 2 = enter code
  const [name, setName] = useState("");
  const [email, setEmail] = useState(lastEmail);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const go = (next) => { setMode(next); setStep(1); setError(""); setInfo(""); setPassword(""); setCode(""); };
  const run = async (task) => { setBusy(true); setError(""); try { await task(); } catch (e) { setError(e.message); } finally { setBusy(false); } };

  const submit = (event) => {
    event.preventDefault();
    run(async () => {
      const cleanEmail = email.trim().toLowerCase();
      if (mode === "signin") { const r = await apiCall("login", { email: cleanEmail, password }); saveEmail(cleanEmail); onAuth(r, remember, false); }
      else if (mode === "signup") {
        if (name.trim().length < 2) throw new Error("Please enter your name.");
        if (password.length < 8) throw new Error("Your password needs at least 8 characters.");
        const r = await apiCall("register", { fullName: name.trim(), email: cleanEmail, password }); saveEmail(cleanEmail); onAuth(r, remember, true);
      } else if (step === 1) { const r = await apiCall("requestPasswordReset", { email: cleanEmail }); setInfo(r.message); setStep(2); }
      else { const r = await apiCall("resetPassword", { email: cleanEmail, code: code.trim(), password }); setMode("signin"); setStep(1); setPassword(""); setCode(""); setInfo(r.message); }
    });
  };

  const title = mode === "signup" ? "Create your account" : mode === "recovery" ? "Reset your password" : "Welcome back";
  const intro = mode === "signup" ? "Save your appointments and we'll email you a reminder before each one." : mode === "recovery" ? (step === 1 ? "Enter your email and we'll send you a 6-digit code." : "Enter the code we emailed you and choose a new password.") : "Sign in to see your upcoming appointments.";

  return <div className="auth-shell"><div className="blob blob-a" /><div className="blob blob-b" />
    <div className="auth-card"><Brand />
      {mode !== "recovery" && <div className="tabs" role="tablist"><span className="tab-pill" style={{ transform: `translateX(${mode === "signup" ? 100 : 0}%)` }} /><button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => go("signin")}>Sign in</button><button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => go("signup")}>Create account</button></div>}
      <div className="auth-body" key={mode + step}>
        <h1>{title}</h1><p className="muted">{intro}</p>
        <form onSubmit={submit}>
          {mode === "signup" && <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Elena Rodriguez" required autoFocus autoComplete="name" /></label>}
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoFocus={mode === "signin"} readOnly={mode === "recovery" && step === 2} autoComplete="email" /></label>
          {mode === "recovery" && step === 2 && <label>6-digit code<input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" required autoFocus autoComplete="one-time-code" className="code-input" /></label>}
          {(mode !== "recovery" || step === 2) && <PasswordField label={mode === "recovery" ? "New password" : "Password"} value={password} onChange={setPassword} placeholder={mode === "signin" ? "Your password" : "At least 8 characters"} autoComplete={mode === "signin" ? "current-password" : "new-password"} />}
          {mode !== "recovery" && <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /><span className="check-box" />Keep me signed in</label>}
          {info && <div className="alert alert-ok" role="status">{info}</div>}
          {error && <div className="alert alert-error" role="alert">{error}{/already exists/i.test(error) && <> <button type="button" className="link" onClick={() => go("signin")}>Sign in</button></>}</div>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <span className="spinner" /> : null}{mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : step === 1 ? "Send me a code" : "Save new password"}</button>
        </form>
        {mode === "signin" && <button className="link center" onClick={() => go("recovery")}>Forgot your password?</button>}
        {mode === "recovery" && <button className="link center" onClick={() => go("signin")}>← Back to sign in</button>}
      </div>
    </div>
    <div className="auth-side"><h2>Never miss<br />an appointment.</h2><p>Add it once. We'll email you a confirmation now and a reminder just before it starts.</p><ul><li style={{ "--i": 0 }}>📅 Pick the date and time</li><li style={{ "--i": 1 }}>📧 Get an email confirmation</li><li style={{ "--i": 2 }}>🔔 Get reminded on time</li></ul></div>
  </div>;
}

/* ───────── appointment card + form ───────── */

function AppointmentCard({ a, index, now, leaving, confirming, onDone, onEdit, onAskDelete, onDelete, isPast }) {
  const chip = reminderChip(a);
  const d = startOf(a);
  const rel = isPast ? "" : relative(a, now);
  return <article className={`card ${leaving ? "leaving" : ""} ${a.status === "done" ? "is-done" : ""}`} style={{ "--i": index }}>
    <div className="date-badge"><small>{new Intl.DateTimeFormat("en", { month: "short" }).format(d)}</small><strong>{d.getDate()}</strong></div>
    <div className="card-main"><h3>{a.title}</h3><p className="muted">{fmtLong(a).split(",")[0]} · {fmtTime(a)}{rel && <span className="rel"> · {rel}</span>}</p>
      {a.notes && <p className="notes">{a.notes}</p>}
      <div className="chips">{isPast ? <span className={`chip ${a.status === "done" ? "chip-ok" : "chip-muted"}`}>{a.status === "done" ? "✓ Done" : "Missed"}</span> : <span className={`chip chip-${chip.tone}`}>{chip.tone === "ok" ? "✓ " : "📧 "}{chip.text}</span>}</div></div>
    <div className="card-actions">
      {!isPast && <button className="icon-btn good" onClick={() => onDone(a)} title="Mark as done" aria-label="Mark as done">✓</button>}
      <button className="icon-btn" onClick={() => onEdit(a)} title="Edit" aria-label="Edit">✎</button>
      {confirming ? <button className="icon-btn danger sure" onClick={() => onDelete(a)} onBlur={() => onAskDelete(null)} autoFocus>Delete?</button> : <button className="icon-btn danger" onClick={() => onAskDelete(a.id)} title="Delete" aria-label="Delete">🗑</button>}
    </div>
  </article>;
}

function AppointmentForm({ form, setForm, saving, onSubmit, onClose, email }) {
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const quick = [["Today", addDays(0)], ["Tomorrow", addDays(1)], ["Next week", addDays(7)]];
  return <form onSubmit={onSubmit} className="form">
    <label>What's the appointment?<input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Dentist, Team meeting, Haircut" maxLength={120} required autoFocus /></label>
    <div className="field"><span className="label">When</span>
      <div className="quick">{quick.map(([label, value]) => <button type="button" key={label} className={form.date === value ? "on" : ""} onClick={() => set("date", value)}>{label}</button>)}</div>
      <div className="two"><input type="date" aria-label="Date" value={form.date} min={addDays(0)} onChange={(e) => set("date", e.target.value)} required /><input type="time" aria-label="Time" value={form.time} onChange={(e) => set("time", e.target.value)} required /></div></div>
    <label>Remind me by email<select value={form.remindBefore} onChange={(e) => set("remindBefore", Number(e.target.value))}>{REMINDERS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></label>
    <label><span>Notes <span className="muted">(optional)</span></span><textarea rows="2" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Address, things to bring…" /></label>
    {isConfigured && <p className="mail-note">📧 Emails go to <strong>{email}</strong>{form.id ? "" : " — you'll get a confirmation right away."}</p>}
    <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" /> : null}{form.id ? "Save changes" : "Save & remind me"}</button></div>
  </form>;
}

/* ───────── app ───────── */

export default function App() {
  const [session, setSession] = useState(() => (isConfigured ? readSession() : { token: "demo", user: demoUser }));
  const [appointments, setAppointments] = useState(() => (isConfigured ? [] : demoAppointments()));
  const [loading, setLoading] = useState(isConfigured && Boolean(session));
  const [tab, setTab] = useState("upcoming");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [leavingId, setLeavingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [now, setNow] = useState(Date.now());
  const toastId = useRef(0);

  const notify = (message, type = "success") => setToast({ message, type, id: ++toastId.current });
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  useEffect(() => { if (!modal) return; const onKey = (e) => e.key === "Escape" && setModal(false); window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [modal]);

  const signOutLocally = (message) => { clearSession(); setSession(null); setAppointments([]); if (message) setTimeout(() => notify(message, "error"), 0); };
  useEffect(() => {
    if (!isConfigured || !session) return;
    setLoading(true);
    apiCall("listAppointments", {}, session.token)
      .then((r) => setAppointments(r.appointments || []))
      .catch((e) => /session|sign in/i.test(e.message) ? signOutLocally(e.message) : notify(e.message, "error"))
      .finally(() => setLoading(false));
  }, [session?.token]);

  const remote = (action, payload) => isConfigured ? apiCall(action, payload, session.token) : Promise.resolve(null);
  const sorted = useMemo(() => [...appointments].sort((a, b) => startOf(a) - startOf(b)), [appointments]);
  const upcoming = sorted.filter((a) => a.status === "upcoming" && startOf(a).getTime() >= now - 3600000);
  const past = sorted.filter((a) => !upcoming.includes(a)).reverse();
  const next = upcoming[0];
  const hour = new Date(now).getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const handleAuth = (result, remember, isNew) => {
    saveSession({ token: result.token, expiresAt: result.expiresAt, user: result.user }, remember);
    setSession({ token: result.token, user: result.user }); setTab("upcoming");
    notify(isNew ? `Welcome, ${result.user.fullName.split(" ")[0]}! Add your first appointment below.` : `Welcome back, ${result.user.fullName.split(" ")[0]}!`);
  };
  const signOut = () => { if (isConfigured && session?.token) apiCall("logout", {}, session.token).catch(() => {}); clearSession(); setSession(isConfigured ? null : { token: "demo", user: demoUser }); if (isConfigured) setAppointments([]); };

  const openNew = () => { setForm({ id: "", title: "", date: addDays(0), time: roundedNextHour(), remindBefore: 1440, notes: "" }); setModal(true); };
  const openEdit = (a) => { setForm({ ...a, remindBefore: Number(a.remindBefore) }); setModal(true); };

  const save = async (event) => {
    event.preventDefault(); setSaving(true);
    const payload = { ...form, timezone: timeZone() };
    try {
      if (form.id) {
        const r = await remote("updateAppointment", payload);
        const updated = r?.appointment || { ...form, reminderSentAt: "" };
        setAppointments((list) => list.map((a) => a.id === form.id ? updated : a));
        notify(r?.emailSent ? "Saved — we emailed you the new details." : "Appointment updated.");
      } else {
        const r = await remote("createAppointment", payload);
        const created = r?.appointment || { ...form, id: `D${Date.now()}`, status: "upcoming", reminderSentAt: "" };
        setAppointments((list) => [...list, created]); setTab("upcoming");
        notify(!isConfigured ? "Saved (demo mode — no emails are sent)." : r.emailSent ? `Booked! A confirmation is on its way to ${session.user.email}.` : "Booked! (We couldn't send the confirmation email.)");
      }
      setModal(false);
    } catch (e) { notify(e.message, "error"); } finally { setSaving(false); }
  };

  const withExit = (id, task) => { setLeavingId(id); setTimeout(async () => { await task(); setLeavingId(null); }, 260); };
  const markDone = (a) => withExit(a.id, async () => { try { await remote("updateAppointment", { ...a, status: "done" }); setAppointments((l) => l.map((x) => x.id === a.id ? { ...x, status: "done" } : x)); notify("Nice — marked as done."); } catch (e) { notify(e.message, "error"); } });
  const remove = (a) => { setConfirmId(null); withExit(a.id, async () => { try { await remote("deleteAppointment", { id: a.id }); setAppointments((l) => l.filter((x) => x.id !== a.id)); notify("Appointment deleted."); } catch (e) { notify(e.message, "error"); } }); };

  if (isConfigured && !session) return <AuthScreen onAuth={handleAuth} />;

  const list = tab === "upcoming" ? upcoming : past;
  const groups = tab === "upcoming" ? ["Today", "Tomorrow", "This week", "Later"].map((g) => [g, list.filter((a) => groupOf(a) === g)]).filter(([, items]) => items.length) : [["", list]];
  let counter = 0;

  return <div className="app">
    <header className="topbar"><Brand /><div className="user"><span className="avatar">{initials(session.user.fullName)}</span><span className="user-name">{session.user.fullName}</span>{isConfigured && <button className="link" onClick={signOut}>Sign out</button>}</div></header>
    {!isConfigured && <div className="demo-banner">Demo mode — connect the backend to save appointments and send emails.</div>}
    <main className="content">
      <section className="hero"><div><p className="muted">{greeting}, {session.user.fullName.split(" ")[0]} 👋</p>
        {next ? <><h1>Next up: {next.title}</h1><p className="hero-when"><span className="bell">🔔</span>{fmtLong(next)} at {fmtTime(next)} <b>{relative(next, now)}</b></p></> : <><h1>Nothing coming up</h1><p className="hero-when">Add an appointment and we'll remind you by email.</p></>}</div>
        <button className="btn btn-primary btn-lg" onClick={openNew}><span className="plus">+</span> New appointment</button></section>

      <div className="tabs tabs-wide" role="tablist"><span className="tab-pill" style={{ transform: `translateX(${tab === "past" ? 100 : 0}%)` }} /><button role="tab" aria-selected={tab === "upcoming"} onClick={() => setTab("upcoming")}>Upcoming <em>{upcoming.length}</em></button><button role="tab" aria-selected={tab === "past"} onClick={() => setTab("past")}>Past <em>{past.length}</em></button></div>

      {loading ? <div className="skeletons">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ "--i": i }} />)}</div>
        : !list.length ? <div className="empty" key={tab}><div className="empty-bell">🔔</div><h3>{tab === "upcoming" ? "You're all clear" : "No past appointments yet"}</h3><p className="muted">{tab === "upcoming" ? "Tap “New appointment” to add one — we'll remind you by email." : "Finished and missed appointments show up here."}</p>{tab === "upcoming" && <button className="btn btn-primary" onClick={openNew}>Add your first appointment</button>}</div>
        : <div className="list" key={tab}>{groups.map(([label, items]) => <div className="group" key={label || "all"}>{label && <h2 className="group-title">{label}</h2>}{items.map((a) => <AppointmentCard key={a.id} a={a} index={counter++} now={now} isPast={tab === "past"} leaving={leavingId === a.id} confirming={confirmId === a.id} onDone={markDone} onEdit={openEdit} onAskDelete={setConfirmId} onDelete={remove} />)}</div>)}</div>}
    </main>
    <button className="fab" onClick={openNew} aria-label="New appointment">+</button>
    {modal && form && <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && setModal(false)}><div className="modal" role="dialog" aria-modal="true" aria-label={form.id ? "Edit appointment" : "New appointment"}><div className="modal-head"><h2>{form.id ? "Edit appointment" : "New appointment"}</h2><button className="icon-btn" onClick={() => setModal(false)} aria-label="Close">×</button></div><AppointmentForm form={form} setForm={setForm} saving={saving} onSubmit={save} onClose={() => setModal(false)} email={session.user.email} /></div></div>}
    <Toast toast={toast} onClose={() => setToast(null)} />
  </div>;
}
