import { useEffect, useMemo, useState } from "react";
import { apiCall, demoData, isConfigured, lookupService, lookupStaff } from "./api";

const statusOptions = ["pending", "confirmed", "completed", "canceled", "no-show"];
const navItems = [
  { id: "overview", label: "Overview", icon: "▦" },
  { id: "appointments", label: "Appointments", icon: "◷" },
  { id: "services", label: "Services", icon: "◇" },
  { id: "staff", label: "Staff", icon: "◎" }
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function prettyDate(value, options = { month: "short", day: "numeric" }) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", options).format(date);
}

function prettyTime(value) {
  if (!value) return "—";
  const [hours, minutes] = value.split(":").map(Number);
  const date = new Date();
  date.setHours(hours || 0, minutes || 0, 0, 0);
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(date);
}

function titleCase(value) {
  return value.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function emptyAppointmentForm(services = [], staff = []) {
  return {
    id: "",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    serviceId: services.find((item) => item.active)?.id || "",
    staffId: staff.find((item) => item.active)?.id || "",
    date: todayIso(),
    time: "09:00",
    status: "pending",
    notes: ""
  };
}

function StatusBadge({ status }) {
  return <span className={`status-badge status-${status}`}>{titleCase(status)}</span>;
}

function Modal({ title, eyebrow, children, onClose, wide = false }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Notice({ notice, onClose }) {
  if (!notice) return null;
  return (
    <div className={`notice notice-${notice.type || "info"}`} role="status">
      <span>{notice.type === "error" ? "!" : "✓"}</span>
      <p>{notice.message}</p>
      <button onClick={onClose} aria-label="Dismiss notification">×</button>
    </div>
  );
}

function SectionHeading({ eyebrow, title, description, action }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

function StatCard({ label, value, note, tone = "mint", icon }) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <div className="stat-topline"><span>{label}</span><span className="stat-icon">{icon}</span></div>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function AppointmentTable({ appointments, services, staff, onEdit, onStatusChange }) {
  if (!appointments.length) {
    return <div className="empty-state"><div className="empty-icon">◷</div><h3>No appointments found</h3><p>Try adjusting your filters or create a new appointment.</p></div>;
  }

  return (
    <div className="appointment-table-wrap">
      <table className="appointment-table">
        <thead><tr><th>Customer</th><th>Date & time</th><th>Service</th><th>Assigned to</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {appointments.map((appointment) => (
            <tr key={appointment.id}>
              <td>
                <div className="customer-cell"><span className="avatar">{appointment.customerName?.charAt(0) || "?"}</span><div><strong>{appointment.customerName}</strong><small>{appointment.customerEmail || appointment.customerPhone || "No contact details"}</small></div></div>
              </td>
              <td><strong>{prettyDate(appointment.date)}</strong><small>{prettyTime(appointment.time)}</small></td>
              <td>{lookupService(services, appointment.serviceId)}</td>
              <td>{lookupStaff(staff, appointment.staffId)}</td>
              <td><StatusBadge status={appointment.status} /></td>
              <td><div className="row-actions"><button className="text-button" onClick={() => onEdit(appointment)}>Edit</button>{appointment.status !== "canceled" && appointment.status !== "completed" && <button className="more-button" onClick={() => onStatusChange(appointment)}>•••</button>}</div></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mobile-appointment-list">
        {appointments.map((appointment) => (
          <div className="mobile-appointment" key={appointment.id}>
            <div className="mobile-appointment-top"><div className="customer-cell"><span className="avatar">{appointment.customerName?.charAt(0) || "?"}</span><div><strong>{appointment.customerName}</strong><small>{lookupService(services, appointment.serviceId)}</small></div></div><StatusBadge status={appointment.status} /></div>
            <div className="mobile-appointment-meta"><span>{prettyDate(appointment.date)} · {prettyTime(appointment.time)}</span><span>{lookupStaff(staff, appointment.staffId)}</span></div>
            <button className="secondary-button small-button" onClick={() => onEdit(appointment)}>Open appointment</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AppointmentForm({ form, setForm, services, staff, saving, onSubmit, onClose }) {
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <form onSubmit={onSubmit}>
      <div className="form-section"><span className="form-section-title">Customer details</span><div className="form-grid two-col"><label>Full name<input required value={form.customerName} onChange={(event) => update("customerName", event.target.value)} placeholder="e.g. Elena Rodriguez" /></label><label>Email<input type="email" value={form.customerEmail} onChange={(event) => update("customerEmail", event.target.value)} placeholder="name@example.com" /></label><label>Phone<input value={form.customerPhone} onChange={(event) => update("customerPhone", event.target.value)} placeholder="+1 555 000 0000" /></label></div></div>
      <div className="form-section"><span className="form-section-title">Appointment details</span><div className="form-grid two-col"><label>Service<select required value={form.serviceId} onChange={(event) => update("serviceId", event.target.value)}><option value="">Select service</option>{services.filter((item) => item.active || item.id === form.serviceId).map((item) => <option value={item.id} key={item.id}>{item.name} · {item.duration} min</option>)}</select></label><label>Assigned staff<select required value={form.staffId} onChange={(event) => update("staffId", event.target.value)}><option value="">Select staff member</option>{staff.filter((item) => item.active || item.id === form.staffId).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Date<input required type="date" value={form.date} onChange={(event) => update("date", event.target.value)} /></label><label>Time<input required type="time" value={form.time} onChange={(event) => update("time", event.target.value)} /></label><label>Status<select value={form.status} onChange={(event) => update("status", event.target.value)}>{statusOptions.map((status) => <option value={status} key={status}>{titleCase(status)}</option>)}</select></label></div></div>
      <div className="form-section"><span className="form-section-title">Internal notes</span><label><span className="sr-only">Notes</span><textarea rows="3" value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Add context for the assigned team member..." /></label></div>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : form.id ? "Save changes" : "Create appointment"}</button></div>
    </form>
  );
}

function SimpleRecordForm({ type, form, setForm, saving, onSubmit, onClose }) {
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const service = type === "service";
  return (
    <form onSubmit={onSubmit}>
      <div className="form-grid two-col">
        <label>{service ? "Service name" : "Full name"}<input required value={form.name} onChange={(event) => update("name", event.target.value)} placeholder={service ? "e.g. Initial consultation" : "e.g. Maya Chen"} /></label>
        {!service && <label>Email<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="name@example.com" /></label>}
        {!service && <label>Role<input value={form.role} onChange={(event) => update("role", event.target.value)} placeholder="e.g. Senior consultant" /></label>}
        {service && <label>Duration (minutes)<input required type="number" min="5" step="5" value={form.duration} onChange={(event) => update("duration", event.target.value)} /></label>}
        {service && <label>Price<input required type="number" min="0" step="0.01" value={form.price} onChange={(event) => update("price", event.target.value)} /></label>}
        {service && <label className="full-width">Description<textarea rows="3" value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="What is included in this service?" /></label>}
      </div>
      <label className="switch-label"><input type="checkbox" checked={Boolean(form.active)} onChange={(event) => update("active", event.target.checked)} /><span className="switch" />Active and available for booking</label>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Saving…" : form.id ? "Save changes" : `Add ${service ? "service" : "staff member"}`}</button></div>
    </form>
  );
}

export default function App() {
  const [data, setData] = useState(demoData);
  const [view, setView] = useState("overview");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [connection, setConnection] = useState(isConfigured ? "connecting" : "demo");
  const [notice, setNotice] = useState(null);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyAppointmentForm());

  const loadData = async () => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }
    try {
      const remote = await apiCall("getDashboard");
      setData({ appointments: remote.appointments || [], services: remote.services || [], staff: remote.staff || [] });
      setConnection("live");
      setNotice(null);
    } catch (error) {
      setConnection("error");
      setNotice({ type: "error", message: error.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const stats = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const upcoming = data.appointments.filter((item) => item.date >= todayIso() && item.status !== "canceled").length;
    const confirmed = data.appointments.filter((item) => item.status === "confirmed" && item.date >= todayIso()).length;
    const pending = data.appointments.filter((item) => item.status === "pending").length;
    const completed = data.appointments.filter((item) => item.status === "completed" && String(item.date).startsWith(currentMonth)).length;
    return { upcoming, confirmed, pending, completed };
  }, [data.appointments]);

  const filteredAppointments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...data.appointments].filter((appointment) => {
      const matchesStatus = statusFilter === "all" || appointment.status === statusFilter;
      const matchesQuery = !normalizedQuery || [appointment.customerName, appointment.customerEmail, lookupService(data.services, appointment.serviceId), lookupStaff(data.staff, appointment.staffId)].join(" ").toLowerCase().includes(normalizedQuery);
      return matchesStatus && matchesQuery;
    }).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }, [data, query, statusFilter]);

  const upcomingAppointments = useMemo(() => data.appointments.filter((item) => item.date >= todayIso() && item.status !== "canceled").sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).slice(0, 4), [data.appointments]);
  const days = Array.from({ length: 5 }, (_, index) => addDaysIso(index));

  const runRemote = async (action, payload) => {
    if (!isConfigured) return null;
    return apiCall(action, payload);
  };

  const openNewAppointment = () => { setForm(emptyAppointmentForm(data.services, data.staff)); setModal("appointment"); };
  const openEditAppointment = (appointment) => { setForm({ ...emptyAppointmentForm(data.services, data.staff), ...appointment }); setModal("appointment"); };
  const openStatusMenu = (appointment) => {
    const nextStatus = window.prompt(`Update status for ${appointment.customerName}. Enter pending, confirmed, completed, canceled, or no-show:`, appointment.status);
    if (nextStatus && statusOptions.includes(nextStatus.trim().toLowerCase())) changeAppointmentStatus(appointment, nextStatus.trim().toLowerCase());
  };

  const submitAppointment = async (event) => {
    event.preventDefault();
    setSaving(true);
    const payload = { ...form, duration: Number(data.services.find((item) => item.id === form.serviceId)?.duration || 0) };
    try {
      if (form.id) {
        await runRemote("updateAppointment", payload);
        setData((current) => ({ ...current, appointments: current.appointments.map((item) => item.id === form.id ? { ...item, ...payload } : item) }));
        setNotice({ type: "success", message: "Appointment updated." });
      } else {
        const created = await runRemote("createAppointment", payload);
        const appointment = created?.appointment || { ...payload, id: `APT-${Date.now()}` };
        setData((current) => ({ ...current, appointments: [...current.appointments, appointment] }));
        setNotice({ type: "success", message: "Appointment created." });
      }
      setModal(null);
    } catch (error) {
      setNotice({ type: "error", message: error.message });
    } finally {
      setSaving(false);
    }
  };

  const changeAppointmentStatus = async (appointment, status) => {
    const updated = { ...appointment, status };
    try {
      await runRemote("updateAppointment", updated);
      setData((current) => ({ ...current, appointments: current.appointments.map((item) => item.id === appointment.id ? updated : item) }));
      setNotice({ type: "success", message: `${appointment.customerName}'s appointment is now ${titleCase(status)}.` });
    } catch (error) { setNotice({ type: "error", message: error.message }); }
  };

  const cancelAppointment = async (appointment) => {
    if (!window.confirm(`Cancel ${appointment.customerName}'s appointment?`)) return;
    await changeAppointmentStatus(appointment, "canceled");
  };

  const openService = (service = null) => {
    setForm(service ? { ...service } : { id: "", name: "", duration: 30, price: 0, active: true, description: "" });
    setModal("service");
  };
  const openStaff = (person = null) => {
    setForm(person ? { ...person } : { id: "", name: "", email: "", role: "", active: true });
    setModal("staff");
  };

  const submitSimpleRecord = async (event, type) => {
    event.preventDefault();
    setSaving(true);
    const isService = type === "service";
    const action = form.id ? `update${isService ? "Service" : "Staff"}` : `create${isService ? "Service" : "Staff"}`;
    const payload = { ...form, ...(isService ? { duration: Number(form.duration), price: Number(form.price) } : {}) };
    try {
      const created = await runRemote(action, payload);
      const record = created?.[isService ? "service" : "staff"] || { ...payload, id: `${isService ? "SRV" : "STF"}-${Date.now()}` };
      const key = isService ? "services" : "staff";
      setData((current) => ({ ...current, [key]: form.id ? current[key].map((item) => item.id === form.id ? record : item) : [...current[key], record] }));
      setNotice({ type: "success", message: `${isService ? "Service" : "Staff member"} ${form.id ? "updated" : "added"}.` });
      setModal(null);
    } catch (error) { setNotice({ type: "error", message: error.message }); }
    finally { setSaving(false); }
  };

  const pageTitle = navItems.find((item) => item.id === view)?.label || "Overview";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">A</span><div><strong>daymark</strong><small>appointment workspace</small></div></div>
        <div className="workspace-label">Workspace</div>
        <nav className="main-nav">{navItems.map((item) => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => setView(item.id)}><span className="nav-icon">{item.icon}</span>{item.label}{item.id === "appointments" && stats.pending > 0 && <span className="nav-count">{stats.pending}</span>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="help-card"><span className="help-spark">✦</span><strong>Keep the day light.</strong><p>Everything your team needs, in one calm place.</p></div><div className="profile"><span className="avatar avatar-dark">AD</span><div><strong>Admin desk</strong><small>Workspace owner</small></div><span className="profile-dots">•••</span></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div><span className="breadcrumb">Workspace <span>/</span> {pageTitle}</span><h1>{pageTitle}</h1></div><div className="topbar-actions"><div className={`connection-chip connection-${connection}`}><span className="connection-dot" />{connection === "live" ? "Sheets connected" : connection === "demo" ? "Demo data" : connection === "connecting" ? "Connecting…" : "Needs setup"}</div><button className="primary-button" onClick={openNewAppointment}><span>+</span> New appointment</button></div></header>
        <Notice notice={notice} onClose={() => setNotice(null)} />

        {view === "overview" && <div className="page-content overview-page">
          <div className="welcome-row"><div><span className="eyebrow">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</span><h2>A clear day starts here.</h2><p>Review the rhythm of your workspace and take care of what is next.</p></div><button className="secondary-button" onClick={() => setView("appointments")}>View all appointments <span>→</span></button></div>
          <div className="stats-grid"><StatCard label="Upcoming" value={stats.upcoming} note="appointments on the horizon" tone="mint" icon="↗" /><StatCard label="Confirmed" value={stats.confirmed} note="ready to go" tone="peach" icon="✓" /><StatCard label="Awaiting reply" value={stats.pending} note="need a gentle follow-up" tone="lavender" icon="…" /><StatCard label="Completed this month" value={stats.completed} note="a steady pace" tone="sand" icon="↗" /></div>
          <div className="dashboard-grid"><section className="panel timeline-panel"><SectionHeading eyebrow="Your week" title="Upcoming rhythm" description="A quick look at the next few days." action={<button className="icon-button" onClick={() => setView("appointments")} aria-label="View appointments">↗</button>} /><div className="week-strip">{days.map((day, index) => { const count = data.appointments.filter((item) => item.date === day && item.status !== "canceled").length; return <button className={`day-tile ${index === 0 ? "today" : ""}`} key={day} onClick={() => { setView("appointments"); setQuery(""); }}><small>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(`${day}T12:00:00`))}</small><strong>{new Date(`${day}T12:00:00`).getDate()}</strong><span>{count} {count === 1 ? "visit" : "visits"}</span></button>; })}</div><div className="timeline-list">{upcomingAppointments.length ? upcomingAppointments.map((item) => <div className="timeline-item" key={item.id}><div className="timeline-time"><strong>{prettyTime(item.time)}</strong><small>{prettyDate(item.date, { month: "short", day: "numeric" })}</small></div><div className="timeline-line"><span /></div><div className="timeline-detail"><div><strong>{item.customerName}</strong><small>{lookupService(data.services, item.serviceId)} · {lookupStaff(data.staff, item.staffId)}</small></div><StatusBadge status={item.status} /></div></div>) : <div className="empty-inline">No upcoming appointments yet.</div>}</div></section><section className="panel focus-panel"><SectionHeading eyebrow="Focus" title="Small things, well handled." /><div className="focus-card"><div className="focus-art"><span>✦</span><span>✦</span><span>✦</span></div><strong>{stats.pending ? `${stats.pending} appointment${stats.pending === 1 ? " is" : "s are"} waiting` : "Your queue is clear"}</strong><p>{stats.pending ? "A quick confirmation can make the rest of the day feel effortless." : "Enjoy the breathing room, or use it to prepare for what's next."}</p><button className="text-link" onClick={() => { setStatusFilter("pending"); setView("appointments"); }}>Review pending <span>→</span></button></div><div className="mini-metric"><span className="mini-icon">◎</span><div><strong>{data.services.filter((item) => item.active).length} active services</strong><small>available for booking</small></div><button onClick={() => setView("services")}>Manage</button></div><div className="mini-metric"><span className="mini-icon">◉</span><div><strong>{data.staff.filter((item) => item.active).length} active staff</strong><small>ready for assignment</small></div><button onClick={() => setView("staff")}>Manage</button></div></section></div>
        </div>}

        {view === "appointments" && <div className="page-content"><SectionHeading eyebrow="Workspace / Appointments" title="Appointment book" description="Keep every conversation and commitment in view." action={<button className="primary-button" onClick={openNewAppointment}><span>+</span> New appointment</button>} /><div className="toolbar"><div className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search customers, services, staff…" /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter appointments by status"><option value="all">All statuses</option>{statusOptions.map((status) => <option value={status} key={status}>{titleCase(status)}</option>)}</select><button className="secondary-button filter-button" onClick={() => { setQuery(""); setStatusFilter("all"); }}>Reset</button></div><div className="panel table-panel"><div className="table-summary"><span><strong>{filteredAppointments.length}</strong> appointments shown</span><span>{loading ? "Syncing…" : connection === "demo" ? "Demo workspace" : "Last updated just now"}</span></div><AppointmentTable appointments={filteredAppointments} services={data.services} staff={data.staff} onEdit={openEditAppointment} onStatusChange={openStatusMenu} /></div></div>}

        {view === "services" && <div className="page-content"><SectionHeading eyebrow="Workspace / Services" title="Services" description="Shape the menu your customers can book." action={<button className="primary-button" onClick={() => openService()}><span>+</span> Add service</button>} /><div className="record-grid">{data.services.map((service) => <div className={`record-card ${!service.active ? "record-inactive" : ""}`} key={service.id}><div className="record-card-head"><span className="record-icon">◇</span><button className="more-button" onClick={() => openService(service)}>•••</button></div><h3>{service.name}</h3><p>{service.description || "A thoughtful service for your appointment menu."}</p><div className="record-meta"><span>{service.duration} min</span><span>${Number(service.price || 0).toFixed(2)}</span></div><div className="record-footer"><span className={`active-dot ${service.active ? "is-active" : ""}`}>{service.active ? "Active" : "Inactive"}</span><button className="text-button" onClick={() => openService(service)}>Edit</button></div></div>)}{!data.services.length && <div className="empty-state"><div className="empty-icon">◇</div><h3>No services yet</h3><p>Create the first service your team can schedule.</p></div>}</div></div>}

        {view === "staff" && <div className="page-content"><SectionHeading eyebrow="Workspace / Staff" title="Staff directory" description="Keep assignments clear and your team in sync." action={<button className="primary-button" onClick={() => openStaff()}><span>+</span> Add staff member</button>} /><div className="staff-grid">{data.staff.map((person) => <div className={`staff-card ${!person.active ? "record-inactive" : ""}`} key={person.id}><div className="staff-card-head"><span className="avatar avatar-large">{person.name?.split(" ").map((word) => word[0]).join("").slice(0, 2)}</span><button className="more-button" onClick={() => openStaff(person)}>•••</button></div><h3>{person.name}</h3><p>{person.role || "Team member"}</p><a href={person.email ? `mailto:${person.email}` : undefined}>{person.email || "No email added"}</a><div className="record-footer"><span className={`active-dot ${person.active ? "is-active" : ""}`}>{person.active ? "Available for booking" : "Inactive"}</span><button className="text-button" onClick={() => openStaff(person)}>Edit</button></div></div>)}{!data.staff.length && <div className="empty-state"><div className="empty-icon">◎</div><h3>No staff yet</h3><p>Add the people who will be assigned to appointments.</p></div>}</div></div>}
      </main>

      {modal === "appointment" && <Modal title={form.id ? "Edit appointment" : "New appointment"} eyebrow="Appointment details" onClose={() => setModal(null)} wide><AppointmentForm form={form} setForm={setForm} services={data.services} staff={data.staff} saving={saving} onSubmit={submitAppointment} onClose={() => setModal(null)} /></Modal>}
      {modal === "service" && <Modal title={form.id ? "Edit service" : "Add service"} eyebrow="Service menu" onClose={() => setModal(null)}><SimpleRecordForm type="service" form={form} setForm={setForm} saving={saving} onSubmit={(event) => submitSimpleRecord(event, "service")} onClose={() => setModal(null)} /></Modal>}
      {modal === "staff" && <Modal title={form.id ? "Edit staff member" : "Add staff member"} eyebrow="Staff directory" onClose={() => setModal(null)}><SimpleRecordForm type="staff" form={form} setForm={setForm} saving={saving} onSubmit={(event) => submitSimpleRecord(event, "staff")} onClose={() => setModal(null)} /></Modal>}
    </div>
  );
}
