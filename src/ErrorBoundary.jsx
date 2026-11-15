import { Component } from "react";

/** Catches a rendering error so one bad record can never turn the whole page white. */
export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error("Qorvena render error:", error); }
  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.compact) return <article className="card"><div className="card-main"><h3>Appointment unavailable</h3><p className="muted">This appointment has a date or time we can’t read.</p></div></article>;
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", fontFamily: "inherit", color: "var(--ink, #1f2f2c)" }}>
      <div><h2 style={{ marginBottom: 8 }}>Something went wrong</h2><p style={{ marginBottom: 18, opacity: .75 }}>Please reload the page. Your appointments are safe.</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button></div>
    </div>;
  }
}
