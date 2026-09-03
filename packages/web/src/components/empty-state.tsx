import React, { useCallback, useEffect, useState } from "react";

type LocalStatus = "unknown" | "checking" | "online" | "offline" | "no-models";

export function EmptyState(props: {
  onToast?: (m: string) => void;
  onRefreshModels?: () => void;
  onOpenSettings?: () => void;
}) {
  const { onToast, onRefreshModels, onOpenSettings } = props;
  const [status, setStatus] = useState<LocalStatus>("unknown");
  const [checked, setChecked] = useState(false);

  const check = useCallback(async () => {
    setStatus("checking");
    try {
      const res = await fetch("/api/models?refresh=1");
      const body = (await res.json()) as { models?: unknown[] };
      if (!res.ok) {
        setStatus("offline");
        return;
      }
      const list = body.models ?? [];
      const hasLocal = (list as Array<{ isLocal?: boolean; provider?: string }>).some((m) => m.isLocal || m.provider === "ollama" || m.provider === "lmstudio");
      if (list.length === 0) setStatus("no-models");
      else if (hasLocal) setStatus("online");
      else setStatus("online");
      setChecked(true);
    } catch {
      setStatus("offline");
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const handleInstallOllama = () => {
    window.open("https://ollama.com/download", "_blank", "noreferrer");
    onToast?.("Opened Ollama download — install then ‘ollama pull llama3.1’ and Start");
  };

  const handleStart = async () => {
    // Try to prompt Ollama quick start — we just toast instructions; there is no direct API to start ollama daemon
    // We attempt to ping ollama directly (client side) for UX
    try {
      const _base = localStorage.getItem("gk.ollamaBaseUrl") ?? "http://localhost:11434";
      void _base;
      // fetch via /api/models will proxy; just re-check
      await check();
      onToast?.("Checking local models… If Ollama is running, models will appear after refresh.");
      onRefreshModels?.();
    } catch {
      onToast?.("Could not reach local provider — is Ollama running? `ollama serve`");
    }
  };

  return (
    <div className="empty empty-welcome" role="region" aria-label="Welcome — get started with Local AI">
      <img src="/assets/logo-mark.png" width={72} height={72} alt="Greeneek" style={{ borderRadius: 18 }} />
      <h2>Welcome to Greeneek — Local AI</h2>
      <p style={{ maxWidth: "56ch", color: "var(--dsw-alias-label-secondary)", fontSize: 13, lineHeight: "20px" }}>
        Run models locally with Ollama — no API key needed. Chat, plan with tools, and keep everything on-device. Cloud keys are optional.
      </p>

      <div
        className="welcome-card"
        style={{
          width: "min(560px, 100%)",
          border: "0.5px solid var(--dsw-alias-border-l2)",
          borderRadius: 16,
          background: "var(--dsw-alias-bg-layer-1)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          textAlign: "left",
          boxShadow: "var(--shadow)",
        }}
      >
        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <strong style={{ fontSize: 13 }}>Get started — Local AI</strong>
          {status === "checking" && <span className="chip"><span className="spinner" /> Checking…</span>}
          {status === "online" && <span className="chip active"><span className="dot" /> Local ready</span>}
          {status === "offline" && <span className="chip" style={{ background: "var(--dsw-static-red-50)", color: "var(--dsw-static-red-900)"}}><span className="dot" style={{ background: "var(--dsw-alias-state-error-primary)" }} /> Offline</span>}
          {status === "no-models" && <span className="chip"><span className="dot" /> No local models</span>}
        </div>

        <p className="muted" style={{ fontSize: 12, margin: 0, lineHeight: "18px" }}>
          {status === "offline" || status === "no-models"
            ? "No local models detected yet. Install Ollama, pull a model, and refresh."
            : checked
              ? "Local models detected. You’re ready to chat — or refresh to see newly pulled models."
              : "Checking for local models via Ollama / LM Studio…"}
        </p>

        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="btn secondary" onClick={handleInstallOllama} aria-label="Install Ollama">
            Install Ollama
          </button>
          <button className="btn primary" onClick={handleStart} aria-label="Start local model">
            Start
          </button>
          <button className="btn ghost" onClick={() => { void check(); onRefreshModels?.(); }} disabled={status === "checking"} aria-label="Refresh models">
            Refresh
          </button>
          <button className="btn ghost" onClick={onOpenSettings} aria-label="Open providers settings">
            Settings
          </button>
        </div>

        <div style={{ fontFamily: "var(--ds-font-family-code)", fontSize: 11, background: "var(--dsw-alias-bg-layer-2)", padding: "8px 10px", borderRadius: 8, overflowX: "auto", whiteSpace: "pre-wrap", color: "var(--dsw-alias-label-secondary)" }}>
          {"# 1 — Install Ollama  https://ollama.com\n# 2 — Pull a model\nollama pull llama3.1   # or: qwen2.5, mistral\n# 3 — Serve (usually auto) + Refresh\nollama serve  # if needed, then click Refresh in Greeneek"}
        </div>

        <p className="muted" style={{ fontSize: 11, margin: 0 }}>
          Tip: After pulling, click Refresh. Local models appear under <em>Free & Local — No API Key Required</em> in the model picker (Ctrl+M).
        </p>
      </div>

      <p className="mono" style={{ fontFamily: "var(--ds-font-family-code)", fontSize: 11, color: "var(--dsw-alias-label-tertiary)" }}>
        Try: <code>@execute calc.eval {"{"}&quot;expression&quot;:&quot;(2+3)*7&quot;{"}"}</code> — or just ask anything.
      </p>
    </div>
  );
}
