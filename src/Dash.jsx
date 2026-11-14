import { useMemo, useState } from "react";

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Four at-a-glance numbers, so the page is useful even before the first appointment. */
export function StatTiles({ appointments, upcoming, now }) {
  const today = iso(new Date(now));
  const weekEnd = iso(new Date(now + 7 * 86400000));
  const tiles = [
    { icon: "📅", label: "Upcoming", value: upcoming.length, hint: upcoming.length ? "Waiting for you" : "All clear", tone: "teal" },
    { icon: "⚡", label: "Today", value: upcoming.filter((a) => a.date === today).length, hint: "Happening today", tone: "amber" },
    { icon: "🗓️", label: "Next 7 days", value: upcoming.filter((a) => a.date <= weekEnd).length, hint: "Coming this week", tone: "blue" },
    { icon: "✅", label: "Completed", value: appointments.filter((a) => a.status === "done").length, hint: "Marked as done", tone: "green" }
  ];
  return <div className="stats" aria-label="Your appointments at a glance">{tiles.map((t, i) => <div className={`stat stat-${t.tone}`} key={t.label} style={{ "--i": i }}><span className="stat-icon" aria-hidden="true">{t.icon}</span><div><strong>{t.value}</strong><span>{t.label}</span><small>{t.hint}</small></div></div>)}</div>;
}

/** A small month calendar: dots mark busy days, tapping a day starts a booking for it. */
export function MiniCalendar({ appointments, now, onPick }) {
  const [offset, setOffset] = useState(0);
  const base = new Date(now);
  const view = new Date(base.getFullYear(), base.getMonth() + offset, 1);
  const todayIso = iso(base);
  const byDate = useMemo(() => { const m = {}; appointments.forEach((a) => { (m[a.date] = m[a.date] || []).push(a); }); return m; }, [appointments]);
  const first = view.getDay();
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i + 1))];
  return <section className="panel cal">
    <header className="panel-head"><h3>{new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(view)}</h3>
      <div className="cal-nav"><button type="button" className="icon-btn" aria-label="Previous month" onClick={() => setOffset(offset - 1)}>‹</button><button type="button" className="icon-btn" aria-label="Next month" onClick={() => setOffset(offset + 1)}>›</button></div></header>
    <div className="cal-grid" role="grid">
      {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <span className="cal-dow" key={i} aria-hidden="true">{d}</span>)}
      {cells.map((d, i) => {
        if (!d) return <span key={`e${i}`} />;
        const key = iso(d), items = byDate[key] || [], past = key < todayIso, upcomingCount = items.filter((a) => a.status === "upcoming").length;
        return <button type="button" key={key} disabled={past} className={`cal-day ${key === todayIso ? "is-today" : ""} ${items.length ? "has" : ""}`} aria-label={`${new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(d)}${items.length ? `, ${items.length} appointment${items.length > 1 ? "s" : ""}` : ""}`} onClick={() => onPick(key)}>{d.getDate()}{items.length > 0 && <i className={upcomingCount ? "" : "dim"} />}</button>;
      })}
    </div>
    <p className="panel-foot muted">Tap a day to book it.</p>
  </section>;
}

const TIPS = [["📧", "Email reminders", "Pick when we nudge you: 15 minutes, 1 day, or any time in between."], ["🗓️", "Add to your calendar", "Every confirmation email includes a calendar file and an Add to Google Calendar button."], ["✏️", "Change plans anytime", "Edit the time and we'll cancel the old reminder and schedule a new one."]];

/** Friendly tips that keep the page feeling full even with only a few appointments. */
export function Tips() {
  return <section className="tips" aria-label="Tips">{TIPS.map(([icon, title, text], i) => <div className="tip" key={title} style={{ "--i": i }}><span aria-hidden="true">{icon}</span><div><b>{title}</b><p>{text}</p></div></div>)}</section>;
}

const TEMPLATES = [["🩺", "Doctor visit"], ["👥", "Team meeting"], ["✂️", "Haircut"], ["📚", "Study session"], ["🚗", "Car service"], ["🎂", "Celebration"]];

export function QuickBook({ onPick }) {
  return <section className="panel"><header className="panel-head"><h3>Quick book</h3></header>
    <div className="templates">{TEMPLATES.map(([icon, title]) => <button type="button" key={title} onClick={() => onPick(title)}><span aria-hidden="true">{icon}</span>{title}</button>)}</div></section>;
}

export function ReminderCard({ appointments, email, configured }) {
  const pending = appointments.filter((a) => a.status === "upcoming" && Number(a.remindBefore) >= 0 && !/^\d{4}-|skipped/.test(a.reminderSentAt || "")).length;
  const sent = appointments.filter((a) => /^\d{4}-/.test(a.reminderSentAt || "")).length;
  return <section className="panel mail-panel"><header className="panel-head"><h3>Email reminders</h3><span className={`dot-live ${configured ? "" : "off"}`}>{configured ? "Active" : "Demo"}</span></header>
    <p className="muted">{configured ? <>We'll email <strong>{email}</strong> before each appointment starts.</> : "Connect the backend to send real emails."}</p>
    <div className="mini-stats"><div><strong>{pending}</strong><span>scheduled</span></div><div><strong>{sent}</strong><span>sent</span></div></div></section>;
}
