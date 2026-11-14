import { useEffect, useMemo, useRef, useState } from "react";
import { APP_NAME, apiCall, isConfigured } from "./api";
import Brand, { Logo } from "./Brand";
import About from "./About";
import Admin from "./Admin";
import ThemeToggle from "./Theme";
import { StatTiles, MiniCalendar, QuickBook, ReminderCard, Tips } from "./Dash";

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

const SESSION_KEY = "qorvena-session";
const readSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } };
const saveSession = (session, remember) => { try { const store = remember ? localStorage : sessionStorage; (remember ? sessionStorage : localStorage).removeItem(SESSION_KEY); store.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* storage blocked */ } };
const clearSession = () => { try { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } };
const lastEmail = () => { try { return localStorage.getItem("qorvena-email") || ""; } catch { return ""; } };
const saveEmail = (e) => { try { localStorage.setItem("qorvena-email", e); } catch { /* ignore */ } };

const demoUser = { id: "demo", fullName: "Demo User", email: "you@example.com" };
const demoAppointments = () => [
  { id: "D1", title: "Dentist check-up", date: addDays(1), time: "09:30", remindBefore: 1440, status: "upcoming", notes: "Bring insurance card", reminderSentAt: "" },
  { id: "D2", title: "Project meeting", date: addDays(0), time: `${pad(Math.min(23, new Date().getHours() + 2))}:00`, remindBefore: 60, status: "upcoming", notes: "", reminderSentAt: "" },
  { id: "D3", title: "Car service", date: addDays(5), time: "14:00", remindBefore: 2880, status: "upcoming", notes: "", reminderSentAt: "" }
];

/* ───────── small pieces ───────── */


function Toast({ toast, onClose }) {
  useEffect(() => { if (!toast) return; const id = setTimeout(onClose, 5000); return () => clearTimeout(id); }, [toast]);
  if (!toast) return null;
  return <div className={`toast toast-${toast.type}`} role="status" key={toast.id}><span className="toast-icon">{toast.type === "error" ? "!" : "✓"}</span><p>{toast.message}</p><button onClick={onClose} aria-label="Dismiss">×</button></div>;
}

const strengthOf = (pw) => {
  if (pw.length < 8) return 0;
  let s = 1;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && (/[^A-Za-z0-9]/.test(pw) || pw.length >= 10)) s++;
  return Math.min(4, s);
};
const STRENGTH_LABELS = ["Too short", "Weak", "Okay", "Good", "Strong"];

function Check() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>; }

/** One stop on the trail: a node on the vein line + its field. The line fills in as each step is completed. */
function TrailRow({ ok, children, end, active }) {
  return <div className={`trail-row ${ok ? "ok" : ""} ${end ? "final" : ""} ${active ? "active" : ""}`}><span className="node" aria-hidden="true"><Check /></span><div className="trail-body">{children}</div></div>;
}

function Field({ id, label, ...input }) {
  return <div className="ff"><input id={id} placeholder=" " required {...input} /><label htmlFor={id}>{label}</label></div>;
}

function PasswordField({ id, label, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return <div className="ff ff-pass"><input id={id} type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder=" " required autoComplete={autoComplete} /><label htmlFor={id}>{label}</label><button type="button" className="show-btn" aria-pressed={show} aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow(!show)}>{show ? "Hide" : "Show"}</button></div>;
}

/* ───────── sign in / sign up / reset ───────── */

function AuthScreen({ onAuth, onAbout, onTeam, onAdmin }) {
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
  const [wait, setWait] = useState(0);                  // seconds until "Send a new code" is available

  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const go = (next) => { setMode(next); setStep(1); setError(""); setInfo(""); setPassword(""); setCode(""); setWait(0); };
  const resend = () => run(async () => { const r = await apiCall("requestPasswordReset", { email: email.trim().toLowerCase() }); setInfo(r.message); setWait(45); });
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
      } else if (step === 1) { const r = await apiCall("requestPasswordReset", { email: cleanEmail }); setInfo(r.message); setStep(2); setWait(45); }
      else { const r = await apiCall("resetPassword", { email: cleanEmail, code: code.trim(), password }); setMode("signin"); setStep(1); setPassword(""); setCode(""); setInfo(r.message); }
    });
  };

  const title = mode === "signup" ? "Create your account" : mode === "recovery" ? "Reset your password" : "Welcome back";
  const intro = mode === "signup" ? "Takes about 20 seconds. We'll email you a reminder before each appointment." : mode === "recovery" ? (step === 1 ? "Enter your email and we'll send you a 6-digit code." : "Enter the code we emailed you and choose a new password.") : "Pick up where you left off.";

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const showPass = mode !== "recovery" || step === 2;
  const passOk = mode === "signin" ? password.length > 0 : password.length >= 8;
  const strength = strengthOf(password);
  const checks = [];
  if (mode === "signup") checks.push(name.trim().length >= 2);
  checks.push(emailOk);
  if (mode === "recovery" && step === 2) checks.push(code.length === 6);
  if (showPass) checks.push(passOk);
  const allOk = checks.every(Boolean);
  const label = mode === "signin" ? "Sign in" : mode === "signup" ? "Create my account" : step === 1 ? "Send me a code" : "Save new password";

  return <div className="auth-shell"><div className="blob blob-a" /><div className="blob blob-b" /><div className="auth-theme"><ThemeToggle /></div>
    <div className="auth-card spot"><Brand />
      {mode !== "recovery" && <div className="tabs" role="tablist"><span className="tab-pill" style={{ transform: `translateX(${mode === "signup" ? 100 : 0}%)` }} /><button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => go("signin")}>Sign in</button><button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => go("signup")}>Create account</button></div>}
      <div className="auth-body" key={mode + step}>
        <h1>{title}</h1><p className="muted">{intro}</p>
        <form onSubmit={submit} className="trail">
          {mode === "signup" && <TrailRow ok={name.trim().length >= 2}><Field id="f-name" label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="name" /></TrailRow>}
          <TrailRow ok={emailOk}><Field id="f-email" label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus={mode === "signin"} readOnly={mode === "recovery" && step === 2} autoComplete="email" inputMode="email" /></TrailRow>
          {mode === "recovery" && step === 2 && <TrailRow ok={code.length === 6}><Field id="f-code" label="6-digit code" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus autoComplete="one-time-code" className="code-input" /></TrailRow>}
          {showPass && <TrailRow ok={passOk}>
            <PasswordField id="f-pass" label={mode === "recovery" ? "New password" : "Password"} value={password} onChange={setPassword} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
            {mode !== "signin" && <div className="meter" data-level={strength} aria-live="polite"><span><i /><i /><i /><i /></span><small>{password ? STRENGTH_LABELS[strength] : "Use 8+ characters"}</small></div>}
            {mode !== "recovery" && <div className="trail-meta"><label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /><span className="check-box" />Keep me signed in</label>{mode === "signin" && <button type="button" className="link" onClick={() => go("recovery")}>Forgot password?</button>}</div>}
          </TrailRow>}
          <TrailRow end ok={allOk && !busy}><button className="btn btn-primary btn-block go" disabled={busy}>{busy ? <span className="spinner" /> : null}<span>{label}</span>{!busy && <span className="go-arrow" aria-hidden="true">→</span>}</button>
            {info && <div className="alert alert-ok" role="status">{info}</div>}
            {error && <div className="alert alert-error" role="alert">{error}{/already exists/i.test(error) && <> <button type="button" className="link" onClick={() => go("signin")}>Sign in</button></>}</div>}
          </TrailRow>
        </form>
        {mode === "recovery" && step === 2 && <p className="resend muted">Didn't get it? Check Spam, then <button type="button" className="link" disabled={busy || wait > 0} onClick={resend}>{wait > 0 ? `send a new code in ${wait}s` : "send a new code"}</button></p>}
        {mode === "recovery" && <button className="link center" onClick={() => go("signin")}>← Back to sign in</button>}
        <div className="auth-extra">
          <button type="button" className="foot-btn" onClick={onAbout}><span className="ico" aria-hidden="true">✦</span>Discover {APP_NAME} &amp; its meaning<span className="arr" aria-hidden="true">→</span></button>
          <button type="button" className="foot-btn auth-team-mobile" onClick={onTeam}><span className="ico" aria-hidden="true">👥</span>Meet our team<span className="arr" aria-hidden="true">→</span></button>
        </div>
      </div>
    </div>
    <div className="auth-side"><h2>Never miss<br />an appointment.</h2><p>Add it once. We'll email you a confirmation now and a friendly reminder just before it starts.</p>
      <div className="notifs" aria-hidden="true">
        <div className="notif n1"><Logo size={34} /><div><b>{APP_NAME} <em>now</em></b><span>⏰ Dentist check-up is tomorrow (9:30 AM)</span></div></div>
        <div className="notif n2"><Logo size={34} /><div><b>{APP_NAME} <em>2m ago</em></b><span>✅ Booked: Project meeting</span></div></div>
      </div>
      <ul><li style={{ "--i": 0 }}>📅 Pick the date and time</li><li style={{ "--i": 1 }}>📧 Get an email confirmation</li><li style={{ "--i": 2 }}>🔔 Get reminded on time</li></ul>
      <button type="button" className="foot-btn foot-btn-side" onClick={onTeam}><span className="ico" aria-hidden="true">👥</span>Meet our team<span className="arr" aria-hidden="true">→</span></button></div>
    <button type="button" className="admin-entry" onClick={onAdmin}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7.5 3v5.5c0 4.4-3 7.8-7.5 9.5-4.5-1.7-7.5-5.1-7.5-9.5V6L12 3Z" /></svg>Admin portal</button>
  </div>;
}

/* ───────── appointment card + form ───────── */

function AppointmentCard({ a, index, now, leaving, confirming, onDone, onEdit, onAskDelete, onDelete, isPast }) {
  const chip = reminderChip(a);
  const d = startOf(a);
  const rel = isPast ? "" : relative(a, now);
  return <article className={`card spot ${leaving ? "leaving" : ""} ${a.status === "done" ? "is-done" : ""}`} style={{ "--i": index }}>
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
  const [page, setPage] = useState(() => (typeof location !== "undefined" && (location.hash === "#about" || location.hash === "#team") ? "about" : "home"));
  const [aboutTarget, setAboutTarget] = useState(() => (typeof location !== "undefined" && location.hash === "#team" ? "team" : ""));
  const [adminRoute, setAdminRoute] = useState(() => typeof location !== "undefined" && location.hash === "#admin");
  const toastId = useRef(0);
  useEffect(() => { const sync = () => setAdminRoute(location.hash === "#admin"); window.addEventListener("hashchange", sync); return () => window.removeEventListener("hashchange", sync); }, []);
  const openAdmin = () => { try { history.replaceState(null, "", "#admin"); } catch { /* ignore */ } setAdminRoute(true); window.scrollTo({ top: 0 }); };
  const closeAdmin = () => { try { history.replaceState(null, "", location.pathname + location.search); } catch { /* ignore */ } setAdminRoute(false); setPage("home"); window.scrollTo({ top: 0 }); };
  const goPage = (next, target = "") => { setAboutTarget(target); setPage(next); try { history.replaceState(null, "", next === "about" ? (target === "team" ? "#team" : "#about") : location.pathname + location.search); } catch { /* ignore */ } window.scrollTo({ top: 0 }); };

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

  const openNew = (opts) => { const o = opts && typeof opts === "object" && !("nativeEvent" in opts) ? opts : {}; setForm({ id: "", title: o.title || "", date: o.date || addDays(0), time: roundedNextHour(), remindBefore: 1440, notes: "" }); setModal(true); };
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

  if (adminRoute) return <Admin onExit={closeAdmin} />;
  if (page === "about") return <About key={aboutTarget || "top"} jumpTo={aboutTarget} onBack={() => goPage("home")} backLabel={isConfigured && !session ? "Back to sign in" : "Back to my appointments"} />;
  if (isConfigured && !session) return <AuthScreen onAuth={handleAuth} onAbout={() => goPage("about")} onTeam={() => goPage("about", "team")} onAdmin={openAdmin} />;

  const list = tab === "upcoming" ? upcoming : past;
  const groups = tab === "upcoming" ? ["Today", "Tomorrow", "This week", "Later"].map((g) => [g, list.filter((a) => groupOf(a) === g)]).filter(([, items]) => items.length) : [["", list]];
  let counter = 0;

  return <div className="app">
    <header className="topbar"><Brand /><div className="user"><ThemeToggle /><button type="button" className="nav-pill nav-about" onClick={() => goPage("about")}>About</button><span className="avatar">{initials(session.user.fullName)}</span><span className="user-name">{session.user.fullName}</span>{isConfigured && <button type="button" className="nav-pill nav-out" onClick={signOut}>Sign out</button>}</div></header>
    {!isConfigured && <div className="demo-banner">Demo mode — connect the backend to save appointments and send emails.</div>}
    <main className="content">
      <section className="hero"><div><p className="muted">{greeting}, {session.user.fullName.split(" ")[0]} 👋</p>
        {next ? <><h1>Next up: {next.title}</h1><p className="hero-when"><span className="bell">🔔</span>{fmtLong(next)} at {fmtTime(next)} <b>{relative(next, now)}</b></p></> : <><h1>Nothing coming up</h1><p className="hero-when">Add an appointment and we'll remind you by email.</p></>}</div>
        <button className="btn btn-primary btn-lg" onClick={openNew}><span className="plus">+</span> New appointment</button></section>

      <StatTiles appointments={appointments} upcoming={upcoming} now={now} />
      <div className="dash"><div className="dash-main">
      <div className="tabs tabs-wide" role="tablist"><span className="tab-pill" style={{ transform: `translateX(${tab === "past" ? 100 : 0}%)` }} /><button role="tab" aria-selected={tab === "upcoming"} onClick={() => setTab("upcoming")}>Upcoming <em>{upcoming.length}</em></button><button role="tab" aria-selected={tab === "past"} onClick={() => setTab("past")}>Past <em>{past.length}</em></button></div>

      {loading ? <div className="skeletons">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ "--i": i }} />)}</div>
        : !list.length ? <div className="empty" key={tab}><div className="empty-bell">🔔</div><h3>{tab === "upcoming" ? "You're all clear" : "No past appointments yet"}</h3><p className="muted">{tab === "upcoming" ? "Tap “New appointment” to add one — we'll remind you by email." : "Finished and missed appointments show up here."}</p>{tab === "upcoming" && <button className="btn btn-primary" onClick={openNew}>Add your first appointment</button>}</div>
        : <div className="list" key={tab}>{groups.map(([label, items]) => <div className="group" key={label || "all"}>{label && <h2 className="group-title">{label}</h2>}{items.map((a) => <AppointmentCard key={a.id} a={a} index={counter++} now={now} isPast={tab === "past"} leaving={leavingId === a.id} confirming={confirmId === a.id} onDone={markDone} onEdit={openEdit} onAskDelete={setConfirmId} onDelete={remove} />)}</div>)}</div>}
      <Tips />
      </div>
      <aside className="dash-side" aria-label="Calendar and shortcuts">
        <MiniCalendar appointments={appointments} now={now} onPick={(date) => openNew({ date })} />
        <QuickBook onPick={(title) => openNew({ title })} />
        <ReminderCard appointments={appointments} email={session.user.email} configured={isConfigured} />
      </aside></div>
    </main>
    <footer className="app-foot"><div className="foot-card">
      <div className="foot-brand"><Logo size={40} /><div><strong>{APP_NAME}</strong><span>Appointments, organized.</span></div></div>
      <div className="foot-links">
        <button type="button" className="foot-btn" onClick={() => goPage("about")}><span className="ico" aria-hidden="true">✦</span>The meaning of the name<span className="arr" aria-hidden="true">→</span></button>
        <button type="button" className="foot-btn" onClick={() => goPage("about", "team")}><span className="ico" aria-hidden="true">👥</span>Meet our team<span className="arr" aria-hidden="true">→</span></button>
        <button type="button" className="foot-btn foot-btn-quiet" onClick={openAdmin}><span className="ico" aria-hidden="true">🛡</span>Admin portal<span className="arr" aria-hidden="true">→</span></button>
      </div></div></footer>
    <button className="fab" onClick={openNew} aria-label="New appointment">+</button>
    {modal && form && <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && setModal(false)}><div className="modal" role="dialog" aria-modal="true" aria-label={form.id ? "Edit appointment" : "New appointment"}><div className="modal-head"><h2>{form.id ? "Edit appointment" : "New appointment"}</h2><button className="icon-btn" onClick={() => setModal(false)} aria-label="Close">×</button></div><AppointmentForm form={form} setForm={setForm} saving={saving} onSubmit={save} onClose={() => setModal(false)} email={session.user.email} /></div></div>}
    <Toast toast={toast} onClose={() => setToast(null)} />
  </div>;
}
