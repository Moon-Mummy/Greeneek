import React, { useCallback, useEffect, useRef, useState } from "react";
import { isVisionModel } from "../lib/vision-ocr";

export type VisionAttachment = { id: string; name: string; mimeType: string; dataUrl: string; size: number };

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
const ACCEPT_MIME_SET = new Set<string>(ACCEPT as unknown as string[]);

function fileToAttachment(file: File): Promise<VisionAttachment | null> {
  return new Promise((resolve) => {
    if (!ACCEPT_MIME_SET.has(file.type)) return resolve(null);
    if (file.size > MAX_BYTES) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      resolve({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name || `image-${Date.now()}.${file.type.split("/")[1] ?? "png"}`,
        mimeType: file.type,
        dataUrl,
        size: file.size,
      });
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export function VisionDropzone(props: {
  attachments: VisionAttachment[];
  onAttachments: (next: VisionAttachment[]) => void;
  disabled?: boolean;
  modelId?: string;
  onToast?: (msg: string) => void;
}) {
  const { attachments, onAttachments, disabled, modelId, onToast } = props;
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isVision = modelId ? isVisionModel(modelId) : true;
  const guardMessage = modelId && !isVision ? `Model “${modelId}” may not support vision — images will be OCR’d as text fallback.` : "";

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (!arr.length) return;
      const next: VisionAttachment[] = [...attachments];
      let rejectedType = 0;
      let rejectedSize = 0;
      let added = 0;
      for (const f of arr) {
        if (!ACCEPT_MIME_SET.has(f.type)) {
          rejectedType++;
          continue;
        }
        if (f.size > MAX_BYTES) {
          rejectedSize++;
          continue;
        }
        const att = await fileToAttachment(f);
        if (att) {
          next.push(att);
          added++;
        }
        if (next.length >= 4) break;
      }
      const capped = next.slice(0, 4);
      if (capped.length !== next.length) {
        onToast?.("At most 4 images — extra ignored.");
      }
      if (rejectedType) onToast?.(`${rejectedType} file(s) skipped — only PNG/JPG/WebP/GIF allowed.`);
      if (rejectedSize) onToast?.(`${rejectedSize} file(s) skipped — max 4MB each.`);
      if (modelId && !isVision && added > 0) {
        onToast?.(guardMessage);
      }
      onAttachments(capped);
    },
    [attachments, onAttachments, modelId, isVision, guardMessage, onToast],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      if (disabled) return;
      if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
      // also handle items with image data url drop?
    },
    [addFiles, disabled],
  );

  const onPasteDiv = useCallback(
    (e: React.ClipboardEvent) => {
      if (disabled) return;
      const files = Array.from(e.clipboardData.items)
        .filter((i) => i.kind === "file")
        .map((i) => i.getAsFile())
        .filter(Boolean) as File[];
      if (files.length) {
        e.preventDefault();
        void addFiles(files);
      }
    },
    [addFiles, disabled],
  );

  // Global window paste for Ctrl+V anywhere (hardened)
  useEffect(() => {
    const onWindowPaste = (e: ClipboardEvent) => {
      if (disabled) return;
      // Only handle if composer or dropzone area not explicitly prevented?
      // Guard: ignore when typing in input if we already handled? We still support global.
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const item of Array.from(items)) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        // Don't preventDefault globally if user might be pasting text elsewhere, only if we have images
        void addFiles(files);
      }
    };
    window.addEventListener("paste", onWindowPaste as EventListener);
    return () => window.removeEventListener("paste", onWindowPaste as EventListener);
  }, [addFiles, disabled]);

  const removeOne = (id: string) => {
    onAttachments(attachments.filter((x) => x.id !== id));
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragActive(true);
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) setDragActive(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setDragActive(false);
      }}
      onDrop={onDrop}
      onPaste={onPasteDiv}
      aria-label="Image dropzone — drag & drop images or paste with Ctrl+V"
      role="region"
      tabIndex={-1}
      style={{
        border: dragActive ? "1.5px solid var(--accent)" : attachments.length ? "0.5px solid var(--stroke)" : "1px dashed var(--outline-variant)",
        borderRadius: "10px",
        padding: attachments.length ? 8 : 10,
        background: dragActive ? "color-mix(in srgb, var(--accent) 7%, var(--surface-container-lowest))" : "var(--surface-container-lowest)",
        transition: "border-color 120ms ease, background 120ms ease",
        outline: dragActive ? "2px solid color-mix(in srgb, var(--accent) 22%, transparent)" : "none",
        outlineOffset: 2,
      }}
      title={guardMessage || "Drop images here, or press Ctrl+V to paste from clipboard"}
    >
      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label
          className="btn ghost"
          style={{ fontSize: 12, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 }}
          title={guardMessage || "Attach image (PNG/JPG/WebP/GIF, 4MB max, up to 4). Paste with Ctrl+V."}
        >
          Attach image
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT.join(",")}
            multiple
            hidden
            disabled={disabled}
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <span className="muted" style={{ fontSize: 11, lineHeight: "15px" }}>
          Drag & drop, paste (Ctrl+V), or click — up to 4 images (PNG/JPG/WebP, max 4MB each).{" "}
          <span title={guardMessage || "Vision-model check"} style={{ textDecoration: modelId && !isVision ? "underline dotted" : "none", cursor: modelId && !isVision ? "help" : "auto" }}>
            {modelId && !isVision ? "⚠ non-vision model → OCR fallback" : "Vision models will receive image_url; others get OCR text."}
          </span>
        </span>
        {attachments.length > 0 && (
          <button className="btn ghost" style={{ fontSize: 11, marginLeft: "auto" }} onClick={() => onAttachments([])} disabled={disabled} aria-label="Clear all attachments">
            Clear
          </button>
        )}
      </div>

      {attachments.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }} role="list" aria-label="Attached images">
          {attachments.map((a) => (
            <div
              key={a.id}
              role="listitem"
              style={{
                position: "relative",
                width: 96,
                height: 96,
                borderRadius: 8,
                overflow: "hidden",
                border: "0.5px solid var(--stroke)",
                background: "var(--surface)",
              }}
              title={`${a.name} · ${(a.size / 1024).toFixed(0)}KB · ${a.mimeType}`}
            >
              <img src={a.dataUrl} alt={a.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="lazy" />
              <button
                onClick={() => removeOne(a.id)}
                aria-label={`Remove ${a.name}`}
                title="Remove image"
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  background: "rgba(0,0,0,0.62)",
                  color: "white",
                  border: "none",
                  borderRadius: 10,
                  width: 22,
                  height: 22,
                  cursor: "pointer",
                  fontSize: 13,
                  lineHeight: "22px",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
              <span
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: "rgba(0,0,0,0.52)",
                  color: "white",
                  fontSize: 9,
                  padding: "1px 4px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {a.name}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Helper mapping note for dev / accessibility */}
      <span style={{ display: "none" }} aria-hidden>
        Mapping: vision-capable provider → image_url content parts; others → images[] with OCR fallback client-side.
      </span>
    </div>
  );
}

// Helper to map attachments to payload shape — ensures image_url vs images[] correctness
export function attachmentsToPayload(attachments: VisionAttachment[]): { images: { dataUrl: string; mimeType: string; name: string }[] } | undefined {
  if (!attachments.length) return undefined;
  return {
    images: attachments.map((a) => ({ dataUrl: a.dataUrl, mimeType: a.mimeType, name: a.name })),
  };
}
