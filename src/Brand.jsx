import { APP_NAME } from "./api";

/** Q monogram: a ring whose tail flows out like a vein, ending in a small node. */
export function Logo({ size = 38 }) {
  return <svg className="logo" width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`${APP_NAME} logo`}>
    <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2f6f63" /><stop offset="1" stopColor="#47a592" /></linearGradient></defs>
    <rect width="40" height="40" rx="12" fill="url(#lg)" />
    <circle cx="19" cy="18" r="9" fill="none" stroke="#fff" strokeWidth="3" />
    <path className="logo-vein" d="M18 20.5c3.2.2 4.6 3 6.6 5s4.4 1 6.4 3.4" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
    <circle cx="32.2" cy="29.6" r="2.3" fill="#f2a65a" />
  </svg>;
}

export default function Brand({ onClick }) {
  const inner = <><Logo /><strong>{APP_NAME}</strong></>;
  return onClick ? <button type="button" className="brand brand-btn" onClick={onClick} aria-label={`${APP_NAME} home`}>{inner}</button> : <div className="brand">{inner}</div>;
}
