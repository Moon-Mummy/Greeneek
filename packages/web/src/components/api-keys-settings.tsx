import React, { useState } from "react";

// BYOK API Keys manager — grouped Local (no key) vs Cloud (BYOK), with Test/Clear/ShowHide, security banner, danger zone.
export function ApiKeysManager(props: {
  providers: Record<string, { apiKey?: string; baseUrl?: string; enabled?: boolean }>;
  creds: Record<string, string>;
  setCreds: (c: Record<string, string>) => void;
  reveal: Record<string, boolean>;
  setReveal: (f: (r: Record<string, boolean>) => Record<string, boolean>) => void;
  fieldSaving: Record<string, boolean>;
  fieldStatus: Record<string, string>;
  setFieldStatus: (f: (s: Record<string, string>) => Record<string, string>) => void;
  testResult: Record<string, { ok: boolean; message: string; kind?: string } | undefined>;
  onSave: (pid: string, raw: string) => void;
  onPatch: (patch: Record<string, unknown>, key: string) => void;
  onTest: (pid: string) => void;
  onClear: (pid: string) => void;
}) {
  const { providers, creds, setCreds, reveal, setReveal, fieldSaving, fieldStatus, setFieldStatus, testResult, onSave, onPatch, onTest, onClear } = props;
  const [dangerConfirm, setDangerConfirm] = useState("");
  const [showDanger, setShowDanger] = useState(false);
  // encryption state — read from localStorage (set by SecureStore)
  const isEncrypted = typeof window !== "undefined" && localStorage.getItem("greeneek.keys._encrypted") === "1";

  const localIds = ["ollama"];
  const cloudIds = ["openai", "openrouter", "anthropic", "deepseek"];

  const renderRow = (pid: string, isLocal: boolean) => {
    const prov = providers[pid] as Record<string, unknown> | undefined;
    const draftKey = `${pid.toUpperCase()}_API_KEY`;
    const masked = prov?.apiKey ? String(prov.apiKey) : "";
    const displayValue = creds[draftKey] !== undefined ? creds[draftKey] : masked;
    const isRevealed = reveal[pid] ?? false;
    const saving = fieldSaving[`providers.${pid}.apiKey`] ?? false;
    const status = fieldStatus[`providers.${pid}.apiKey`] ?? "";
    const test = testResult[pid];
    const baseLabel = pid === "ollama" ? "Local endpoint" : pid === "deepseek" ? "DeepSeek (BYOK)" : pid.charAt(0).toUpperCase() + pid.slice(1);
    return (
      <div key={pid} style={{ border: "1px solid var(--outlineVariant)", borderRadius: 10, padding: 14, marginBottom: 12, background: isLocal ? "var(--surface-container-low)" : "var(--surface-container)" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <strong style={{ fontSize: 13 }}>{baseLabel}</strong>
            {isLocal ? <span className="chip" style={{ marginLeft: 8, fontSize: 10, background: "var(--secondaryContainer)" }}>No API Key Required • Runs Locally • Free</span> : <span className="chip" style={{ marginLeft: 8, fontSize: 10 }}>BYOK</span>}
            <div className="muted" style={{ fontSize: 11 }}>{String((prov?.baseUrl as string) ?? "")}</div>
          </div>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input type="checkbox" checked={Boolean(prov?.enabled)} onChange={(e) => onPatch({ providers: { [pid]: { enabled: e.target.checked } } } as unknown as Record<string, unknown>, `providers.${pid}.enabled`)} />
            Enabled
          </label>
        </div>

        {isLocal ? (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Runs on this device. Start the server and Refresh models — no key, no cloud call. Example: <code>ollama serve</code> then <code>ollama pull llama3.1:8b</code>.</p>
        ) : (
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor={`api-${pid}`} style={{ fontSize: 12 }}>API Key {masked ? "· Saved · " + masked.slice(0, 6) + "…" : "· Not Set"}</label>
            <div className="row" style={{ gap: 8 }}>
              <input id={`api-${pid}`} type={isRevealed ? "text" : "password"} value={displayValue} placeholder={pid === "openrouter" ? "sk-or-..." : pid === "deepseek" ? "sk-..." : "sk-..."} onChange={(e) => setCreds({ ...creds, [draftKey]: e.target.value })} style={{ flex: 1 }} aria-label={`${pid} api key`} />
              <button className="btn ghost" onClick={() => setReveal((r) => ({ ...r, [pid]: !isRevealed }))}>{isRevealed ? "Hide" : "Show"}</button>
              <button className="btn ghost" onClick={() => onClear(pid)}>Clear</button>
            </div>
            <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
              <button className="btn secondary" disabled={saving} onClick={() => {
                const raw = (creds[draftKey] ?? "").trim().replace(/^Bearer\s+/i, "");
                if (!raw) { setFieldStatus((s) => ({ ...s, [`providers.${pid}.apiKey`]: "Error: empty key" })); return; }
                if (raw.length < 8) { setFieldStatus((s) => ({ ...s, [`providers.${pid}.apiKey`]: "Error: key too short" })); return; }
                onSave(pid, raw);
              }}>{saving ? "Saving…" : "Save"}</button>
              <button className="btn ghost" onClick={() => onTest(pid)}>Test connection</button>
              <span className="muted" style={{ fontSize: 12 }}>{status}</span>
            </div>
            {test && <p style={{ fontSize: 12, color: test.ok ? "var(--secondary)" : "var(--error)", marginTop: 6 }}>{test.ok ? "✓ " : "✗ "}{test.message} {test.kind ? `· ${test.kind}` : ""}</p>}
            <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>Key stays on this device; only sent to {pid} when you chat with it. Never logged.</p>
          </div>
        )}

        <div className="field" style={{ marginTop: 10 }}>
          <label htmlFor={`base-${pid}`} style={{ fontSize: 12 }}>Base URL</label>
          <input id={`base-${pid}`} value={String(prov?.baseUrl ?? "")} placeholder={pid === "ollama" ? "http://127.0.0.1:11434/v1" : pid === "openrouter" ? "https://openrouter.ai/api/v1" : ""} onChange={(e) => {
            const v = e.target.value;
            // optimistic local edit
            onPatch({ providers: { [pid]: { baseUrl: v } } } as unknown as Record<string, unknown>, `providers.${pid}.baseUrl-draft`);
          }} onBlur={(e) => {
            const v = e.target.value.trim().replace(/\/$/, "");
            if (!v) return;
            try { new URL(v); } catch { setFieldStatus((s) => ({ ...s, [`providers.${pid}.baseUrl`]: "Error: invalid URL" })); return; }
            onPatch({ providers: { [pid]: { baseUrl: v } } } as unknown as Record<string, unknown>, `providers.${pid}.baseUrl`);
          }} style={{ width: "100%" }} />
          <span className="muted" style={{ fontSize: 11 }}>{fieldStatus[`providers.${pid}.baseUrl`]}</span>
        </div>
      </div>
    );
  };

  return (
    <div>
      {!isEncrypted && (
        <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, padding: "10px 12px", marginBottom: 14, color: "#92400e", fontSize: 12 }}>
          <strong>Security notice:</strong> API keys are stored unencrypted in this browser's local storage on this device. Only use on trusted personal devices. Enable encryption with a passphrase to protect keys at rest.
        </div>
      )}
      {isEncrypted && (
        <div style={{ background: "#ecfdf5", border: "1px solid #10b981", borderRadius: 8, padding: "10px 12px", marginBottom: 14, color: "#065f46", fontSize: 12 }}>🔒 Keys are encrypted on this device.</div>
      )}

      <h4 style={{ margin: "8px 0 8px 0" }}>Free & Local — No API Key Required</h4>
      {localIds.map((id) => renderRow(id, true))}

      <h4 style={{ margin: "16px 0 8px 0" }}>Bring Your Own Key (BYOK) — Cloud</h4>
      {cloudIds.map((id) => renderRow(id, false))}

      <div style={{ marginTop: 18, borderTop: "1px solid var(--outlineVariant)", paddingTop: 12 }}>
        <h4 style={{ color: "var(--error)", margin: 0 }}>Danger Zone</h4>
        <p className="muted" style={{ fontSize: 12 }}>Clear all API keys from this device. This cannot be undone.</p>
        {!showDanger ? (
          <button className="btn ghost" style={{ color: "var(--error)", borderColor: "var(--error)" }} onClick={() => setShowDanger(true)}>Clear All Keys</button>
        ) : (
          <div style={{ border: "1px solid var(--error)", borderRadius: 8, padding: 12 }}>
            <p style={{ fontSize: 12 }}>Type <code>CLEAR KEYS</code> to confirm:</p>
            <div className="row" style={{ gap: 8 }}>
              <input value={dangerConfirm} onChange={(e) => setDangerConfirm(e.target.value)} placeholder="CLEAR KEYS" style={{ flex: 1 }} />
              <button className="btn" style={{ background: "var(--error)", color: "white" }} disabled={dangerConfirm !== "CLEAR KEYS"} onClick={() => {
                for (const pid of [...localIds, ...cloudIds]) onClear(pid);
                setShowDanger(false); setDangerConfirm("");
              }}>Confirm Clear All</button>
              <button className="btn ghost" onClick={() => { setShowDanger(false); setDangerConfirm(""); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
