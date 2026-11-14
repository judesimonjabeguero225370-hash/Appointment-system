import { useEffect, useRef, useState } from "react";
import { APP_NAME } from "./api";
import Brand from "./Brand";

const TEAM = [
  { name: "Vinzon, Reven P.", photo: "/team/reven.jpg", role: "Project Leader", leader: true },
  { name: "Jabeguero Jude Simon D.", photo: "/team/simon.jpg", role: "Team Member" },
  { name: "Moreño Jorie F. Jr.", photo: "/team/jorie.jpg", role: "Team Member" },
  { name: "Medina John Federick J.", photo: "/team/feds.jpg", role: "Team Member" },
  { name: "Caraan Rovic A.", photo: "/team/rovic.jpg", role: "Team Member" }
];
const FLOW = [
  { icon: "📥", title: "Appointment requests", text: "Every request starts in one place." },
  { icon: "🗓️", title: "Scheduling processes", text: "Dates and times stay organized." },
  { icon: "🔔", title: "Automated notifications", text: "Emails go out on their own." }
];
const initials = (name) => name.replace(",", "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("");

function Portrait({ member }) {
  const [failed, setFailed] = useState(false);
  return <div className="portrait">{failed ? <span className="portrait-fallback">{initials(member.name)}</span> : <img src={member.photo} alt={`Portrait of ${member.name}`} loading="lazy" decoding="async" onError={() => setFailed(true)} />}</div>;
}

export default function About({ onBack, backLabel }) {
  const root = useRef(null);
  useEffect(() => {
    const items = root.current.querySelectorAll("[data-reveal]");
    if (!("IntersectionObserver" in window)) { items.forEach((el) => el.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const leader = TEAM.find((m) => m.leader);
  const rest = TEAM.filter((m) => !m.leader);

  return <div className="about" ref={root}>
    <header className="about-nav"><Brand onClick={onBack} /><button className="btn btn-soft" onClick={onBack}>← {backLabel}</button></header>

    <section className="about-hero">
      <svg className="veins" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path d="M-20 300 C 140 220, 220 380, 380 270 S 620 150, 820 230" /><path d="M-20 130 C 120 60, 260 200, 420 110 S 660 40, 820 120" /><path d="M200 420 C 260 320, 360 330, 430 250 S 560 120, 640 -20" />
      </svg>
      <div className="about-hero-inner">
        <span className="eyebrow" data-reveal style={{ "--d": 0 }}>About the name</span>
        <h1 className="wordmark" aria-label={APP_NAME.toUpperCase()}>{APP_NAME.toUpperCase().split("").map((ch, i) => <span key={i} aria-hidden="true" style={{ "--i": i }}>{ch}</span>)}</h1>
        <p className="etymology" data-reveal style={{ "--d": 1 }}>from the Latin <em>Vena</em> — “vein”</p>
      </div>
    </section>

    <section className="story">
      <div className="story-card" data-reveal style={{ "--d": 0 }}>
        <h2>About the Name <span className="hl">QORVENA</span></h2>
        <p><strong>QORVENA</strong> is an original coined name inspired by the Latin word <strong>Vena</strong>, meaning “vein.” It symbolizes the continuous flow of information and coordination within our system. Just as veins connect different parts of the body, <strong>QORVENA</strong> connects appointment requests, scheduling processes, and automated notifications in one centralized platform, making appointment management more organized, efficient, and convenient.</p>
      </div>
      <div className="flow" aria-label="How Qorvena connects everything">
        {FLOW.map((step, i) => <div className="flow-step" key={step.title} data-reveal style={{ "--d": i + 1 }}><div className="flow-icon">{step.icon}</div><h3>{step.title}</h3><p>{step.text}</p>{i < FLOW.length - 1 && <span className="flow-line" aria-hidden="true"><i /></span>}</div>)}
      </div>
    </section>

    <section className="team">
      <div className="team-head" data-reveal style={{ "--d": 0 }}><span className="eyebrow eyebrow-dark">The creators</span><h2>The people behind {APP_NAME}</h2><p className="muted">The team that designed and built this system.</p></div>
      <article className="leader" data-reveal style={{ "--d": 1 }}>
        <Portrait member={leader} />
        <div className="leader-info"><span className="role-badge">★ {leader.role}</span><h3>{leader.name}</h3><p className="muted">Leading the vision and direction of {APP_NAME}.</p></div>
      </article>
      <div className="members">
        {rest.map((m, i) => <article className="member" key={m.name} data-reveal style={{ "--d": i + 1 }}><Portrait member={m} /><div className="member-info"><h3>{m.name}</h3><span>{m.role}</span></div></article>)}
      </div>
    </section>

    <footer className="about-foot"><Brand /><p className="muted">© {new Date().getFullYear()} {APP_NAME}. Appointments, organized.</p><button className="btn btn-primary" onClick={onBack}>{backLabel}</button></footer>
  </div>;
}
