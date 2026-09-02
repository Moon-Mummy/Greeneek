import React, { useCallback } from "react";

export type VisionAttachment = { id: string; name: string; mimeType: string; dataUrl: string; size: number };

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function fileToAttachment(file: File): Promise<VisionAttachment | null> {
  return new Promise((resolve) => {
    if (!ACCEPT.includes(file.type)) return resolve(null);
    if (file.size > MAX_BYTES) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      resolve({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: file.name, mimeType: file.type, dataUrl, size: file.size });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export function VisionDropzone(props: {
  attachments: VisionAttachment[];
  onAttachments: (next: VisionAttachment[]) => void;
  disabled?: boolean;
}) {
  const { attachments, onAttachments, disabled } = props;
  const addFiles = useCallback(async (files: FileList | File[]) => {
    const next: VisionAttachment[] = [...attachments];
    for (const f of Array.from(files)) {
      const att = await fileToAttachment(f);
      if (att) next.push(att);
    }
    // cap at 4 images
    onAttachments(next.slice(0, 4));
  }, [attachments, onAttachments]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
  }, [addFiles, disabled]);

  const onPaste = useCallback((e: React.ClipboardEvent) => {
    if (disabled) return;
    const files = Array.from(e.clipboardData.items).filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter(Boolean) as File[];
    if (files.length) void addFiles(files);
  }, [addFiles, disabled]);

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onPaste={onPaste}
      style={{ border: attachments.length ? "1px solid var(--outlineVariant)" : "1px dashed var(--outlineVariant)", borderRadius: 8, padding: attachments.length ? 8 : 10, background: "var(--surfaceContainerLowest)" }}
    >
      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label className="btn ghost" style={{ fontSize: 12, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 }}>
          Attach image
          <input type="file" accept={ACCEPT.join(",")} multiple hidden disabled={disabled} onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
        </label>
        <span className="muted" style={{ fontSize: 11 }}>Drag & drop, paste, or click — up to 4 images (PNG/JPG/WebP, max 4MB each). Vision models will use them; other models get OCR text.</span>
        {attachments.length > 0 && <button className="btn ghost" style={{ fontSize: 11 }} onClick={() => onAttachments([])} disabled={disabled}>Clear</button>}
      </div>
      {attachments.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          {attachments.map((a) => (
            <div key={a.id} style={{ position: "relative", width: 96, height: 96, borderRadius: 8, overflow: "hidden", border: "1px solid var(--outlineVariant)", background: "var(--surface)" }}>
              <img src={a.dataUrl} alt={a.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button
                onClick={() => onAttachments(attachments.filter((x) => x.id !== a.id))}
                aria-label="remove"
                style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.6)", color: "white", border: "none", borderRadius: 10, width: 20, height: 20, cursor: "pointer", fontSize: 12 }}
              >×</button>
              <span style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "rgba(0,0,0,0.5)", color: "white", fontSize: 9, padding: "1px 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
