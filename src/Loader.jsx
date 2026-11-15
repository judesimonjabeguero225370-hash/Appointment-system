import { APP_NAME } from "./api";

/** Full-screen "working on it" overlay. Styles live in index.html so the very same look is used for the first page load. */
export default function Loader({ text = "Loading…" }) {
  return <div className="qv-loader qv-overlay" role="status" aria-live="polite" aria-busy="true">
    <div className="qv-box">
      <div className="qv-mark"><span className="qv-ring" />
        <svg viewBox="0 0 40 40" aria-hidden="true"><defs><linearGradient id="qvg-r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2f6f63" /><stop offset="1" stopColor="#47a592" /></linearGradient></defs>
          <rect width="40" height="40" rx="12" fill="url(#qvg-r)" /><circle cx="19" cy="18" r="9" fill="none" stroke="#fff" strokeWidth="3" />
          <path className="qv-vein" d="M18 20.5c3.2.2 4.6 3 6.6 5s4.4 1 6.4 3.4" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" /><circle cx="32.2" cy="29.6" r="2.3" fill="#f2a65a" /></svg></div>
      <strong className="qv-name">{APP_NAME}</strong>
      <p className="qv-text">{text}</p>
      <div className="qv-dots" aria-hidden="true"><i /><i /><i /></div>
    </div>
  </div>;
}
