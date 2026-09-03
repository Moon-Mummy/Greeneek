import React, { useEffect, useState } from "react";
import { DEFAULT_REGISTRY } from "../../lib/registry";

type Health = { id: string; label: string; baseUrl: string; ok: boolean | null; message: string };

function providerBase(id: string): string {
  try {
    const s = JSON.parse(localStorage.getItem("greeneek.settings.v3") ?? "{}") as any;
    const pv = s?.state?.providerSettings?.[id]?.baseUrl ?? s?.state?.ollamaBaseUrl ?? DEFAULT_REGISTRY[id]?.baseURL ?? "";
    return String(pv || DEFAULT_REGISTRY[id]?.baseURL || "");
  } catch {
    return String(DEFAULT_REGISTRY[id]?.baseURL || "");
  }
}

export function ConnectionStatus({ running }: { running: boolean }) {
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [healths, setHealths] = useState<Health[]>([]);
  const [checking, setChecking] = useState(false);
  const [overallOk, setOverallOk] = useState<boolean | null>(null);

  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    const off = () => setOnline(!navigator.onLine);
    // navigator.onLine -> online, offline event -> offline
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    void on; void off;
  }, []);

  const checkHealth = async () => {
    setChecking(true);
    try {
      // Use /api/models as source of truth — it already probes providers
      const res = await fetch("/api/models");
      const body = (await res.json()) as { models?: unknown[]; errors?: Array<{ provider: string; message: string }> };
      const errs = body.errors ?? [];
      const errMap = new Map(errs.map((e) => [e.provider, e.message]));
      const ids = ["ollama", "lmstudio", "vllm", "openai", "openrouter", "anthropic"];
      const next: Health[] = ids.map((id) => {
        const cfg = DEFAULT_REGISTRY[id];
        if (!cfg) return { id, label: id, baseUrl: "", ok: null, message: "unknown" };
        const base = providerBase(id);
        const err = errMap.get(id);
        if (err) return { id, label: cfg.name, baseUrl: base, ok: false, message: err };
        const hasModels = Array.isArray(body.models) && (body.models as any[]).some((m: any) => (m.provider === id || m.providerId === id || m.id?.includes(id)));
        // For local providers, no error + no models may still mean not detected
        if (cfg.isLocal) {
          if (hasModels) return { id, label: cfg.name, baseUrl: base, ok: true, message: "Detected" };
          // If local but no models and no explicit error, treat as not detected when offline or when models empty
          const msg = `Not detected, start with ${id === "ollama" ? "ollama serve" : id === "lmstudio" ? "LM Studio server" : "local server"}`;
          return { id, label: cfg.name, baseUrl: base, ok: false, message: msg };
        }
        // cloud: ok if has models or no error
        if (!err) return { id, label: cfg.name, baseUrl: base, ok: true, message: hasModels ? "Available" : "Configured" };
        return { id, label: cfg.name, baseUrl: base, ok: false, message: err ?? "Unavailable" };
      });
      setHealths(next);
      // overallOk: true if any provider ok, else false if all local fail and offline etc.
      const anyOk = next.some((h) => h.ok === true);
      const allFail = next.every((h) => h.ok === false);
      setOverallOk(anyOk ? true : allFail ? false : null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setHealths((prev) =>
        prev.length
          ? prev.map((h) => ({ ...h, ok: false as const, message: msg }))
          : Object.values(DEFAULT_REGISTRY)
              .slice(0, 3)
              .map((c) => ({ id: c.id, label: c.name, baseUrl: c.baseURL, ok: false as const, message: msg })),
      );
      setOverallOk(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    void checkHealth();
    const iv = window.setInterval(() => void checkHealth(), 30_000);
    const onVis = () => {
      if (document.visibilityState === "visible") void checkHealth();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const dotColor = !online ? "var(--dsw-alias-state-error-primary)" : running ? "var(--dsw-alias-state-business-primary)" : overallOk === false ? "var(--dsw-alias-state-error-primary)" : overallOk === true ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-tertiary)";
  const tooltipLines = healths.map((h) => {
    const baseDisplay = h.baseUrl ? ` at ${h.baseUrl.replace(/^https?:\/\//, "")}` : "";
    const status = h.ok === true ? "● OK" : h.ok === false ? "● " + h.message : "● checking";
    return `${h.label}${baseDisplay} — ${status}`;
  });
  const tooltip = `Connection: ${!online ? "Offline" : checking ? "Checking…" : overallOk === true ? "Online" : overallOk === false ? "Degraded" : "Unknown"}\n` + tooltipLines.join("\n");

  return (
    <span className="statusline" title={tooltip} style={{ cursor: "help", position: "relative" }}>
      <span
        className="dot"
        style={{
          background: dotColor,
          width: 8,
          height: 8,
          borderRadius: "50%",
          display: "inline-block",
          boxShadow: running ? "0 0 0 4px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent)" : "none",
          transition: "background 160ms ease, box-shadow 160ms ease",
        }}
        aria-label={!online ? "offline" : overallOk === false ? "degraded" : "online"}
        role="status"
      />
      <span style={{ fontSize: 11 }}>{!online ? "offline" : running ? "streaming" : checking ? "checking…" : overallOk === false ? "degraded" : "online"}</span>
    </span>
  );
}
