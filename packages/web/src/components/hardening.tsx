import React from "react";

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; msg: string }> {
  constructor(props: { children: React.ReactNode }) { super(props); this.state = { hasError: false, msg: "" }; }
  static getDerivedStateFromError(err: unknown) { return { hasError: true, msg: err instanceof Error ? err.message : String(err) }; }
  componentDidCatch(err: unknown, info: unknown) { console.error("[greeneek:error-boundary]", err, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, maxWidth: 640, margin: "40px auto", border: "1px solid var(--dsw-alias-state-error-primary)", borderRadius: 12 }}>
          <h3 style={{ margin: 0, color: "var(--dsw-alias-state-error-primary)" }}>Something went wrong</h3>
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
  const [dismissed, setDismissed] = React.useState(false);
  const [healthFail, setHealthFail] = React.useState(false);
  React.useEffect(() => {
    const onOnline = () => { setOffline(false); setDismissed(false); setHealthFail(false); };
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);
  // Harden: also probe /api/health periodically when supposedly online — if fetch fails while navigator.onLine true, still warn
  React.useEffect(() => {
    if (offline) return;
    let cancelled = false;
    const probe = async () => {
      try {
        const c = new AbortController();
        const t = window.setTimeout(() => c.abort(), 4000);
        const res = await fetch("/api/health", { signal: c.signal });
        window.clearTimeout(t);
        if (!cancelled) setHealthFail(!res.ok);
      } catch {
        if (!cancelled) setHealthFail(true);
      }
    };
    void probe();
    const iv = window.setInterval(probe, 20_000);
    const onVis = () => { if (document.visibilityState === "visible") void probe(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelled = true; window.clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, [offline]);

  const show = (offline || healthFail) && !dismissed;
  if (!show) return null;
  return (
    <div role="alert" aria-live="assertive" style={{ background: "#fef3c7", color: "#92400e", padding: "6px 12px", fontSize: 12, textAlign: "center", borderBottom: "1px solid #fcd34d", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
      <span>{offline ? "You appear offline — messages will queue and models may be unavailable until you reconnect." : "Connection degraded — some models may be unavailable. Check your network or local servers."}</span>
      <button className="btn ghost" onClick={() => setDismissed(true)} style={{ height: 24, padding: "0 8px", fontSize: 11, borderColor: "#f59e0b" }} aria-label="Dismiss offline banner">Dismiss</button>
      <button className="btn ghost" onClick={() => { setHealthFail(false); setDismissed(false); window.location.reload(); }} style={{ height: 24, padding: "0 8px", fontSize: 11 }}>Retry</button>
    </div>
  );
}

export function Skeleton({ lines = 3, variant = "line" }: { lines?: number; variant?: "line" | "card" | "row" }) {
  if (variant === "card") {
    return (
      <div aria-busy="true" aria-label="loading" style={{ display: "grid", gap: 12, padding: 8 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} style={{ border: "0.5px solid var(--dsw-alias-border-l2)", borderRadius: 10, padding: 12, display: "grid", gap: 8, background: "var(--dsw-alias-bg-layer-1)", opacity: 0.85 - i * 0.12 }}>
            <div style={{ height: 14, width: `${60 + (i % 3) * 10}%`, borderRadius: 6, background: "var(--dsw-alias-bg-layer-3)", animation: "skeletonPulse 1.2s ease-in-out infinite" }} />
            <div style={{ height: 10, width: "88%", borderRadius: 6, background: "var(--dsw-alias-bg-layer-3)", animation: "skeletonPulse 1.2s ease-in-out infinite", animationDelay: `${i * 120}ms` }} />
            <div style={{ height: 10, width: "72%", borderRadius: 6, background: "var(--dsw-alias-bg-layer-3)", opacity: 0.7 }} />
          </div>
        ))}
      </div>
    );
  }
  if (variant === "row") {
    return (
      <div aria-busy="true" aria-label="loading" style={{ display: "grid", gap: 8, padding: 8 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "0.5px solid var(--dsw-alias-border-l2)", opacity: 0.9 - i * 0.1 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--dsw-alias-bg-layer-3)", flexShrink: 0, animation: "skeletonPulse 1.2s ease-in-out infinite" }} />
            <div style={{ flex: 1, display: "grid", gap: 6 }}>
              <div style={{ height: 12, width: "54%", borderRadius: 6, background: "var(--dsw-alias-bg-layer-3)" }} />
              <div style={{ height: 10, width: "78%", borderRadius: 6, background: "var(--dsw-alias-bg-layer-3)" }} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div aria-busy="true" aria-label="loading" style={{ display: "grid", gap: 8, padding: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} style={{ height: 12, borderRadius: 6, background: "var(--dsw-alias-bg-layer-3)", opacity: 0.7 - i * 0.12, animation: "skeletonPulse 1.2s ease-in-out infinite", animationDelay: `${i * 90}ms` }} />
      ))}
    </div>
  );
}

export function TraceSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="loading traces" style={{ display: "grid", gap: 0, padding: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "80px 90px 120px 70px 70px 70px 60px", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--dsw-alias-border-l2)", background: "var(--dsw-alias-bg-layer-3)", opacity: 0.6 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} style={{ height: 10, borderRadius: 4, background: "var(--dsw-alias-bg-layer-3)" }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 90px 120px 70px 70px 70px 60px", gap: 8, padding: "10px 12px", borderBottom: "0.5px solid var(--dsw-alias-border-l2)", opacity: 0.9 - i * 0.12 }}>
          {Array.from({ length: 7 }).map((_, j) => (
            <div key={j} style={{ height: 12, borderRadius: 6, background: j === 4 ? "var(--dsw-alias-bg-layer-2)" : "var(--dsw-alias-bg-layer-3)", animation: j < 2 ? "skeletonPulse 1.2s ease-in-out infinite" : undefined, animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
