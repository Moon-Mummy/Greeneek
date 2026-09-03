import React, { useState, useEffect } from "react";
import { useSettingsStore } from "../stores/settings.store";

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
  testResult: Record<string, { ok: boolean; message: string; kind?: string; lastTested?: number | string } | undefined>;
  onSave: (pid: string, raw: string) => void;
  onPatch: (patch: Record<string, unknown>, key: string) => void;
  onTest: (pid: string) => void;
  onClear: (pid: string) => void;
  // optional encryption wiring — if not passed, falls back to settings store / localStorage
  keysEncrypted?: boolean;
  encryptionPassphrase?: string | null;
  onToggleEncrypted?: (v: boolean) => void;
  onSetPassphrase?: (v: string | null) => void;
}) {
  const {
    providers,
    creds,
    setCreds,
    reveal,
    setReveal,
    fieldSaving,
    fieldStatus,
    setFieldStatus,
    testResult,
    onSave,
    onPatch,
    onTest,
    onClear,
  } = props;

  // encryption state — prefer props, else Zustand store, else legacy localStorage
  const storeKeysEncrypted = useSettingsStore((s) => s.keysEncrypted);
  const storePassphrase = useSettingsStore((s) => s.encryptionPassphrase);
  const storeSetKeysEncrypted = useSettingsStore((s) => s.setKeysEncrypted);
  const storeSetPassphrase = useSettingsStore((s) => s.setEncryptionPassphrase);

  const keysEncrypted =
    props.keysEncrypted !== undefined
      ? props.keysEncrypted
      : storeKeysEncrypted ?? (typeof window !== "undefined" && localStorage.getItem("greeneek.keys._encrypted") === "1");

  const passphrase =
    props.encryptionPassphrase !== undefined ? props.encryptionPassphrase : storePassphrase;

  const setKeysEncrypted = props.onToggleEncrypted ?? storeSetKeysEncrypted;
  const setPassphrase = props.onSetPassphrase ?? storeSetPassphrase;

  const [dangerConfirm, setDangerConfirm] = useState("");
  const [showDanger, setShowDanger] = useState(false);
  const [localPassphrase, setLocalPassphrase] = useState(passphrase ?? "");
  const [showPassphrase, setShowPassphrase] = useState(false);

  useEffect(() => {
    setLocalPassphrase(passphrase ?? "");
  }, [passphrase]);

  const localIds = ["ollama"];
  const cloudIds = ["openai", "openrouter", "anthropic", "deepseek"];

  const formatLastTested = (v: number | string | undefined) => {
    if (v === undefined || v === null || v === "") return "";
    try {
      const ts = typeof v === "string" ? Date.parse(v) : v;
      if (Number.isNaN(ts)) return String(v);
      return new Date(ts).toLocaleString();
    } catch {
      return String(v);
    }
  };

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
    // Verified / Invalid badge logic
    const verifiedBadge =
      test && test.ok ? (
        <span
          style={{
            marginLeft: 8,
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 999,
            background: "#dcfce7",
            color: "#166534",
            border: "1px solid #86efac",
          }}
          title={test.lastTested ? `Last tested: ${formatLastTested(test.lastTested)}` : undefined}
        >
          Verified{test.lastTested ? ` · ${formatLastTested(test.lastTested)}` : ""}
        </span>
      ) : test && !test.ok && test.message !== "Testing…" ? (
        <span
          style={{
            marginLeft: 8,
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 999,
            background: "#fee2e2",
            color: "#991b1b",
            border: "1px solid #fca5a5",
          }}
          title={test.lastTested ? `Last tested: ${formatLastTested(test.lastTested)}` : undefined}
        >
          Invalid{test.lastTested ? ` · ${formatLastTested(test.lastTested)}` : ""}
        </span>
      ) : null;

    return (
      <div
        key={pid}
        style={{
          border: "1px solid var(--outlineVariant)",
          borderRadius: 10,
          padding: 14,
          marginBottom: 12,
          background: isLocal ? "var(--surface-container-low)" : "var(--surface-container)",
        }}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <strong style={{ fontSize: 13 }}>{baseLabel}</strong>
            {isLocal ? (
              <span className="chip" style={{ marginLeft: 8, fontSize: 10, background: "var(--secondaryContainer)" }}>
                No API Key Required • Runs Locally • Free
              </span>
            ) : (
              <span className="chip" style={{ marginLeft: 8, fontSize: 10 }}>
                BYOK
              </span>
            )}
            {verifiedBadge}
            <div className="muted" style={{ fontSize: 11 }}>
              {String((prov?.baseUrl as string) ?? "")}
            </div>
          </div>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={Boolean(prov?.enabled)}
              onChange={(e) =>
                onPatch(
                  { providers: { [pid]: { enabled: e.target.checked } } } as unknown as Record<string, unknown>,
                  `providers.${pid}.enabled`
                )
              }
            />
            Enabled
          </label>
        </div>

        {isLocal ? (
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Runs on this device. Start the server and Refresh models — no key, no cloud call. Example:{" "}
            <code>ollama serve</code> then <code>ollama pull llama3.1:8b</code>.
          </p>
        ) : (
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor={`api-${pid}`} style={{ fontSize: 12 }}>
              API Key {masked ? "· Saved · " + masked.slice(0, 6) + "…" : "· Not Set"}
            </label>
            <div className="row" style={{ gap: 8 }}>
              <input
                id={`api-${pid}`}
                type={isRevealed ? "text" : "password"}
                value={displayValue}
                placeholder={pid === "openrouter" ? "sk-or-..." : pid === "deepseek" ? "sk-..." : "sk-..."}
                onChange={(e) => setCreds({ ...creds, [draftKey]: e.target.value })}
                style={{ flex: 1 }}
                aria-label={`${pid} api key`}
              />
              <button className="btn ghost" onClick={() => setReveal((r) => ({ ...r, [pid]: !isRevealed }))}>
                {isRevealed ? "Hide" : "Show"}
              </button>
              <button className="btn ghost" onClick={() => onClear(pid)}>
                Clear
              </button>
            </div>
            <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn secondary"
                disabled={saving}
                onClick={() => {
                  const raw = (creds[draftKey] ?? "").trim().replace(/^Bearer\s+/i, "");
                  if (!raw) {
                    setFieldStatus((s) => ({ ...s, [`providers.${pid}.apiKey`]: "Error: empty key" }));
                    return;
                  }
                  if (raw.length < 8) {
                    setFieldStatus((s) => ({ ...s, [`providers.${pid}.apiKey`]: "Error: key too short" }));
                    return;
                  }
                  onSave(pid, raw);
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button className="btn ghost" onClick={() => onTest(pid)}>
                Test connection
              </button>
              <span className="muted" style={{ fontSize: 12 }}>
                {status}
              </span>
            </div>
            {test && (
              <p
                style={{
                  fontSize: 12,
                  color: test.ok ? "var(--secondary)" : test.message === "Testing…" ? "var(--outline)" : "var(--error)",
                  marginTop: 6,
                }}
              >
                {test.ok ? "✓ " : test.message === "Testing…" ? "…" : "✗ "}
                {test.message} {test.kind ? `· ${test.kind}` : ""}{" "}
                {test.lastTested ? (
                  <span className="muted" style={{ fontSize: 11 }}>
                    · {formatLastTested(test.lastTested)}
                  </span>
                ) : null}
              </p>
            )}
            <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              Key stays on this device; only sent to {pid} when you chat with it. Never logged.
            </p>
          </div>
        )}

        <div className="field" style={{ marginTop: 10 }}>
          <label htmlFor={`base-${pid}`} style={{ fontSize: 12 }}>
            Base URL
          </label>
          <input
            id={`base-${pid}`}
            value={String(prov?.baseUrl ?? "")}
            placeholder={
              pid === "ollama"
                ? "http://127.0.0.1:11434/v1"
                : pid === "openrouter"
                  ? "https://openrouter.ai/api/v1"
                  : ""
            }
            onChange={(e) => {
              const v = e.target.value;
              // optimistic local edit
              onPatch(
                { providers: { [pid]: { baseUrl: v } } } as unknown as Record<string, unknown>,
                `providers.${pid}.baseUrl-draft`
              );
            }}
            onBlur={(e) => {
              const v = e.target.value.trim().replace(/\/$/, "");
              if (!v) return;
              try {
                new URL(v);
              } catch {
                setFieldStatus((s) => ({ ...s, [`providers.${pid}.baseUrl`]: "Error: invalid URL" }));
                return;
              }
              onPatch(
                { providers: { [pid]: { baseUrl: v } } } as unknown as Record<string, unknown>,
                `providers.${pid}.baseUrl`
              );
            }}
            style={{ width: "100%" }}
          />
          <span className="muted" style={{ fontSize: 11 }}>
            {fieldStatus[`providers.${pid}.baseUrl`]}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Amber warning when not encrypted */}
      {!keysEncrypted && (
        <div
          style={{
            background: "#fef3c7",
            border: "1px solid #f59e0b",
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 14,
            color: "#92400e",
            fontSize: 12,
          }}
          role="alert"
        >
          <strong>Security notice:</strong> API keys are stored unencrypted in this browser&apos;s local storage on this device. Only
          use on trusted personal devices. Enable encryption with a passphrase to protect keys at rest.
        </div>
      )}
      {keysEncrypted && (
        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #10b981",
            borderRadius: 8,
            padding: "10px 12px",
            marginBottom: 14,
            color: "#065f46",
            fontSize: 12,
          }}
        >
          🔒 Keys are encrypted on this device.
        </div>
      )}

      {/* Encryption toggle — AES-GCM */}
      <div
        style={{
          border: "1px solid var(--outlineVariant)",
          borderRadius: 10,
          padding: 14,
          marginBottom: 16,
          background: "var(--surface-container-low)",
        }}
      >
        <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
          <input
            type="checkbox"
            checked={Boolean(keysEncrypted)}
            onChange={(e) => {
              const v = e.target.checked;
              setKeysEncrypted(v);
              try {
                localStorage.setItem("greeneek.keys._encrypted", v ? "1" : "0");
              } catch {
                // ignore
              }
            }}
          />
          Encrypt keys at rest (AES-GCM)
        </label>
        {keysEncrypted && (
          <div style={{ marginTop: 10 }}>
            <label htmlFor="enc-passphrase" style={{ fontSize: 12 }}>
              Encryption passphrase
            </label>
            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <input
                id="enc-passphrase"
                type={showPassphrase ? "text" : "password"}
                value={localPassphrase}
                placeholder="Enter passphrase to encrypt keys"
                onChange={(e) => setLocalPassphrase(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="btn ghost" onClick={() => setShowPassphrase((s) => !s)}>
                {showPassphrase ? "Hide" : "Show"}
              </button>
              <button
                className="btn secondary"
                onClick={() => {
                  const v = localPassphrase.trim();
                  if (!v) {
                    // allow clearing passphrase only when disabling encryption
                    setPassphrase(null);
                    return;
                  }
                  if (v.length < 8) {
                    setFieldStatus((s) => ({ ...s, ["encryption.passphrase"]: "Error: passphrase too short (min 8)" }));
                    return;
                  }
                  setPassphrase(v);
                  try {
                    localStorage.setItem("greeneek.keys._passphrase_set", "1");
                  } catch {
                    // ignore
                  }
                  setFieldStatus((s) => ({ ...s, ["encryption.passphrase"]: "Saved ✓" }));
                  window.setTimeout(() => setFieldStatus((s) => ({ ...s, ["encryption.passphrase"]: "" })), 1600);
                }}
              >
                Save passphrase
              </button>
            </div>
            <span className="muted" style={{ fontSize: 11 }}>
              {fieldStatus["encryption.passphrase"] ?? ""}
            </span>
            <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              Keys are encrypted with <strong>AES-GCM</strong> using your passphrase. Passphrase is kept in memory only and never sent
              to any server; if you lose it you&apos;ll need to re-enter keys. Leave empty and disable toggle to store unencrypted.
            </p>
          </div>
        )}
        {!keysEncrypted && (
          <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
            Enable to encrypt API keys with AES-GCM before storing. You&apos;ll be prompted for the passphrase on next load.
          </p>
        )}
      </div>

      <h4 style={{ margin: "8px 0 8px 0" }}>Free & Local — No API Key Required</h4>
      {localIds.map((id) => renderRow(id, true))}

      <h4 style={{ margin: "16px 0 8px 0" }}>Bring Your Own Key (BYOK) — Cloud</h4>
      {cloudIds.map((id) => renderRow(id, false))}

      <div style={{ marginTop: 18, borderTop: "1px solid var(--outlineVariant)", paddingTop: 12 }}>
        <h4 style={{ color: "var(--error)", margin: 0 }}>Danger Zone</h4>
        <p className="muted" style={{ fontSize: 12 }}>
          Clear all API keys from this device. This cannot be undone.
        </p>
        <button
          className="btn ghost"
          style={{ color: "var(--error)", borderColor: "var(--error)" }}
          onClick={() => setShowDanger(true)}
        >
          Clear All Keys
        </button>
      </div>

      {/* Modal requiring typing CLEAR */}
      {showDanger && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirm clear all keys"
          onClick={() => {
            setShowDanger(false);
            setDangerConfirm("");
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 60,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface)",
              borderRadius: 12,
              padding: 20,
              maxWidth: 480,
              width: "100%",
              border: "1px solid var(--outlineVariant)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
            }}
          >
            <h3 style={{ margin: "0 0 8px 0", color: "var(--error)" }}>Clear all API keys?</h3>
            <p style={{ fontSize: 12, margin: "0 0 12px 0" }}>
              This will remove every stored API key from this browser. Traces and logs will be redacted and keys will be purged. Type{" "}
              <code>CLEAR</code> to confirm.
            </p>
            <input
              value={dangerConfirm}
              onChange={(e) => setDangerConfirm(e.target.value)}
              placeholder="CLEAR"
              autoFocus
              style={{ width: "100%", marginBottom: 12 }}
            />
            <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
              <button
                className="btn ghost"
                onClick={() => {
                  setShowDanger(false);
                  setDangerConfirm("");
                }}
              >
                Cancel
              </button>
              <button
                className="btn"
                style={{ background: "var(--error)", color: "white", opacity: dangerConfirm !== "CLEAR" ? 0.5 : 1 }}
                disabled={dangerConfirm !== "CLEAR"}
                onClick={() => {
                  for (const pid of [...localIds, ...cloudIds]) onClear(pid);
                  try {
                    localStorage.removeItem("greeneek.keys._passphrase_set");
                  } catch {
                    // ignore
                  }
                  setShowDanger(false);
                  setDangerConfirm("");
                }}
              >
                Confirm Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
