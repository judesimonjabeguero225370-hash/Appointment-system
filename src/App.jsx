import { useEffect, useMemo, useState } from "react";
import { apiCall, demoData, demoUser, isConfigured, lookupService, lookupStaff } from "./api";

const statusOptions = ["pending", "confirmed", "completed", "canceled", "no-show"];
const navItems = [
  { id: "overview", label: "Overview", icon: "▦" },
  { id: "appointments", label: "Appointments", icon: "◷" },
  { id: "services", label: "Advising types", icon: "◇" },
  { id: "staff", label: "Teachers", icon: "◎" },
  { id: "users", label: "Users & roles", icon: "⌁", adminOnly: true }
];

function todayIso() { return new Date().toISOString().slice(0, 10); }
function addDaysIso(offset) { const date = new Date(); date.setDate(date.getDate() + offset); return date.toISOString().slice(0, 10); }
function prettyDate(value, options = { month: "short", day: "numeric" }) { if (!value) return "—"; const date = new Date(`${value}T12:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", options).format(date); }
function prettyTime(value) { if (!value) return "—"; const [hours, minutes] = value.split(":").map(Number); const date = new Date(); date.setHours(hours || 0, minutes || 0, 0, 0); return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date); }
function titleCase(value) { return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function emptyAppointmentForm(services = [], staff = [], user = null) { return { id: "", customerName: user?.role === "student" ? user.fullName : "", customerEmail: user?.role === "student" ? user.email : "", customerPhone: "", serviceId: services.find((item) => item.active)?.id || "", staffId: user?.role === "teacher" && user.teacherId ? user.teacherId : staff.find((item) => item.active)?.id || "", date: todayIso(), time: "09:00", status: "pending", notes: "" }; }
function readSession() {
  try {
    return JSON.parse(localStorage.getItem("facultyflow-session") || sessionStorage.getItem("facultyflow-session") || "null");
  } catch { return null; }
}
function saveSession(session, rememberDevice) {
  const serialized = JSON.stringify(session);
  if (rememberDevice) {
    localStorage.setItem("facultyflow-session", serialized);
    sessionStorage.removeItem("facultyflow-session");
  } else {
    sessionStorage.setItem("facultyflow-session", serialized);
    localStorage.removeItem("facultyflow-session");
  }
}
function clearSession() {
  localStorage.removeItem("facultyflow-session");
  sessionStorage.removeItem("facultyflow-session");
}

function StatusBadge({ status }) { return <span className={`status-badge status-${status}`}>{titleCase(status)}</span>; }
function Modal({ title, eyebrow, children, onClose, wide = false }) { return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close dialog">×</button></div>{children}</div></div>; }
function Notice({ notice, onClose }) { if (!notice) return null; return <div className={`notice notice-${notice.type || "info"}`} role="status"><span>{notice.type === "error" ? "!" : "✓"}</span><p>{notice.message}</p><button onClick={onClose} aria-label="Dismiss notification">×</button></div>; }
function SectionHeading({ eyebrow, title, description, action }) { return <div className="section-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>; }
function StatCard({ label, value, note, tone = "mint", icon }) { return <div className={`stat-card stat-${tone}`}><div className="stat-topline"><span>{label}</span><span className="stat-icon">{icon}</span></div><strong>{value}</strong><small>{note}</small></div>; }

function passwordStrength(value) {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value) || value.length >= 12) score += 1;
  return score;
}
function rememberedEmail() { try { return localStorage.getItem("facultyflow-last-email") || ""; } catch { return ""; } }
function rememberEmail(email) { try { localStorage.setItem("facultyflow-last-email", email); } catch { /* ignore */ } }

function PasswordField({ label, value, onChange, placeholder, autoComplete, show, onToggle, hint }) {
  return <label>{label}<div className="password-input"><input type={show ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required autoComplete={autoComplete} /><button type="button" onClick={onToggle} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button></div>{hint}</label>;
}

function LoginScreen({ onLogin, onRegister, loading, error, clearError }) {
  const [mode, setMode] = useState("signin");
  const [email, setEmail] = useState(rememberedEmail);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [localError, setLocalError] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const switchMode = (next) => { setMode(next); setLocalError(""); setRecoveryMessage(""); setPassword(""); setConfirm(""); clearError?.(); };
  const strength = passwordStrength(password);
  const strengthLabel = ["Too short", "Weak", "Okay", "Good", "Strong"][password ? Math.max(strength, password.length < 8 ? 0 : 1) : 0];
  const shownError = localError || error;

  const submitSignIn = (event) => { event.preventDefault(); setLocalError(""); rememberEmail(email.trim().toLowerCase()); onLogin(email, password, rememberDevice); };
  const submitSignUp = (event) => {
    event.preventDefault(); setLocalError("");
    if (fullName.trim().length < 2) return setLocalError("Please enter your full name.");
    if (password.length < 8) return setLocalError("Your password needs at least 8 characters.");
    if (password !== confirm) return setLocalError("The two passwords don't match.");
    rememberEmail(email.trim().toLowerCase());
    onRegister({ fullName: fullName.trim(), email, password }, rememberDevice);
  };
  const submitRecovery = async (event) => {
    event.preventDefault(); setRecoveryLoading(true); setLocalError(""); setRecoveryMessage("");
    try { const result = await apiCall("requestPasswordReset", { email }); setRecoveryMessage(result.message); }
    catch (requestError) { setLocalError(requestError.message); }
    finally { setRecoveryLoading(false); }
  };

  const emailField = <label>University email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@university.edu" required autoFocus={mode !== "signup"} autoComplete={mode === "signup" ? "email" : "username"} /></label>;
  const rememberField = <label className="remember-label"><input type="checkbox" checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} /><span className="remember-check" />Keep me signed in on this device</label>;

  return <div className="auth-shell"><div className="auth-decoration auth-decoration-one" /><div className="auth-decoration auth-decoration-two" /><div className="auth-card"><div className="brand auth-brand"><span className="brand-mark">F</span><div><strong>facultyflow</strong><small>computer science advising</small></div></div>
    {mode === "recovery" ? <>
      <span className="eyebrow">Account recovery</span><h1>Need a way back in?</h1>
      <p className="auth-intro">Enter your university email. Your department administrator will review the request and reset your password.</p>
      <form onSubmit={submitRecovery}>{emailField}{shownError && <div className="auth-error" role="alert">{shownError}</div>}{recoveryMessage && <div className="auth-success" role="status">{recoveryMessage}</div>}<button className="primary-button auth-submit" disabled={recoveryLoading}>{recoveryLoading ? "Sending request…" : "Request password help"}</button></form>
      <button className="auth-back-button" onClick={() => switchMode("signin")}>← Back to sign in</button>
    </> : <>
      <div className="auth-tabs" role="tablist"><button role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "active" : ""} onClick={() => switchMode("signin")}>Sign in</button><button role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => switchMode("signup")}>Create account</button></div>
      {mode === "signin" ? <>
        <h1>Welcome back.</h1>
        <p className="auth-intro">Sign in to book, manage and track your advising appointments.</p>
        <form onSubmit={submitSignIn}>{emailField}<PasswordField label="Password" value={password} onChange={setPassword} placeholder="Your password" autoComplete="current-password" show={showPassword} onToggle={() => setShowPassword((v) => !v)} />{rememberField}{shownError && <div className="auth-error" role="alert">{shownError}</div>}<button className="primary-button auth-submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button></form>
        <button className="auth-forgot-button" onClick={() => switchMode("recovery")}>Forgot your password?</button>
        <p className="auth-footnote">New here? <button className="auth-inline-link" onClick={() => switchMode("signup")}>Create a student account</button> — it takes about 30 seconds.</p>
      </> : <>
        <h1>Create your account.</h1>
        <p className="auth-intro">Students can sign up in seconds and start booking right away. Teachers and administrators receive their accounts from the department.</p>
        <form onSubmit={submitSignUp}>
          <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="e.g. Elena Rodriguez" required autoFocus autoComplete="name" /></label>
          {emailField}
          <PasswordField label="Password" value={password} onChange={setPassword} placeholder="At least 8 characters" autoComplete="new-password" show={showPassword} onToggle={() => setShowPassword((v) => !v)} hint={password && <span className={`strength strength-${password.length < 8 ? 0 : strength}`}><span className="strength-bar"><i /><i /><i /><i /></span>{strengthLabel}</span>} />
          <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} placeholder="Type it once more" autoComplete="new-password" show={showPassword} onToggle={() => setShowPassword((v) => !v)} hint={confirm && <span className={`match-hint ${confirm === password ? "ok" : ""}`}>{confirm === password ? "✓ Passwords match" : "Passwords don't match yet"}</span>} />
          {rememberField}
          {shownError && <div className="auth-error" role="alert">{shownError}{/already exists/i.test(shownError) && <> <button type="button" className="auth-inline-link" onClick={() => switchMode("signin")}>Sign in instead</button></>}</div>}
          <button className="primary-button auth-submit" disabled={loading}>{loading ? "Creating your account…" : "Create account & sign in"}</button>
        </form>
        <p className="auth-footnote">Already have an account? <button className="auth-inline-link" onClick={() => switchMode("signin")}>Sign in</button></p>
      </>}
    </>}
  </div><div className="auth-side"><span className="eyebrow">Faculty appointment system</span><h2>Advising is a conversation, not a queue.</h2><p>Built for final-year computer science departments: thesis guidance, capstone reviews, code clinics, and the people who make them possible.</p><div className="auth-points"><span>✓ Book a teacher in under a minute</span><span>✓ Sign up yourself — no waiting for an admin</span><span>✓ See, change or cancel your bookings anytime</span></div></div></div>;
}

function AppointmentTable({ appointments, services, staff, onEdit, onStatusChange, canEdit, user }) {
  if (!appointments.length) return <div className="empty-state"><div className="empty-icon">◷</div><h3>No appointments found</h3><p>Try adjusting your filters or create a new faculty appointment.</p></div>;
  return <div className="appointment-table-wrap"><table className="appointment-table"><thead><tr><th>Student</th><th>Date & time</th><th>Advising type</th><th>Teacher</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{appointments.map((appointment) => <tr key={appointment.id}><td><div className="customer-cell"><span className="avatar">{appointment.customerName?.charAt(0) || "?"}</span><div><strong>{appointment.customerName}</strong><small>{appointment.customerEmail || appointment.customerPhone || "No contact details"}</small></div></div></td><td><strong>{prettyDate(appointment.date)}</strong><small>{prettyTime(appointment.time)}</small></td><td>{lookupService(services, appointment.serviceId)}</td><td>{lookupStaff(staff, appointment.staffId)}</td><td><StatusBadge status={appointment.status} /></td><td>{canEdit && <div className="row-actions"><button className="text-button" onClick={() => onEdit(appointment)}>Edit</button>{appointment.status !== "canceled" && appointment.status !== "completed" && <button className="more-button" onClick={() => onStatusChange(appointment)} title={user?.role === "student" ? "Cancel appointment" : "Change status"}>{user?.role === "student" ? "Cancel" : "•••"}</button>}</div>}</td></tr>)}</tbody></table><div className="mobile-appointment-list">{appointments.map((appointment) => <div className="mobile-appointment" key={appointment.id}><div className="mobile-appointment-top"><div className="customer-cell"><span className="avatar">{appointment.customerName?.charAt(0) || "?"}</span><div><strong>{appointment.customerName}</strong><small>{lookupService(services, appointment.serviceId)}</small></div></div><StatusBadge status={appointment.status} /></div><div className="mobile-appointment-meta"><span>{prettyDate(appointment.date)} · {prettyTime(appointment.time)}</span><span>{lookupStaff(staff, appointment.staffId)}</span></div>{canEdit && <button className="secondary-button small-button" onClick={() => onEdit(appointment)}>Open appointment</button>}</div>)}</div></div>;
}

function AppointmentForm({ form, setForm, services, staff, saving, onSubmit, onClose, user }) {
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const studentLocked = user?.role === "student";
  const teacherLocked = user?.role === "teacher" && user.teacherId;
  return <form onSubmit={onSubmit}><div className="form-section"><span className="form-section-title">Student details</span><div className="form-grid two-col"><label>Student name<input required value={form.customerName} disabled={studentLocked} onChange={(event) => update("customerName", event.target.value)} placeholder="e.g. Elena Rodriguez" /></label><label>University email<input type="email" value={form.customerEmail} disabled={studentLocked} onChange={(event) => update("customerEmail", event.target.value)} placeholder="student@university.edu" /></label><label>Phone<input value={form.customerPhone} onChange={(event) => update("customerPhone", event.target.value)} placeholder="09" /></label></div></div><div className="form-section"><span className="form-section-title">Faculty appointment</span><div className="form-grid two-col"><label>Advising type<select required value={form.serviceId} onChange={(event) => update("serviceId", event.target.value)}><option value="">Select advising type</option>{services.filter((item) => item.active || item.id === form.serviceId).map((item) => <option value={item.id} key={item.id}>{item.name} · {item.duration} min</option>)}</select></label><label>Teacher<select required value={form.staffId} disabled={teacherLocked} onChange={(event) => update("staffId", event.target.value)}><option value="">Select teacher</option>{staff.filter((item) => item.active || item.id === form.staffId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Date<input required type="date" value={form.date} onChange={(event) => update("date", event.target.value)} /></label><label>Time<input required type="time" value={form.time} onChange={(event) => update("time", event.target.value)} /></label>{!studentLocked && <label>Status<select value={form.status} onChange={(event) => update("status", event.target.value)}>{statusOptions.map((status) => <option value={status} key={status}>{titleCase(status)}</option>)}</select></label>}</div></div><div className="form-section"><span className="form-section-title">Preparation notes</span><label><span className="sr-only">Notes</span><textarea rows="3" value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Topic, draft, repository, or milestone to discuss..." /></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : form.id ? "Save changes" : "Book appointment"}</button></div></form>;
}

function SimpleRecordForm({ type, form, setForm, saving, onSubmit, onClose }) {
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const service = type === "service";
  return <form onSubmit={onSubmit}><div className="form-grid two-col"><label>{service ? "Advising type" : "Teacher name"}<input required value={form.name} onChange={(event) => update("name", event.target.value)} placeholder={service ? "e.g. Thesis advising" : "e.g. Dr. Maya Chen"} /></label>{!service && <label>Faculty email<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="teacher@university.edu" /></label>}{!service && <label>Specialization<input value={form.role} onChange={(event) => update("role", event.target.value)} placeholder="e.g. Software Engineering" /></label>}{service && <label>Duration (minutes)<input required type="number" min="5" step="5" value={form.duration} onChange={(event) => update("duration", event.target.value)} /></label>}{service && <label>Fee<input required type="number" min="0" step="0.01" value={form.price} onChange={(event) => update("price", event.target.value)} /></label>}{service && <label className="full-width">Description<textarea rows="3" value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="What will the student prepare for this meeting?" /></label>}</div><label className="switch-label"><input type="checkbox" checked={Boolean(form.active)} onChange={(event) => update("active", event.target.checked)} /><span className="switch" />Active and available for booking</label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : form.id ? "Save changes" : `Add ${service ? "advising type" : "teacher"}`}</button></div></form>;
}

function UserForm({ form, setForm, staff, saving, onSubmit, onClose }) {
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return <form onSubmit={onSubmit}><div className="form-grid two-col"><label>Full name<input required value={form.fullName} onChange={(event) => update("fullName", event.target.value)} placeholder="e.g. Alex Johnson" /></label><label>University email<input required type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="alex@university.edu" /></label><label>Role<select value={form.role} onChange={(event) => update("role", event.target.value)}><option value="student">Student</option><option value="teacher">Teacher</option><option value="admin">Administrator</option></select></label><label>Department<input value={form.department} onChange={(event) => update("department", event.target.value)} placeholder="Computer Science" /></label><label className="full-width">Teacher account link<select value={form.teacherId} onChange={(event) => update("teacherId", event.target.value)}><option value="">Not linked to a teacher profile</option>{staff.map((person) => <option value={person.id} key={person.id}>{person.name} · {person.role}</option>)}</select></label><label className="full-width">{form.id ? "New password (leave blank to keep current)" : "Password"}<input required={!form.id} minLength="8" type="password" value={form.password} onChange={(event) => update("password", event.target.value)} placeholder="At least 8 characters" /></label></div><label className="switch-label"><input type="checkbox" checked={Boolean(form.active)} onChange={(event) => update("active", event.target.checked)} /><span className="switch" />Account is active</label><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : form.id ? "Save user changes" : "Create user account"}</button></div></form>;
}

export default function App() {
  const [session, setSession] = useState(() => isConfigured ? readSession() : { token: "demo", user: demoUser });
  const [data, setData] = useState(demoData);
  const [view, setView] = useState("overview");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(Boolean(session));
  const [saving, setSaving] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [connection, setConnection] = useState(isConfigured ? "connecting" : "demo");
  const [notice, setNotice] = useState(null);
  const [loginError, setLoginError] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyAppointmentForm());

  const loadData = async () => {
    if (!session) { setLoading(false); return; }
    if (!isConfigured) { setLoading(false); return; }
    try {
      const remote = await apiCall("getDashboard", {}, session.token);
      let users = [];
      if (session.user.role === "admin") users = (await apiCall("listUsers", {}, session.token)).users || [];
      setData({ appointments: remote.appointments || [], services: remote.services || [], staff: remote.staff || [], users });
      setConnection("live");
      setNotice((current) => current?.type === "error" ? null : current);
    } catch (error) {
      if (/session|sign in|authentication/i.test(error.message)) { clearSession(); setSession(null); setLoginError(error.message); }
      else { setConnection("error"); setNotice({ type: "error", message: error.message }); }
    } finally { setLoading(false); }
  };
  useEffect(() => { loadData(); }, [session?.token]);

  const stats = useMemo(() => { const currentMonth = new Date().toISOString().slice(0, 7); return { upcoming: data.appointments.filter((item) => item.date >= todayIso() && item.status !== "canceled").length, confirmed: data.appointments.filter((item) => item.status === "confirmed" && item.date >= todayIso()).length, pending: data.appointments.filter((item) => item.status === "pending").length, completed: data.appointments.filter((item) => item.status === "completed" && String(item.date).startsWith(currentMonth)).length }; }, [data.appointments]);
  const filteredAppointments = useMemo(() => { const normalizedQuery = query.trim().toLowerCase(); return [...data.appointments].filter((appointment) => { const matchesStatus = statusFilter === "all" || appointment.status === statusFilter; const matchesQuery = !normalizedQuery || [appointment.customerName, appointment.customerEmail, lookupService(data.services, appointment.serviceId), lookupStaff(data.staff, appointment.staffId)].join(" ").toLowerCase().includes(normalizedQuery); return matchesStatus && matchesQuery; }).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)); }, [data, query, statusFilter]);
  const upcomingAppointments = useMemo(() => data.appointments.filter((item) => item.date >= todayIso() && item.status !== "canceled").sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).slice(0, 4), [data.appointments]);
  const days = Array.from({ length: 5 }, (_, index) => addDaysIso(index));
  const isAdmin = session?.user.role === "admin";
  const canEditAppointments = session?.user.role === "admin" || session?.user.role === "teacher" || session?.user.role === "student";

  const startSession = (result, rememberDevice, welcome) => { const next = { token: result.token, expiresAt: result.expiresAt, user: result.user }; saveSession(next, rememberDevice); setSession(next); setLoading(true); setView(next.user.role === "student" ? "appointments" : "overview"); setNotice({ type: "success", message: welcome(next.user.fullName.split(" ")[0]) }); };
  const handleLogin = async (email, password, rememberDevice) => {
    setLoginLoading(true); setLoginError("");
    try { startSession(await apiCall("login", { email, password }), rememberDevice, (name) => `Welcome back, ${name}!`); }
    catch (error) { setLoginError(error.message); }
    finally { setLoginLoading(false); }
  };
  const handleRegister = async (details, rememberDevice) => {
    setLoginLoading(true); setLoginError("");
    try { startSession(await apiCall("register", details), rememberDevice, (name) => `Welcome to FacultyFlow, ${name}! Your account is ready — book your first appointment below.`); }
    catch (error) { setLoginError(error.message); }
    finally { setLoginLoading(false); }
  };
  const logout = () => { if (isConfigured && session?.token) apiCall("logout", {}, session.token).catch(() => {}); clearSession(); setSession(null); setData(demoData); setView("overview"); setConnection(isConfigured ? "connecting" : "demo"); };
  const runRemote = (action, payload) => isConfigured ? apiCall(action, payload, session.token) : Promise.resolve(null);
  const openNewAppointment = () => { setForm(emptyAppointmentForm(data.services, data.staff, session?.user)); setModal("appointment"); };
  const openEditAppointment = (appointment) => { setForm({ ...emptyAppointmentForm(data.services, data.staff, session?.user), ...appointment }); setModal("appointment"); };
  const openStatusMenu = (appointment) => { if (session?.user.role === "student") { if (window.confirm(`Cancel your appointment on ${prettyDate(appointment.date)} at ${prettyTime(appointment.time)}?`)) changeAppointmentStatus(appointment, "canceled"); return; } const nextStatus = window.prompt(`Update status for ${appointment.customerName}. Enter pending, confirmed, completed, canceled, or no-show:`, appointment.status); if (nextStatus && statusOptions.includes(nextStatus.trim().toLowerCase())) changeAppointmentStatus(appointment, nextStatus.trim().toLowerCase()); };

  const submitAppointment = async (event) => { event.preventDefault(); setSaving(true); const payload = { ...form, duration: Number(data.services.find((item) => item.id === form.serviceId)?.duration || 0) }; try { if (form.id) { await runRemote("updateAppointment", payload); setData((current) => ({ ...current, appointments: current.appointments.map((item) => item.id === form.id ? { ...item, ...payload } : item) })); setNotice({ type: "success", message: "Faculty appointment updated." }); } else { const created = await runRemote("createAppointment", payload); const appointment = created?.appointment || { ...payload, id: `APT-${Date.now()}` }; setData((current) => ({ ...current, appointments: [...current.appointments, appointment] })); setNotice({ type: "success", message: "Faculty appointment booked." }); } setModal(null); } catch (error) { setNotice({ type: "error", message: error.message }); } finally { setSaving(false); } };
  const changeAppointmentStatus = async (appointment, status) => { const updated = { ...appointment, status }; try { await runRemote("updateAppointment", updated); setData((current) => ({ ...current, appointments: current.appointments.map((item) => item.id === appointment.id ? updated : item) })); setNotice({ type: "success", message: `${appointment.customerName}'s appointment is now ${titleCase(status)}.` }); } catch (error) { setNotice({ type: "error", message: error.message }); } };
  const openService = (service = null) => { setForm(service ? { ...service } : { id: "", name: "", duration: 30, price: 0, active: true, description: "" }); setModal("service"); };
  const openStaff = (person = null) => { setForm(person ? { ...person } : { id: "", name: "", email: "", role: "", active: true }); setModal("staff"); };
  const openUser = (user = null) => { setForm(user ? { ...user, password: "" } : { id: "", fullName: "", email: "", password: "", role: "student", department: "Computer Science", teacherId: "", active: true }); setModal("user"); };
  const submitSimpleRecord = async (event, type) => { event.preventDefault(); setSaving(true); const isService = type === "service"; const action = form.id ? `update${isService ? "Service" : "Staff"}` : `create${isService ? "Service" : "Staff"}`; const payload = { ...form, ...(isService ? { duration: Number(form.duration), price: Number(form.price) } : {}) }; try { const created = await runRemote(action, payload); const record = created?.[isService ? "service" : "staff"] || { ...payload, id: `${isService ? "SRV" : "STF"}-${Date.now()}` }; const key = isService ? "services" : "staff"; setData((current) => ({ ...current, [key]: form.id ? current[key].map((item) => item.id === form.id ? record : item) : [...current[key], record] })); setNotice({ type: "success", message: `${isService ? "Advising type" : "Teacher"} ${form.id ? "updated" : "added"}.` }); setModal(null); } catch (error) { setNotice({ type: "error", message: error.message }); } finally { setSaving(false); } };
  const submitUser = async (event) => { event.preventDefault(); setSaving(true); try { const action = form.id ? "updateUser" : "createUser"; const result = await runRemote(action, form); const user = result?.user || { ...form, id: `USR-${Date.now()}` }; setData((current) => ({ ...current, users: form.id ? current.users.map((item) => item.id === form.id ? user : item) : [...current.users, user] })); setNotice({ type: "success", message: "User account saved." }); setModal(null); } catch (error) { setNotice({ type: "error", message: error.message }); } finally { setSaving(false); } };

  if (isConfigured && !session) return <LoginScreen onLogin={handleLogin} onRegister={handleRegister} loading={loginLoading} error={loginError} clearError={() => setLoginError("")} />;
  const pageTitle = navItems.find((item) => item.id === view)?.label || "Overview";

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark">F</span><div><strong>facultyflow</strong><small>computer science advising</small></div></div><div className="workspace-label">Department workspace</div><nav className="main-nav">{navItems.filter((item) => !item.adminOnly || isAdmin).map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}{item.id === "appointments" && stats.pending > 0 && <span className="nav-count">{stats.pending}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="help-card"><span className="help-spark">✦</span><strong>Make space for deep work.</strong><p>Thesis guidance, code reviews, and the next useful conversation.</p></div><div className="profile"><span className="avatar avatar-dark">{session?.user.fullName?.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><div><strong>{session?.user.fullName}</strong><small>{titleCase(session?.user.role || "user")} · {session?.user.department}</small></div><button className="profile-logout" onClick={logout}>↪</button></div></div></aside><main className="main-content"><header className="topbar"><div><span className="breadcrumb">Faculty workspace <span>/</span> {pageTitle}</span><h1>{pageTitle}</h1></div><div className="topbar-actions"><div className={`connection-chip connection-${connection}`}><span className="connection-dot" />{connection === "live" ? "Sheets connected" : connection === "demo" ? "Demo data" : connection === "connecting" ? "Connecting…" : "Needs setup"}</div><span className="role-chip">{titleCase(session?.user.role || "user")}</span>{view !== "users" && <button className="primary-button" onClick={openNewAppointment}><span>+</span> Book appointment</button>}</div></header><Notice notice={notice} onClose={() => setNotice(null)} />

{view === "overview" && <div className="page-content overview-page"><div className="welcome-row"><div><span className="eyebrow">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</span><h2>{session?.user.role === "student" ? "Your next conversation starts here." : session?.user.role === "teacher" ? "A clear faculty day starts here." : "A clear department day starts here."}</h2><p>{session?.user.role === "student" ? "Book time with the teacher who can help your project move forward." : "Review the rhythm of teaching, advising, and final-year project support."}</p></div><button className="secondary-button" onClick={() => setView("appointments")}>View appointment book <span>→</span></button></div><div className="stats-grid"><StatCard label="Upcoming" value={stats.upcoming} note="faculty conversations ahead" tone="mint" icon="↗" /><StatCard label="Confirmed" value={stats.confirmed} note="ready to go" tone="peach" icon="✓" /><StatCard label="Awaiting reply" value={stats.pending} note="need a gentle follow-up" tone="lavender" icon="…" /><StatCard label="Completed this month" value={stats.completed} note="steady project progress" tone="sand" icon="↗" /></div><div className="dashboard-grid"><section className="panel timeline-panel"><SectionHeading eyebrow="Your week" title="Upcoming faculty rhythm" description="The next student-teacher conversations on the calendar." action={<button className="icon-button" onClick={() => setView("appointments")} aria-label="View appointments">↗</button>} /><div className="week-strip">{days.map((day, index) => { const count = data.appointments.filter((item) => item.date === day && item.status !== "canceled").length; return <button className={`day-tile ${index === 0 ? "today" : ""}`} key={day} onClick={() => setView("appointments")}><small>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(`${day}T12:00:00`))}</small><strong>{new Date(`${day}T12:00:00`).getDate()}</strong><span>{count} {count === 1 ? "meeting" : "meetings"}</span></button>; })}</div><div className="timeline-list">{upcomingAppointments.length ? upcomingAppointments.map((item) => <div className="timeline-item" key={item.id}><div className="timeline-time"><strong>{prettyTime(item.time)}</strong><small>{prettyDate(item.date, { month: "short", day: "numeric" })}</small></div><div className="timeline-line"><span /></div><div className="timeline-detail"><div><strong>{item.customerName}</strong><small>{lookupService(data.services, item.serviceId)} · {lookupStaff(data.staff, item.staffId)}</small></div><StatusBadge status={item.status} /></div></div>) : <div className="empty-inline">No upcoming faculty appointments yet.</div>}</div></section><section className="panel focus-panel"><SectionHeading eyebrow="Focus" title="Small things, well handled." /><div className="focus-card"><div className="focus-art"><span>✦</span><span>✦</span><span>✦</span></div><strong>{stats.pending ? `${stats.pending} appointment${stats.pending === 1 ? " is" : "s are"} waiting` : "Your queue is clear"}</strong><p>{stats.pending ? "A quick confirmation can make the next project milestone feel lighter." : "Enjoy the breathing room, or use it to prepare for what's next."}</p><button className="text-link" onClick={() => { setStatusFilter("pending"); setView("appointments"); }}>Review pending <span>→</span></button></div><div className="mini-metric"><span className="mini-icon">◎</span><div><strong>{data.services.filter((item) => item.active).length} advising types</strong><small>available to students</small></div>{isAdmin && <button onClick={() => setView("services")}>Manage</button>}</div><div className="mini-metric"><span className="mini-icon">◉</span><div><strong>{data.staff.filter((item) => item.active).length} teachers</strong><small>available for assignment</small></div>{isAdmin && <button onClick={() => setView("staff")}>Manage</button>}</div></section></div></div>}

{view === "appointments" && <div className="page-content"><SectionHeading eyebrow="Faculty workspace / Appointments" title="Appointment book" description={session?.user.role === "student" ? "Your advising conversations in one place." : session?.user.role === "teacher" ? "Your assigned student conversations and project milestones." : "Coordinate the department's student-teacher conversations."} action={<button className="primary-button" onClick={openNewAppointment}><span>+</span> Book appointment</button>} /><div className="toolbar"><div className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search students, advising types, teachers…" /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter appointments by status"><option value="all">All statuses</option>{statusOptions.map((status) => <option value={status} key={status}>{titleCase(status)}</option>)}</select><button className="secondary-button filter-button" onClick={() => { setQuery(""); setStatusFilter("all"); }}>Reset</button></div><div className="panel table-panel"><div className="table-summary"><span><strong>{filteredAppointments.length}</strong> appointments shown</span><span>{loading ? "Syncing…" : connection === "demo" ? "Demo workspace" : `Signed in as ${session?.user.role}`}</span></div><AppointmentTable appointments={filteredAppointments} services={data.services} staff={data.staff} canEdit={canEditAppointments} user={session?.user} onEdit={openEditAppointment} onStatusChange={openStatusMenu} /></div></div>}

{view === "services" && <div className="page-content"><SectionHeading eyebrow="Faculty workspace / Advising types" title="Advising types" description="Define the conversations students can book with your department." action={isAdmin && <button className="primary-button" onClick={() => openService()}><span>+</span> Add advising type</button>} /><div className="record-grid">{data.services.map((service) => <div className={`record-card ${!service.active ? "record-inactive" : ""}`} key={service.id}><div className="record-card-head"><span className="record-icon">◇</span>{isAdmin && <button className="more-button" onClick={() => openService(service)}>•••</button>}</div><h3>{service.name}</h3><p>{service.description || "A structured conversation for student progress."}</p><div className="record-meta"><span>{service.duration} min</span><span>{Number(service.price || 0) ? `$${Number(service.price).toFixed(2)}` : "No fee"}</span></div><div className="record-footer"><span className={`active-dot ${service.active ? "is-active" : ""}`}>{service.active ? "Active" : "Inactive"}</span>{isAdmin && <button className="text-button" onClick={() => openService(service)}>Edit</button>}</div></div>)}{!data.services.length && <div className="empty-state"><div className="empty-icon">◇</div><h3>No advising types yet</h3><p>Ask an administrator to create the first appointment type.</p></div>}</div></div>}

{view === "staff" && <div className="page-content"><SectionHeading eyebrow="Faculty workspace / Teachers" title="Teacher directory" description="The faculty profiles students can select when booking an appointment." action={isAdmin && <button className="primary-button" onClick={() => openStaff()}><span>+</span> Add teacher</button>} /><div className="staff-grid">{data.staff.map((person) => <div className={`staff-card ${!person.active ? "record-inactive" : ""}`} key={person.id}><div className="staff-card-head"><span className="avatar avatar-large">{person.name?.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span>{isAdmin && <button className="more-button" onClick={() => openStaff(person)}>•••</button>}</div><h3>{person.name}</h3><p>{person.role || "Faculty member"}</p><a href={person.email ? `mailto:${person.email}` : undefined}>{person.email || "No email added"}</a><div className="record-footer"><span className={`active-dot ${person.active ? "is-active" : ""}`}>{person.active ? "Available for booking" : "Inactive"}</span>{isAdmin && <button className="text-button" onClick={() => openStaff(person)}>Edit</button>}</div></div>)}{!data.staff.length && <div className="empty-state"><div className="empty-icon">◎</div><h3>No teachers yet</h3><p>Add the faculty members who will guide student projects.</p></div>}</div></div>}

{view === "users" && isAdmin && <div className="page-content"><SectionHeading eyebrow="Administration / Identity" title="Users & roles" description="Create accounts and control who can access the faculty workspace." action={<button className="primary-button" onClick={() => openUser()}><span>+</span> Create user</button>} /><div className="panel table-panel"><div className="table-summary"><span><strong>{data.users.length}</strong> user accounts</span><span>Passwords are stored as salted hashes</span></div><table className="appointment-table"><thead><tr><th>User</th><th>Role</th><th>Department</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{data.users.map((user) => <tr key={user.id}><td><div className="customer-cell"><span className="avatar">{user.fullName?.charAt(0)}</span><div><strong>{user.fullName}</strong><small>{user.email}</small></div></div></td><td><span className={`role-label role-${user.role}`}>{titleCase(user.role)}</span></td><td>{user.department || "Computer Science"}</td><td><span className={`active-dot ${user.active ? "is-active" : ""}`}>{user.active ? "Active" : "Inactive"}</span></td><td><button className="text-button" onClick={() => openUser(user)}>Edit</button></td></tr>)}</tbody></table></div></div>}
</main>{modal === "appointment" && <Modal title={form.id ? "Edit faculty appointment" : "Book a faculty appointment"} eyebrow="Student-teacher conversation" onClose={() => setModal(null)} wide><AppointmentForm form={form} setForm={setForm} services={data.services} staff={data.staff} saving={saving} onSubmit={submitAppointment} onClose={() => setModal(null)} user={session?.user} /></Modal>}{modal === "service" && <Modal title={form.id ? "Edit advising type" : "Add advising type"} eyebrow="Faculty menu" onClose={() => setModal(null)}><SimpleRecordForm type="service" form={form} setForm={setForm} saving={saving} onSubmit={(event) => submitSimpleRecord(event, "service")} onClose={() => setModal(null)} /></Modal>}{modal === "staff" && <Modal title={form.id ? "Edit teacher" : "Add teacher"} eyebrow="Faculty directory" onClose={() => setModal(null)}><SimpleRecordForm type="staff" form={form} setForm={setForm} saving={saving} onSubmit={(event) => submitSimpleRecord(event, "staff")} onClose={() => setModal(null)} /></Modal>}{modal === "user" && <Modal title={form.id ? "Edit user account" : "Create user account"} eyebrow="Administration" onClose={() => setModal(null)}><UserForm form={form} setForm={setForm} staff={data.staff} saving={saving} onSubmit={submitUser} onClose={() => setModal(null)} /></Modal>}</div>;
}
