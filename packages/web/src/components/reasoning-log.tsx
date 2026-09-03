import React, { useEffect, useState, useRef } from "react";

export function ReasoningLog(props: {
  content: string;
  streaming?: boolean;
  enabled?: boolean;
  onToggleEnabled?: (v: boolean) => void;
}) {
  const { content, streaming, enabled = true, onToggleEnabled } = props;
  // collapsed by default, auto-expand while streaming
  const [open, setOpen] = useState(false);
  const wasStreaming = useRef(false);

  useEffect(() => {
    if (streaming && !wasStreaming.current) {
      setOpen(true);
    }
    wasStreaming.current = !!streaming;
  }, [streaming]);

  useEffect(() => {
    // if streaming just started and there is content, ensure open
    if (streaming && content) setOpen(true);
  }, [streaming, content]);

  if (!content && !streaming) return null;

  const hasContent = Boolean(content);
  const show = open || !!streaming;
  // When reasoning is disabled via settings, we render collapsed with toggle
  const visible = show && enabled;

  return (
    <div
      className="reasoning-log"
      style={{
        margin: "6px 0",
        border: "0.5px solid var(--dsw-alias-border-l2)",
        borderRadius: "10px",
        overflow: "hidden",
        background: "var(--dsw-alias-bg-layer-1)",
      }}
      aria-live="polite"
      aria-busy={streaming ? "true" : "false"}
    >
      <div
        className="reasoning-log-header row"
        role="button"
        tabIndex={0}
        aria-expanded={show}
        aria-controls="reasoning-body"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        style={{
          padding: "7px 10px",
          background: "var(--dsw-alias-bg-layer-2)",
          cursor: "pointer",
          alignItems: "center",
          gap: 8,
          userSelect: "none",
          borderBottom: visible ? "0.5px solid var(--dsw-alias-border-l2)" : "none",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 650, letterSpacing: "-0.01em", color: "var(--dsw-alias-label-primary)" }}>
          Reasoning {streaming ? "· streaming…" : hasContent ? `· ${content.length} chars` : ""}
        </span>
        {!streaming && hasContent && <span style={{ fontSize: 11, color: "var(--dsw-alias-label-secondary)" }}>{open ? "hide" : "show"}</span>}
        {streaming && <span className="spinner" aria-hidden style={{ width: 12, height: 12, borderWidth: 1.5 }} />}
        <span style={{ flex: 1 }} />
        {onToggleEnabled && (
          <label
            style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, color: "var(--dsw-alias-label-secondary)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <input type="checkbox" checked={enabled} onChange={(e) => onToggleEnabled(e.target.checked)} aria-label="Show reasoning" />
            Show
          </label>
        )}
        <button
          className="btn ghost"
          style={{ fontSize: 11, padding: "2px 8px", height: 24 }}
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard.writeText(content);
          }}
          aria-label="Copy reasoning"
        >
          Copy
        </button>
        <span aria-hidden style={{ fontSize: 11, color: "var(--dsw-alias-label-secondary)", minWidth: 12, textAlign: "center" }}>
          {show ? "▾" : "▸"}
        </span>
      </div>
      {visible && (
        <pre
          id="reasoning-body"
          style={{
            margin: 0,
            padding: "10px 12px",
            fontSize: 12,
            lineHeight: "18px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 320,
            overflowY: "auto",
            background: "var(--dsw-alias-bg-layer-1)",
            color: "var(--dsw-alias-label-secondary)",
            fontFamily: "var(--ds-font-family-code)",
          }}
        >
          {content || (streaming ? "Thinking…" : "")}
          {streaming && <span style={{ opacity: 0.6 }}> ▌</span>}
        </pre>
      )}
      {show && !enabled && (
        <p className="muted" style={{ margin: 0, padding: "8px 12px", fontSize: 11 }}>
          Reasoning hidden — toggle Show to reveal.
        </p>
      )}
    </div>
  );
}
