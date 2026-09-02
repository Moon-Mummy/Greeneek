import React from "react";

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; msg: string }> {
  constructor(props: { children: React.ReactNode }) { super(props); this.state = { hasError: false, msg: "" }; }
  static getDerivedStateFromError(err: unknown) { return { hasError: true, msg: err instanceof Error ? err.message : String(err) }; }
  componentDidCatch(err: unknown, info: unknown) { console.error("[greeneek:error-boundary]", err, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, maxWidth: 640, margin: "40px auto", border: "1px solid var(--error)", borderRadius: 12 }}>
          <h3 style={{ margin: 0, color: "var(--error)" }}>Something went wrong</h3>
          <p className="muted" style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{this.state.msg}</p>
          <button className="btn" onClick={() => this.setState({ hasError: false, msg: "" })}>Try again</button>
          <button className="btn ghost" style={{ marginLeft: 8 }} onClick={() => location.reload()}>Reload</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function OfflineBanner() {
  const [offline, setOffline] = React.useState(!navigator.onLine);
  React.useEffect(() => {
    const on = () => setOffline(!navigator.onLine);
    window.addEventListener("online", on); window.addEventListener("offline", on);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", on); };
  }, []);
  if (!offline) return null;
  return (
    <div role="alert" aria-live="assertive" style={{ background: "#fef3c7", color: "#92400e", padding: "6px 12px", fontSize: 12, textAlign: "center", borderBottom: "1px solid #fcd34d" }}>
      You appear offline — messages will queue and models may be unavailable until you reconnect.
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-busy="true" aria-label="loading" style={{ display: "grid", gap: 8, padding: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ height: 12, borderRadius: 6, background: "var(--surfaceContainerHigh)", opacity: 0.7 - i * 0.12 }} />
      ))}
    </div>
  );
}
