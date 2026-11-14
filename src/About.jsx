import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { APP_NAME } from "./api";
import Brand from "./Brand";

const TEAM = [
  { name: "Vinzon, Reven P.", first: "Reven", photo: "/team/reven.jpg", role: "Project Leader", leader: true, fb: "https://www.facebook.com/Reven0011" },
  { name: "Jabeguero Jude Simon D.", first: "Simon", photo: "/team/simon.jpg", role: "Team Member", fb: "https://www.facebook.com/profile.php?id=100008068869833" },
  { name: "Moreño Jorie F. Jr.", first: "Jorie", photo: "/team/jorie.jpg", role: "Team Member", fb: "https://www.facebook.com/jorie.j.moreno" },
  { name: "Medina John Federick J.", first: "Federick", photo: "/team/feds.jpg", role: "Team Member", fb: "https://www.facebook.com/fedsmedina.22" },
  { name: "Caraan Rovic A.", first: "Rovic", photo: "/team/rovic.jpg", role: "Team Member", fb: "https://www.facebook.com/rovic.caraan.9" }
];
const FLOW = [
  { icon: "📥", title: "Appointment requests", text: "Every request starts in one place." },
  { icon: "🗓️", title: "Scheduling processes", text: "Dates and times stay organized." },
  { icon: "🔔", title: "Automated notifications", text: "Emails go out on their own." }
];
const LEADER = TEAM.find((m) => m.leader);
const MEMBERS = TEAM.filter((m) => !m.leader);
const initials = (name) => name.replace(",", "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("");

function FacebookIcon({ size = 18 }) {
  return <svg className="social-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12Z" /></svg>;
}

function Portrait({ member }) {
  const [failed, setFailed] = useState(false);
  return <div className="portrait">{failed ? <span className="portrait-fallback">{initials(member.name)}</span> : <img src={member.photo} alt={`Portrait of ${member.name}`} loading="lazy" decoding="async" onError={() => setFailed(true)} />}</div>;
}

function OrgCard({ member: m, index }) {
  return <article className={`org-card ${m.leader ? "is-leader" : ""}`} data-reveal style={{ "--d": index }}>
    <div className="org-inner spot">
      <Portrait member={m} />
      <div className="org-info">
        <span className={`role-badge ${m.leader ? "" : "role-plain"}`}>{m.leader ? "★ " : ""}{m.role}</span>
        <h3>{m.name}</h3>
        <a className="social" href={m.fb} target="_blank" rel="noopener noreferrer" aria-label={`${m.first} on Facebook (opens in a new tab)`}><FacebookIcon /><span>Facebook</span><i aria-hidden="true">↗</i></a>
      </div>
    </div>
  </article>;
}

export default function About({ onBack, backLabel, jumpTo }) {
  const root = useRef(null);
  const teamRef = useRef(null);
  const toTeam = (smooth) => teamRef.current && teamRef.current.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  // "Meet the creators" lands straight on the team, no scrolling needed
  useLayoutEffect(() => { if (jumpTo === "team") toTeam(false); }, []);
  useEffect(() => {
    const items = root.current.querySelectorAll("[data-reveal]");
    if (!("IntersectionObserver" in window)) { items.forEach((el) => el.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return <div className="about" ref={root}>
    <header className="about-nav"><Brand onClick={onBack} /><div className="about-nav-actions"><button className="link nav-link nav-team" onClick={() => toTeam(true)}>Our team</button><button className="btn btn-soft" onClick={onBack}>← {backLabel}</button></div></header>

    <section className="about-hero">
      <svg className="veins" viewBox="0 0 800 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path d="M-20 300 C 140 220, 220 380, 380 270 S 620 150, 820 230" /><path d="M-20 130 C 120 60, 260 200, 420 110 S 660 40, 820 120" /><path d="M200 420 C 260 320, 360 330, 430 250 S 560 120, 640 -20" />
      </svg>
      <div className="about-hero-inner">
        <span className="eyebrow" data-reveal style={{ "--d": 0 }}>The meaning behind the name</span>
        <h1 className="wordmark" aria-label={APP_NAME.toUpperCase()}>{APP_NAME.toUpperCase().split("").map((ch, i) => <span key={i} aria-hidden="true" style={{ "--i": i }}>{ch}</span>)}</h1>
        <p className="etymology" data-reveal style={{ "--d": 1 }}>from the Latin <em>Vena</em> — “vein”</p>
        <button className="btn btn-glass" data-reveal style={{ "--d": 2 }} onClick={() => toTeam(true)}>Meet our team <span aria-hidden="true" className="arrow-down">↓</span></button>
      </div>
    </section>

    <section className="story">
      <div className="story-card" data-reveal style={{ "--d": 0 }}>
        <h2>What <span className="hl">QORVENA</span> stands for</h2>
        <p><strong>QORVENA</strong> is an original coined name inspired by the Latin word <strong>Vena</strong>, meaning “vein.” It symbolizes the continuous flow of information and coordination within our system. Just as veins connect different parts of the body, <strong>QORVENA</strong> connects appointment requests, scheduling processes, and automated notifications in one centralized platform, making appointment management more organized, efficient, and convenient.</p>
      </div>
      <div className="flow" aria-label="How Qorvena connects everything">
        {FLOW.map((step, i) => <div className="flow-step" key={step.title} data-reveal style={{ "--d": i + 1 }}><div className="flow-icon">{step.icon}</div><h3>{step.title}</h3><p>{step.text}</p>{i < FLOW.length - 1 && <span className="flow-line" aria-hidden="true"><i /></span>}</div>)}
      </div>
    </section>

    <section className="team" id="team" ref={teamRef}>
      <div className="team-head" data-reveal style={{ "--d": 0 }}><span className="eyebrow eyebrow-dark">Organizational chart</span><h2>The team behind {APP_NAME}</h2><p className="muted">One project leader guiding four members. Say hi on Facebook!</p></div>
      <div className="org" role="group" aria-label={`${APP_NAME} organizational chart`}>
        <div className="org-top"><OrgCard member={LEADER} index={0} /></div>
        <ul className="org-branch">
          {MEMBERS.map((m, i) => <li key={m.name}><OrgCard member={m} index={i + 1} /></li>)}
        </ul>
      </div>
    </section>

    <footer className="about-foot"><Brand /><p className="muted">© {new Date().getFullYear()} {APP_NAME}. Appointments, organized.</p><button className="btn btn-primary" onClick={onBack}>{backLabel}</button></footer>
  </div>;
}
