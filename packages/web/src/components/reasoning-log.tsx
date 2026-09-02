import React, { useState } from "react";

export function ReasoningLog(props: {
  content: string;
  streaming?: boolean;
  enabled?: boolean;
  onToggleEnabled?: (v: boolean) => void;
}) {
  const { content, streaming, enabled = true, onToggleEnabled } = props;
  const [open, setOpen] = useState(false);
  if (!content && !streaming) return null;
  // Auto-open while streaming if there is content
  const show = open || !!streaming;
  return (
    <div style={{ margin: "6px 0", border: "1px solid var(--outlineVariant)", borderRadius: 8, overflow: "hidden" }}>
      <div
        className="row"
        style={{ padding: "6px 10px", background: "var(--surfaceContainerLow)", cursor: "pointer", alignItems: "center", gap: 8 }}
        onClick={() => setOpen((o) => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen((o) => !o); }}
        aria-expanded={show}
      >
        <span style={{ fontSize: 12, fontWeight: 600 }}>Reasoning {streaming ? "· streaming…" : ""}</span>
        <span className="muted" style={{ fontSize: 11 }}>{content ? `${content.length} chars` : ""}</span>
        <span className="spacer" />
        {onToggleEnabled && (
          <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }} onClick={(e) => e.stopPropagation()}>
            <input type="checkbox" checked={enabled} onChange={(e) => onToggleEnabled(e.target.checked)} /> Show
          </label>
        )}
        <button className="btn ghost" style={{ fontSize: 11, padding: "2px 6px" }} onClick={(e) => { e.stopPropagation(); void navigator.clipboard.writeText(content); }}>Copy</button>
        <span style={{ fontSize: 11 }}>{show ? "▾" : "▸"}</span>
      </div>
      {show && enabled && (
        <pre style={{ margin: 0, padding: "10px 12px", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 280, overflowY: "auto", background: "var(--surface)" }}>
          {content || (streaming ? "Thinking…" : "")}
          {streaming && <span style={{ opacity: 0.6 }}> ▌</span>}
        </pre>
      )}
      {show && !enabled && <p className="muted" style={{ margin: 0, padding: "8px 12px", fontSize: 11 }}>Reasoning hidden — toggle Show to reveal.</p>}
    </div>
  );
}
