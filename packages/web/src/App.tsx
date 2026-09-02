import React, { useCallback, useEffect, useRef, useState } from "react";
import { en } from "./locales/en";
import { es } from "./locales/es";
import { ApiKeysManager } from "./components/api-keys-settings";
import { ModelPickerGrouped } from "./components/model-selector";
import { ReasoningLog } from "./components/reasoning-log";
import { VisionDropzone, type VisionAttachment } from "./components/vision-dropzone";
import { ocrDataUrl, isVisionModel } from "./lib/vision-ocr";
import { ErrorBoundary, OfflineBanner, Skeleton } from "./components/hardening";

type Lang = "en" | "es";
const tDict = { en, es } as const;

type Item =
  | { kind: "user"; text: string; images?: { dataUrl: string; name: string; mimeType: string }[] }
  | { kind: "assistant"; text: string; streaming?: boolean; reasoningContent?: string; reasoningStreaming?: boolean; usage?: { inputTokens: number; outputTokens: number }; modelId?: string; providerId?: string; latencyMs?: number }
  | { kind: "tool"; name: string; ok: boolean; output: string; durationMs: number; running?: boolean }
  | { kind: "system"; text: string };

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextLength?: number;
  pricing?: { promptPer1M?: number; completionPer1M?: number; isFree: boolean };
  supportsTools?: boolean;
  supportsStreaming: boolean;
}

interface Meta {
  name: string;
  version: string;
  profile: string;
  accent: string;
  provider?: { provider: string; model: string };
  plan: string;
  usage: { tokens: number; usd: number; requests: number };
}

interface Plugin {
  id: string;
  name: string;
  description: string;
  version: string;
  verified?: boolean;
  publisher?: string;
}

interface AuditEntry {
  seq: number;
  ts: number;
  actor: string;
  action: string;
  resource: string;
  detail: Record<string, unknown>;
  hash: string;
}

function t(lang: Lang, key: keyof typeof en): string {
  return tDict[lang][key] ?? en[key] ?? key;
}

const LOGO = "/assets/logo-mark.png";

function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const parts = text.split(/(`[^`]+`)/g);
  parts.forEach((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      out.push(
        <code key={i} style={{ fontFamily: "var(--font-technical)", fontSize: "12px", background: "var(--surface-container-high)", padding: "1px 5px", borderRadius: "4px" }}>
          {part.slice(1, -1)}
        </code>,
      );
    } else {
      out.push(part);
    }
  });
  return out;
}

function Markdown({ text }: { text: string }): React.ReactNode {
  const blocks = text.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {blocks.map((block, i) => {
        if (block.startsWith("```")) {
          const body = block.replace(/^```[a-z]*\n?/, "").replace(/```$/, "");
          return (
            <div className="terminal" key={i} style={{ margin: "8px 0" }}>
              <pre>{body}</pre>
            </div>
          );
        }
        return <span key={i}>{renderInline(block)}</span>;
      })}
    </>
  );
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

const SpeechCtor: (new () => SpeechRecognitionLike) | undefined =
  (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike; SpeechRecognition?: new () => SpeechRecognitionLike })
    .webkitSpeechRecognition ??
  (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition;

type SettingsTab = "providers" | "api-keys" | "plugins" | "defaults" | "tracing" | "advanced" | "data" | "diagnostics" | "billing" | "marketplace" | "audit" | "about";

export default function App() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("gk.lang") as Lang) ?? "en");
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<SettingsTab>("providers");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [registryPlugins, setRegistryPlugins] = useState<Array<{ id: string; name: string; version: string; description: string; kinds: string[]; permissions: string[]; status: string; error?: string; enabled: boolean }>>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [traces, setTraces] = useState<Array<{ runId: string; traceId: string; conversationId?: string; modelId: string; providerId: string; modeId: string; status: string; startedAt: string; latencyMs?: number; usage?: { promptTokens: number; completionTokens: number; costUsd?: number }; error?: { kind: string; message: string } }>>([]);
  const [tracesLoading, setTracesLoading] = useState(false);
  const [tracesOpen, setTracesOpen] = useState(false);
  const [selectedTrace, setSelectedTrace] = useState<{ run: unknown; spans: unknown[] } | null>(null);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const itemsRef = useRef(items);
  const [attachments, setAttachments] = useState<VisionAttachment[]>([]);

  const [settings, setSettings] = useState<Record<string, unknown> | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [fieldSaving, setFieldSaving] = useState<Record<string, boolean>>({});
  const [fieldStatus, setFieldStatus] = useState<Record<string, string>>({});
  const showReasoning = (((settings as unknown as Record<string, unknown> | null)?.behavior as Record<string, unknown> | undefined)?.showReasoning as boolean | undefined) ?? true;
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string; kind?: string }>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  // Phase 4 — per-conversation model/mode, picker state
  const [conversationModel, setConversationModel] = useState<string>(() => localStorage.getItem("gk.model.current") ?? "");
  const [conversationMode, setConversationMode] = useState<string>(() => localStorage.getItem("gk.mode.current") ?? "chat");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [modes, setModes] = useState<Array<{ id: string; label: string; description: string; capabilities: { tools: boolean; multiStep: boolean; sideEffects: string } }>>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsUpdatedAt, setModelsUpdatedAt] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("gk.model.favorites") ?? "[]"); } catch { return []; }
  });
  const [recents, setRecents] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("gk.model.recents") ?? "[]"); } catch { return []; }
  });

  const loadSettings = async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (res.ok) setSettings(await res.json() as Record<string, unknown>);
    } catch {
      // keep null
    } finally {
      setSettingsLoading(false);
    }
  };

  const patchSettings = async (patch: Record<string, unknown>, field: string) => {
    setFieldSaving((s) => ({ ...s, [field]: true }));
    setFieldStatus((s) => ({ ...s, [field]: "" }));
    try {
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
      const body = await res.json() as Record<string, unknown>;
      if (!res.ok) throw new Error((body.message as string) ?? "save failed");
      setSettings(body as Record<string, unknown>);
      setFieldStatus((s) => ({ ...s, [field]: "Saved ✓" }));
      void loadMeta();
      window.setTimeout(() => setFieldStatus((s) => ({ ...s, [field]: "" })), 1800);
    } catch (e) {
      setFieldStatus((s) => ({ ...s, [field]: `Error: ${e instanceof Error ? e.message : String(e)}` }));
    } finally {
      setFieldSaving((s) => ({ ...s, [field]: false }));
    }
  };

  const testProvider = async (provider: string) => {
    const prov = (settings?.providers as Record<string, Record<string, unknown>> | undefined)?.[provider];
    const baseUrl = prov?.baseUrl ? String(prov.baseUrl) : undefined;
    // Use draft cred if present (unmasked), else use settings masked check
    const draftKey = creds[`${provider.toUpperCase()}_API_KEY`];
    const rawKey = draftKey ?? (prov?.apiKey ? String(prov.apiKey) : "");
    if (!rawKey || rawKey === "****") {
      setTestResult((r) => ({ ...r, [provider]: { ok: false, message: "Enter API key first (masked value cannot be tested — re-enter to test)" } }));
      return;
    }
    setTestResult((r) => ({ ...r, [provider]: { ok: false, message: "Testing…" } }));
    try {
      const res = await fetch("/api/settings/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, apiKey: rawKey, baseUrl }) });
      const body = await res.json() as { ok: boolean; message: string; kind?: string; details?: unknown };
      setTestResult((r) => ({ ...r, [provider]: body }));
    } catch (e) {
      setTestResult((r) => ({ ...r, [provider]: { ok: false, message: e instanceof Error ? e.message : String(e) } }));
    }
  };

  const loadModes = async () => {
    try {
      const res = await fetch("/api/modes");
      if (res.ok) {
        const body = await res.json() as { modes: Array<{ id: string; label: string; description: string; capabilities: { tools: boolean; multiStep: boolean; sideEffects: string } }> };
        setModes(body.modes);
      }
    } catch {
      // ignore
    }
  };

  // Phase 4 — model picker helpers
  const loadModels = async (force = false) => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const res = await fetch(`/api/models${force ? "?refresh=1" : ""}`);
      const body = await res.json() as { models?: ModelInfo[]; errors?: unknown[]; updatedAt?: string };
      if (!res.ok) throw new Error((body as unknown as { message?: string }).message ?? "failed");
      setModels((body.models ?? []) as ModelInfo[]);
      setModelsUpdatedAt(body.updatedAt ?? new Date().toISOString());
      if ((body.models ?? []).length === 0) setModelsError("No models available — enable and test a provider in Settings → Providers");
    } catch (e) {
      // Retry once on transient failure when online
      if (!force && navigator.onLine && !models.length) {
        try { await new Promise((r) => setTimeout(r, 700)); const r2 = await fetch(`/api/models?refresh=1`); const b2 = await r2.json() as { models?: ModelInfo[]; updatedAt?: string }; if (r2.ok && Array.isArray(b2.models) && b2.models.length) { setModels(b2.models as ModelInfo[]); setModelsUpdatedAt(b2.updatedAt ?? new Date().toISOString()); setModelsError(null); return; } } catch { /* fall through */ }
      }
      // Offline degrade: use cached fallback if any models already loaded, else show error
      if (models.length) {
        // keep cached list, show warning
        setModelsError(`Failed to refresh — showing cached list: ${e instanceof Error ? e.message : String(e)}`);
      } else {
        setModelsError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setModelsLoading(false);
    }
  };

  const persistModel = (modelId: string, _provider: string) => {
    const prev = conversationModel;
    setConversationModel(modelId);
    localStorage.setItem("gk.model.current", modelId);
    if (sessionRef.current) localStorage.setItem(`gk.model.${sessionRef.current}`, modelId);
    // Recents (MRU, up to 8)
    setRecents((r) => {
      const next = [modelId, ...r.filter((x) => x !== modelId)].slice(0, 8);
      localStorage.setItem("gk.model.recents", JSON.stringify(next));
      return next;
    });
    // System note if switching mid-conversation
    if (prev && prev !== modelId && items.length > 0) {
      setItems((prevItems) => [...prevItems, { kind: "system", text: `Switched to ${modelId}` }]);
    }
    void loadMeta();
  };

  const toggleFavorite = (id: string) => {
    setFavorites((f) => {
      const next = f.includes(id) ? f.filter((x) => x !== id) : [...f, id];
      localStorage.setItem("gk.model.favorites", JSON.stringify(next));
      return next;
    });
  };

  const setDefaultModel = async (modelId: string) => {
    await patchSettings({ defaults: { modelId } } as unknown as Record<string, unknown>, "defaults.modelId");
    notify(`Default for new chats: ${modelId}`);
  };

  // Hydrate conversation model on session change / settings load
  useEffect(() => {
    const sid = sessionRef.current;
    if (sid) {
      const stored = localStorage.getItem(`gk.model.${sid}`);
      if (stored) setConversationModel(stored);
    } else if (settings) {
      const d = (settings.defaults as Record<string, unknown> | undefined);
      const def = (d?.modelId as string | undefined) ?? (d?.provider ? `${d.provider} fallback` : "");
      if (def && !conversationModel) setConversationModel(def);
    }
  }, [settings, settingsOpen]);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // Fixed theme: follow OS automatically without UI (Phase 3.1 — theme removed from Settings)
  useEffect(() => {
    const m = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme = m.matches ? "dark" : "light";
    };
    apply();
    m.addEventListener("change", apply);
    return () => m.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", "#067a52");
  }, []);

  useEffect(() => {
    localStorage.setItem("gk.lang", lang);
  }, [lang]);

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch("/api/meta");
      setMeta(await res.json());
    } catch {
      setMeta(null);
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  const ensureSession = async (): Promise<string> => {
    if (sessionRef.current) return sessionRef.current;
    const res = await fetch("/api/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const body = (await res.json()) as { id: string };
    sessionRef.current = body.id;
    return body.id;
  };

  const commitReasoning = (delta: string) => {
    setItems((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.kind === "assistant" && last.streaming) {
        next[next.length - 1] = { ...last, reasoningContent: (last.reasoningContent ?? "") + delta, reasoningStreaming: true };
      } else if (last?.kind === "assistant") {
        next[next.length - 1] = { ...last, reasoningContent: (last.reasoningContent ?? "") + delta, reasoningStreaming: true };
      } else {
        next.push({ kind: "assistant", text: "", reasoningContent: delta, reasoningStreaming: true, streaming: true });
      }
      return next;
    });
  };
  const commit = (message: string) => {
    setItems((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.kind === "assistant" && last.streaming) {
        next[next.length - 1] = { ...last, text: last.text + message, streaming: true };
      } else {
        next.push({ kind: "assistant", text: message, streaming: true });
      }
      return next;
    });
  };

  const runTask = async (task: string) => {
    if (running) return;
    // Slash command /model <search>
    if (task.trim().startsWith("/model")) {
      const q = task.trim().slice(6).trim();
      setPickerOpen(true);
      if (q) setSearch(q);
      void loadModels();
      return;
    }
    setRunning(true);
    const currentModel = conversationModel || (settings?.defaults as Record<string, unknown>)?.modelId as string || meta?.provider?.model || "echo-1";
    const found = models.find((m) => m.id === currentModel);
    const provHint = found?.provider ?? (currentModel.includes("/") ? "openrouter" : ((settings?.defaults as Record<string, unknown>)?.provider as string | undefined) ?? "echo");
    let pendingImages = attachments.length ? attachments.map((a) => ({ dataUrl: a.dataUrl, name: a.name, mimeType: a.mimeType })) : undefined;
    let effectiveTask = task;
    // OCR fallback for non-vision models: extract text client-side so even Echo can see image content
    if (pendingImages?.length && !isVisionModel(currentModel)) {
      try {
        const ocrTexts: string[] = [];
        for (const a of attachments) {
          const txt = await ocrDataUrl(a.dataUrl);
          if (txt) ocrTexts.push(`[Image ${a.name} OCR]: ${txt.slice(0, 4000)}`);
        }
        if (ocrTexts.length) effectiveTask = task + "\n\n" + ocrTexts.join("\n");
      } catch {
        // OCR is best-effort; still send images for vision-capable fallback on server
      }
    }
    setItems((prev) => [...prev, { kind: "user", text: effectiveTask, ...(pendingImages ? { images: pendingImages } : {}) }]);
    const hadImages = Boolean(pendingImages?.length);
    if (hadImages) setAttachments([]);
    const sessionId = await ensureSession();
    try {
      const res = await fetch(`/api/sessions/${sessionId}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: effectiveTask, model: currentModel, provider: provHint, mode: conversationMode, ...(pendingImages ? { images: pendingImages } : {}) }),
      });
      if (!res.ok || !res.body) throw new Error(`run failed: ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const push = (payload: { type: string; data: Record<string, unknown> }) => {
        if (payload.type === "assistant/reasoning") {
          commitReasoning(String((payload.data as Record<string, unknown>).delta ?? (payload.data as Record<string, unknown>).reasoning ?? ""));
        } else if (payload.type === "assistant/stream") {
          commit(String(payload.data.delta ?? ""));
        } else if (payload.type === "assistant/message") {
          setItems((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.kind === "assistant" && last.streaming) {
              next[next.length - 1] = {
                ...last,
                streaming: false,
                reasoningStreaming: false,
                reasoningContent: (payload.data.reasoningContent as string | undefined) ?? last.reasoningContent,
                usage: payload.data.usage as { inputTokens: number; outputTokens: number } | undefined,
                modelId: (payload.data.modelId as string | undefined) ?? currentModel,
                providerId: (payload.data.providerId as string | undefined) ?? provHint,
                latencyMs: payload.data.latencyMs as number | undefined,
              };
            }
            return next;
          });
        } else if (payload.type === "tool/start") {
          setItems((prev) => [...prev, { kind: "tool", name: String(payload.data.name), ok: true, output: "", durationMs: 0, running: true }]);
        } else if (payload.type === "tool/end") {
          const d = payload.data as { name: string; ok: boolean; output?: string; durationMs: number };
          setItems((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.kind === "tool" && last.running && last.name === d.name) {
              next[next.length - 1] = { ...last, ok: d.ok, output: d.output ?? "ok", durationMs: d.durationMs, running: false };
            }
            return next;
          });
        } else if (payload.type === "metadata") {
          const d = payload.data as Record<string, unknown>;
          if (d.kind === "model.switch") {
            setItems((prev) => [...prev, { kind: "system", text: String(d.message ?? `Switched to ${d.to}`) }]);
          }
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const type = part.match(/^event: (.+)$/m)?.[1];
          const data = part.match(/^data: (.+)$/m)?.[1];
          if (type && data) {
            try {
              push({ type, data: JSON.parse(data) });
            } catch {
              // skip malformed frame
            }
          }
        }
      }
    } catch (err) {
      commit(`\n\n**error** — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setItems((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.kind === "assistant" && (last.streaming || last.reasoningStreaming)) next[next.length - 1] = { ...last, streaming: false, reasoningStreaming: false };
        return next;
      });
      setRunning(false);
      void loadMeta();
      void loadAudit();
    }
  };

  const submit = () => {
    const task = input.trim() || (attachments.length ? "[image attached] Describe what you see and help with this image." : "");
    if ((!task || !task.trim()) && attachments.length === 0) return;
    if (running) return;
    setInput("");
    void runTask(task);
  };

  const loadPlugins = async () => {
    const res = await fetch("/api/marketplace/plugins");
    if (res.ok) setPlugins((await res.json()).plugins as Plugin[]);
  };

  const loadAudit = async () => {
    const res = await fetch("/api/audit/entries");
    if (res.ok) setAudit(((await res.json()) as { entries: AuditEntry[] }).entries);
  };

  const loadRegistryPlugins = async () => {
    try {
      const res = await fetch("/api/plugins");
      if (res.ok) {
        const body = await res.json() as { plugins: Array<{ id: string; name: string; version: string; description: string; kinds: string[]; permissions: string[]; status: string; error?: string; enabled: boolean }> };
        setRegistryPlugins(body.plugins);
      }
    } catch {
      // ignore
    }
  };

  const loadTraces = async () => {
    setTracesLoading(true);
    try {
      const res = await fetch("/api/traces");
      if (res.ok) {
        const body = await res.json() as { runs: Array<{ runId: string; traceId: string; modelId: string; providerId: string; modeId: string; status: string; startedAt: string; latencyMs?: number; usage?: { promptTokens: number; completionTokens: number }; error?: { kind: string; message: string } }> };
        setTraces(body.runs);
      }
    } catch {
      // ignore
    } finally {
      setTracesLoading(false);
    }
  };

  const viewTrace = async (runId: string) => {
    try {
      const res = await fetch(`/api/traces/${encodeURIComponent(runId)}`);
      if (res.ok) setSelectedTrace(await res.json() as { run: unknown; spans: unknown[] });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (settingsOpen) {
      void loadPlugins();
      void loadAudit();
      void loadSettings();
      void loadRegistryPlugins();
    }
  }, [settingsOpen]);

  useEffect(() => {
    if (settingsOpen && tab === "plugins") void loadRegistryPlugins();
  }, [tab, settingsOpen]);

  useEffect(() => {
    if (tracesOpen) void loadTraces();
  }, [tracesOpen]);

  // Escape closes settings (accessibility)
  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  // Ctrl/Cmd+M opens model picker (Phase 4.1)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "m") {
        e.preventDefault();
        setPickerOpen((o) => !o);
        if (!pickerOpen) void loadModels();
      }
      if (e.key === "Escape" && pickerOpen) setPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  // Legacy cred save kept for direct credential route (new Settings uses PATCH /api/settings)
  const _saveCred = async (key: string, value: string) => {
    await fetch("/api/settings/credentials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
  };
  void _saveCred;

  const toggleVoice = () => {
    if (!SpeechCtor) {
      notify(t(lang, "notRecording"));
      return;
    }
    if (recording) {
      recRef.current?.stop();
      setRecording(false);
      return;
    }
    const rec = new SpeechCtor();
    rec.lang = lang === "es" ? "es-ES" : "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1][0];
      if (last) setInput((prev) => (prev ? prev + " " : "") + last.transcript);
    };
    rec.onend = () => setRecording(false);
    rec.onerror = () => setRecording(false);
    recRef.current = rec;
    rec.start();
    setRecording(true);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  const providerMeta = meta?.provider ? `${meta.provider.provider} · ${meta.provider.model}` : "echo · echo-1";
  const usable = meta?.usage?.tokens ?? 0;

  const providers = (settings?.providers as Record<string, Record<string, unknown>> | undefined) ?? {};
  const defaults = (settings?.defaults as Record<string, unknown> | undefined) ?? {};
  const tracing = (settings?.tracing as Record<string, unknown> | undefined) ?? {};
  const advanced = (settings?.advanced as Record<string, unknown> | undefined) ?? {};
  const dataCfg = (settings?.data as Record<string, unknown> | undefined) ?? {};

  return (
    <ErrorBoundary>
    <div className="app">
      <OfflineBanner />
      <header className="header">
        <div className="wordmark">
          <img src={LOGO} alt="Greeneek" />
          <span>{t(lang, "appName")}</span>
        </div>
        <span className={`chip profile-chip ${planMode ? "plan" : ""}`}>
          <span className="dot" />
          {planMode ? t(lang, "planMode") : meta?.profile ?? "web"}
        </span>
        <button className="chip model-chip" onClick={() => { setPickerOpen((o) => !o); void loadModels(); }} title="Choose model (Ctrl+M)" aria-label="model picker" style={{ cursor: "pointer" }}>
          {conversationModel || (settings?.defaults as Record<string, unknown>)?.modelId as string || meta?.provider?.model || "echo-1"}
        </button>
        <button className="chip mode-chip" onClick={() => { setModePickerOpen((o) => !o); void loadModes(); }} title="Choose mode" aria-label="mode picker" style={{ cursor: "pointer" }}>
          {conversationMode}
        </button>
        <div className="header-spacer" />
        <span className="statusline" title={providerMeta}>
          <span className="dot" style={{ background: running ? "var(--accent)" : "var(--tertiary)" }} />
          {running ? t(lang, "streaming") : providerMeta}
        </span>
        <button className="icon-btn" title="Traces" onClick={() => { setTracesOpen(true); void loadTraces(); }} aria-label="traces">
          ≡
        </button>
        <button className="icon-btn" title={t(lang, "language")} onClick={() => setLang(lang === "en" ? "es" : "en")} aria-label="language">
          {lang.toUpperCase()}
        </button>
        <button className="icon-btn" title={t(lang, "settings")} onClick={() => setSettingsOpen(true)} aria-label="settings">
          ⚙
        </button>
      </header>

      <div className="scroll" ref={scrollRef}>
        <div className="conversation">
          {items.length === 0 && (
            <div className="empty">
              <img src={LOGO} width="72" height="72" alt="Greeneek" style={{ borderRadius: "18px" }} />
              <h2>{t(lang, "emptyTitle")}</h2>
              <p style={{ maxWidth: "52ch" }}>{t(lang, "emptyBody")}</p>
              <p className="mono">{t(lang, "emptyHint")}</p>
            </div>
          )}

          {items.map((item, i) => {
            if (item.kind === "user") {
              return (
                <div className="turn user" key={i}>
                  <div className="bubble">{item.text}</div>
                  {item.images?.length ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {item.images.map((img, idx) => (
                        <img key={idx} src={img.dataUrl} alt={img.name} style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, border: "1px solid var(--outlineVariant)" }} />
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            }
            if (item.kind === "assistant") {
              return (
                <div className="turn assistant" key={i}>
                  <div className="meta-line">
                    <span className="dot" />
                    {t(lang, "appName")}
                    {item.modelId && <span>· {item.modelId}</span>}
                    {item.usage && <span>· {item.usage.inputTokens + item.usage.outputTokens} tok</span>}
                    {item.latencyMs && <span>· {item.latencyMs}ms</span>}
                    {!item.streaming && item.modelId && <span className="muted" style={{ marginLeft: 6, cursor: "pointer" }} onClick={() => { setTracesOpen(true); void loadTraces(); }}>· View trace</span>}
                    {!item.streaming && <button className="btn ghost" style={{ marginLeft: 8, fontSize: 11 }} onClick={() => { setPickerOpen(true); void loadModels(); }}>Regenerate with…</button>}
                  </div>
                  {item.reasoningContent || item.reasoningStreaming ? (
                    <ReasoningLog content={item.reasoningContent ?? ""} streaming={item.reasoningStreaming} enabled={showReasoning} onToggleEnabled={(v) => void patchSettings({ behavior: { showReasoning: v } } as unknown as Record<string, unknown>, "behavior.showReasoning")} />
                  ) : null}
                  <div className="bubble">
                    <Markdown text={item.text} />
                    {item.streaming && <span className="spinner" style={{ display: "inline-block", marginLeft: 6, verticalAlign: "middle" }} />}
                  </div>
                </div>
              );
            }
            if (item.kind === "system") {
              return (
                <div className="turn" key={i}>
                  <p className="meta-line" style={{ justifyContent: "center", fontStyle: "italic" }}>
                    <span className="dot" style={{ background: "var(--outline)" }} />
                    {item.text}
                  </p>
                </div>
              );
            }
            return (
              <div className="turn" key={i}>
                <div className="terminal">
                  <div className="term-header">
                    <span className={item.ok ? "ok" : "fail"}>{item.running ? "…" : item.ok ? "✓" : "✗"}</span>
                    <span>{item.name}</span>
                    {!item.running && <span className="muted">· {item.durationMs}ms</span>}
                  </div>
                  <pre>
                    {item.output
                      ? item.output.split("\n").map((line, ln) => (
                          <React.Fragment key={ln}>
                            <span className="ln">{ln + 1}</span>
                            <span className={!item.ok && ln === 0 ? "tok-err" : undefined}>{line}</span>
                            {"\n"}
                          </React.Fragment>
                        ))
                      : "running…"}
                  </pre>
                </div>
              </div>
            );
          })}

          {items.length > 0 && !running && (
            <p className="meta-line" style={{ justifyContent: "center" }}>
              <span className="dot" style={{ background: "var(--outline)" }} />
              {t(lang, "runAgain")}
            </p>
          )}
        </div>
      </div>

      <div className="composer-wrap">
        <div className="composer">
          <VisionDropzone attachments={attachments} onAttachments={setAttachments} disabled={running} />
          <div style={{ height: 8 }} />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={t(lang, "composerPlaceholder")}
            rows={2}
          />
          <div className="composer-row">
            <button className="chip model-chip" onClick={() => { setPickerOpen((o) => !o); if (!pickerOpen) void loadModels(); }} title="Choose model (Ctrl+M)" aria-label="model picker" style={{ fontSize: 12 }}>
              {conversationModel || (settings?.defaults as Record<string, unknown>)?.modelId as string || meta?.provider?.model || "echo-1"}
            </button>
            <button className="chip mode-chip" onClick={() => { setModePickerOpen((o) => !o); void loadModes(); }} title="Choose mode" aria-label="mode picker" style={{ fontSize: 12 }}>
              {conversationMode}
            </button>
            <button
              className={`tool-trigger ${planMode ? "on" : ""}`}
              onClick={() => setPlanMode(!planMode)}
              title={t(lang, "planMode")}
            >
              ⌁ {t(lang, "planMode")}
            </button>
            <button
              className={`tool-trigger ${recording ? "recording-pulse" : ""}`}
              onClick={toggleVoice}
              title={t(lang, "listening")}
            >
              {recording ? `● ${t(lang, "listening")}` : "🎙"}
            </button>
            <span className="spacer" />
            <span className="muted">{t(lang, "usageLabel")}: {usable.toLocaleString()} tok</span>
            <button className="send" onClick={submit} disabled={running || (!input.trim() && attachments.length === 0)} title={t(lang, "send")}> 
              {running ? <span className="spinner" /> : "↑"}
            </button>
          </div>
        </div>
      </div>

      {pickerOpen && (
        <div className="panel" onClick={() => setPickerOpen(false)} role="dialog" aria-modal="true" aria-label="Model picker">
          <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Choose model</h3>
              <button className="btn ghost" onClick={() => setPickerOpen(false)} aria-label="close picker">✕</button>
            </div>
            <div className="field">
              <input placeholder="Search models (fuzzy: id, name, vendor) — try 'llama'" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: "100%" }} autoFocus />
            </div>
            <div className="row" style={{ gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <button className="btn ghost" onClick={() => void loadModels(true)} disabled={modelsLoading}>{modelsLoading ? "Loading…" : "Refresh models"}</button>
              {modelsUpdatedAt && <span className="muted" style={{ fontSize: 11 }}>Updated: {new Date(modelsUpdatedAt).toLocaleTimeString()}</span>}
              {modelsError && <span style={{ fontSize: 11, color: "var(--error)" }}>{modelsError} — <a href="#" onClick={(e) => { e.preventDefault(); setPickerOpen(false); setSettingsOpen(true); setTab("providers"); }}>Open Settings → Providers</a></span>}
            </div>
            {modelsLoading && <Skeleton lines={4} />}
            {!modelsLoading && models.length === 0 && !modelsError && <p className="muted">No models — enable a provider in Settings → Providers and Test connection.</p>}
            {!modelsLoading && (
              <div style={{ maxHeight: 380, overflowY: "auto" }}>
                {/* Favorites */}
                {favorites.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <h4 style={{ fontSize: 12, margin: "8px 0 4px 0" }}>Favorites</h4>
                    {favorites.map((fid) => {
                      const m = models.find((x) => x.id === fid);
                      if (!m) return null;
                      return (
                        <div key={`fav-${fid}`} className="row" style={{ padding: "6px 0", borderBottom: "1px solid var(--outlineVariant)", alignItems: "center" }}>
                          <button className="btn ghost" onClick={() => toggleFavorite(fid)} title="Unfavorite">★</button>
                          <div style={{ flex: 1, cursor: "pointer" }} onClick={() => { persistModel(m.id, m.provider); setPickerOpen(false); }}>
                            <strong>{m.id}</strong> <span className="muted" style={{ fontSize: 11 }}>{m.name}</span>
                            <span className="chip" style={{ marginLeft: 8, fontSize: 10 }}>{m.contextLength ? `${Math.round((m.contextLength ?? 0) / 1000)}k` : ""}</span>
                            {m.pricing?.isFree ? <span className="chip" style={{ fontSize: 10, background: "var(--secondaryContainer)" }}>FREE</span> : m.pricing?.promptPer1M ? <span className="muted" style={{ fontSize: 10 }}>${m.pricing.promptPer1M}/1M in</span> : null}
                            {m.supportsTools && <span className="muted" style={{ fontSize: 10, marginLeft: 6 }}>tools</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Recents */}
                {recents.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <h4 style={{ fontSize: 12, margin: "8px 0 4px 0" }}>Recent</h4>
                    {recents.slice(0, 5).map((rid) => {
                      const m = models.find((x) => x.id === rid);
                      if (!m) return null;
                      return (
                        <div key={`rec-${rid}`} className="row" style={{ padding: "6px 0", borderBottom: "1px solid var(--outlineVariant)", alignItems: "center" }}>
                          <span className="muted" style={{ fontSize: 11, width: 24 }}>↻</span>
                          <div style={{ flex: 1, cursor: "pointer" }} onClick={() => { persistModel(m.id, m.provider); setPickerOpen(false); }}>
                            <strong>{m.id}</strong> <span className="muted" style={{ fontSize: 11 }}>{m.name}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                <ModelPickerGrouped models={models} search={search} onPick={(id, prov) => { persistModel(id, prov); setPickerOpen(false); }} favorites={favorites} recents={recents} onToggleFav={toggleFavorite} />
              </div>
            )}
            <div className="row" style={{ marginTop: 12, justifyContent: "space-between" }}>
              <span className="muted" style={{ fontSize: 11 }}>Models from enabled providers only — <a href="#" onClick={(e) => { e.preventDefault(); setPickerOpen(false); setSettingsOpen(true); setTab("providers"); }}>manage in Settings</a></span>
              <button className="btn ghost" disabled={!conversationModel} onClick={() => { if (conversationModel) void setDefaultModel(conversationModel); }}>Set as default for new chats</button>
            </div>
          </div>
        </div>
      )}

      {modePickerOpen && (
        <div className="panel" onClick={() => setModePickerOpen(false)} role="dialog" aria-modal="true" aria-label="Mode picker">
          <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Choose mode</h3>
              <button className="btn ghost" onClick={() => setModePickerOpen(false)}>✕</button>
            </div>
            {(modes.length === 0 ? [{ id: "chat", label: "Chat", description: "Single call, no tools", capabilities: { tools: false, multiStep: false, sideEffects: "none" } }, { id: "agent", label: "Agent", description: "Tool loop", capabilities: { tools: true, multiStep: true, sideEffects: "ask" } }, { id: "plan", label: "Plan", description: "Plan then execute", capabilities: { tools: true, multiStep: true, sideEffects: "ask" } }, { id: "dry-run", label: "Dry-run", description: "Simulated tools", capabilities: { tools: true, multiStep: true, sideEffects: "none" } }, { id: "replay", label: "Replay", description: "Re-execute a run", capabilities: { tools: true, multiStep: true, sideEffects: "none" } }] as typeof modes : modes).map((m) => (
              <div key={m.id} className="row" style={{ padding: "10px 0", borderBottom: "1px solid var(--outlineVariant)", cursor: "pointer", background: conversationMode === m.id ? "var(--surfaceContainerLow)" : "transparent" }} onClick={() => {
                const prev = conversationMode;
                setConversationMode(m.id);
                localStorage.setItem("gk.mode.current", m.id);
                if (sessionRef.current) localStorage.setItem(`gk.mode.${sessionRef.current}`, m.id);
                if (prev && prev !== m.id && items.length > 0) setItems((prevItems) => [...prevItems, { kind: "system", text: `Switched to ${m.id} mode` }]);
                setModePickerOpen(false);
                void loadTraces();
              }}>
                <div style={{ flex: 1 }}>
                  <strong>{m.label}</strong> <span className="chip" style={{ fontSize: 10 }}>{m.id}</span>
                  <div className="muted" style={{ fontSize: 12 }}>{m.description}</div>
                  <div className="muted" style={{ fontSize: 10 }}>tools:{String(m.capabilities.tools)} · multi:{String(m.capabilities.multiStep)} · sideEffects:{m.capabilities.sideEffects}</div>
                </div>
                {conversationMode === m.id && <span style={{ color: "var(--secondary)" }}>✓</span>}
              </div>
            ))}
            <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>Per-mode overrides: settings.defaults → mode.defaultParams → conversation. Default in Settings → Defaults.</p>
          </div>
        </div>
      )}

      {tracesOpen && (
        <div className="panel" onClick={() => setTracesOpen(false)} role="dialog" aria-modal="true" aria-label="Traces">
          <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, width: "90vw" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Traces</h3>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn ghost" onClick={() => void loadTraces()}>Refresh</button>
                <a className="btn ghost" href="/api/traces/export" target="_blank" rel="noreferrer">Export JSON</a>
                <a className="btn ghost" href="/api/traces/export?format=otlp" target="_blank" rel="noreferrer">Export OTLP</a>
                <button className="btn ghost" onClick={async () => { if (!confirm("Delete all traces?")) return; await fetch("/api/traces", { method: "DELETE" }); void loadTraces(); }}>Delete all</button>
                <button className="btn ghost" onClick={() => setTracesOpen(false)}>✕</button>
              </div>
            </div>
            {tracesLoading ? <p className="muted">Loading…</p> : traces.length === 0 ? <p className="muted">No traces yet — send a message, cancel one mid-stream, and send one that 401s to see all three statuses.</p> : (
              <div style={{ maxHeight: 500, overflowY: "auto" }}>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid var(--outlineVariant)" }}>
                      <th>Time</th><th>Conversation</th><th>Model</th><th>Mode</th><th>Status</th><th>Tokens</th><th>Cost</th><th>Latency</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {traces.map((r) => (
                      <tr key={r.runId} style={{ borderBottom: "1px solid var(--outlineVariant)" }}>
                        <td>{new Date(r.startedAt).toLocaleTimeString()}</td>
                        <td style={{ fontFamily: "var(--font-technical)", fontSize: 10 }}>{r.conversationId?.slice(0, 8) ?? "-"}</td>
                        <td>{r.modelId}</td>
                        <td>{r.modeId}</td>
                        <td><span className={`chip ${r.status === "ok" ? "active" : r.status === "error" ? "fail" : ""}`}>{r.status}</span>{r.error && <span style={{ color: "var(--error)", marginLeft: 6 }}>{r.error.kind}: {r.error.message.slice(0, 60)}</span>}</td>
                        <td>{r.usage ? `${r.usage.promptTokens + r.usage.completionTokens}` : "-"}</td>
                        <td>{r.usage?.costUsd !== undefined ? `$${r.usage.costUsd.toFixed(4)}` : "-"}</td>
                        <td>{r.latencyMs ? `${r.latencyMs}ms` : "-"}</td>
                        <td>
                          <button className="btn ghost" style={{ fontSize: 11 }} onClick={() => void viewTrace(r.runId)}>Open</button>
                          <button className="btn ghost" style={{ fontSize: 11 }} onClick={() => { setConversationModel(r.modelId); localStorage.setItem("gk.model.current", r.modelId); setTracesOpen(false); notify(`Replay with ${r.modelId} — send a message to re-run`); }}>Replay</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="row" style={{ marginTop: 12, gap: 8 }}>
              <input placeholder="Search traces" onChange={(e) => {
                const q = e.target.value.toLowerCase();
                if (!q) void loadTraces();
                else setTraces((t) => t.filter((r) => JSON.stringify(r).toLowerCase().includes(q)));
              }} style={{ flex: 1 }} />
              <select onChange={(e) => {
                const v = e.target.value;
                if (!v) void loadTraces();
                else setTraces((t) => t.filter((r) => r.status === v));
              }}>
                <option value="">All statuses</option><option value="ok">ok</option><option value="error">error</option><option value="cancelled">cancelled</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {selectedTrace && (
        <div className="panel" onClick={() => setSelectedTrace(null)} role="dialog" aria-modal="true" aria-label="Trace detail">
          <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, width: "90vw" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Trace {(selectedTrace.run as { runId?: string })?.runId?.slice(0, 8)}</h3>
              <button className="btn ghost" onClick={() => setSelectedTrace(null)}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
              <button className="btn ghost" onClick={async () => { await navigator.clipboard.writeText(JSON.stringify(selectedTrace, null, 2)); notify("Trace JSON copied (redacted)"); }}>Copy JSON</button>
              <a className="btn ghost" href="/api/traces/export" target="_blank" rel="noreferrer">Export all</a>
            </div>
            <div style={{ maxHeight: 400, overflowY: "auto", fontSize: 12 }}>
              <h4>Waterfall</h4>
              {(selectedTrace.spans as Array<{ name: string; kind: string; status: string; startedAt: string; endedAt?: string; attributes: Record<string, unknown> }>).map((s, i) => (
                <div key={i} style={{ borderLeft: `4px solid ${s.status === "ok" ? "var(--secondary)" : s.status === "error" ? "var(--error)" : "var(--outline)"}`, padding: "6px 8px", marginBottom: 6, background: "var(--surfaceContainerLow)" }}>
                  <strong>{s.name}</strong> <span className="muted">{s.kind} · {s.status}</span> <span className="muted">{s.startedAt} → {s.endedAt ?? "-"}</span>
                  <pre style={{ fontSize: 10, whiteSpace: "pre-wrap", margin: "4px 0 0 0" }}>{JSON.stringify(s.attributes, null, 2).slice(0, 800)}</pre>
                </div>
              ))}
              <h4>Raw JSON</h4>
              <pre style={{ fontSize: 10, background: "var(--surfaceContainerLow)", padding: 8, overflowX: "auto" }}>{JSON.stringify(selectedTrace, null, 2).slice(0, 8000)}</pre>
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="panel" onClick={() => setSettingsOpen(false)} role="dialog" aria-modal="true" aria-label="Settings">
          <div className="sheet" onClick={(e) => e.stopPropagation()} tabIndex={-1}>
            <div className="tabs">
              {(["providers", "api-keys", "plugins", "defaults", "tracing", "advanced", "data", "diagnostics", "billing", "marketplace", "audit", "about"] as const).map((key) => (
                <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
                  {key === "api-keys" ? "API Keys" : (t(lang, key as keyof typeof en) ?? key)}
                </button>
              ))}
            </div>
            <div className="tab-body">
              {settingsLoading && <p className="muted">Loading settings…</p>}
              {!settingsLoading && tab === "providers" && settings && (
                <>
                  <h3>{t(lang, "providers")}</h3>
                  <p className="muted" style={{ fontSize: 12 }}>Each provider is field-level saved (atomic patch, never overwrites others). Keys are masked, trimmed, and take effect on next message without restart.</p>
                  {(["openai", "openrouter", "anthropic", "ollama"] as const).map((pid) => {
                    const prov = providers[pid] as Record<string, unknown> | undefined;
                    const hasKey = prov?.hasKey as boolean | undefined;
                    const masked = prov?.apiKey ? String(prov.apiKey) : "";
                    const draftKey = `${pid.toUpperCase()}_API_KEY`;
                    const displayValue = creds[draftKey] !== undefined ? creds[draftKey] : masked;
                    const isRevealed = reveal[pid] ?? false;
                    const saving = fieldSaving[`providers.${pid}.apiKey`] ?? false;
                    const status = fieldStatus[`providers.${pid}.apiKey`] ?? "";
                    const test = testResult[pid];
                    return (
                      <div key={pid} style={{ border: "1px solid var(--outlineVariant)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                        <div className="row" style={{ justifyContent: "space-between" }}>
                          <strong style={{ textTransform: "capitalize" }}>{pid}</strong>
                          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                            <input type="checkbox" checked={Boolean(prov?.enabled)} onChange={(e) => void patchSettings({ providers: { [pid]: { enabled: e.target.checked } } } as unknown as Record<string, unknown>, `providers.${pid}.enabled`)} />
                            Enabled {fieldSaving[`providers.${pid}.enabled`] ? "…" : ""}
                            <span className="muted">{fieldStatus[`providers.${pid}.enabled`]}</span>
                          </label>
                        </div>
                        {pid !== "ollama" ? (
                          <div className="field" style={{ marginTop: 8 }}>
                            <label htmlFor={`api-${pid}`}>API Key {hasKey ? "· set" : "· not set"}</label>
                            <div className="row">
                              <input id={`api-${pid}`} type={isRevealed ? "text" : "password"} value={displayValue} placeholder={pid === "openrouter" ? "sk-or-..." : "sk-..."} onChange={(e) => setCreds({ ...creds, [draftKey]: e.target.value })} style={{ flex: 1 }} aria-label={`${pid} api key`} />
                              <button className="btn ghost" onClick={() => setReveal((r) => ({ ...r, [pid]: !isRevealed }))} aria-label="toggle reveal">{isRevealed ? "Hide" : "Reveal"}</button>
                              <button className="btn ghost" onClick={() => { setCreds({ ...creds, [draftKey]: "" }); void patchSettings({ providers: { [pid]: { apiKey: "", enabled: false } } } as unknown as Record<string, unknown>, `providers.${pid}.apiKey`); }} aria-label="clear key">Clear</button>
                            </div>
                            <div className="row" style={{ marginTop: 6, gap: 8 }}>
                              <button className="btn secondary" disabled={saving} onClick={() => {
                                const raw = (creds[draftKey] ?? "").trim().replace(/^Bearer\s+/i, "");
                                if (!raw) { setFieldStatus((s) => ({ ...s, [`providers.${pid}.apiKey`]: "Error: empty key" })); return; }
                                if (raw.length < 8) { setFieldStatus((s) => ({ ...s, [`providers.${pid}.apiKey`]: "Error: key too short" })); return; }
                                void patchSettings({ providers: { [pid]: { apiKey: raw, enabled: true } } } as unknown as Record<string, unknown>, `providers.${pid}.apiKey`).then(() => setCreds((c) => { const n = { ...c }; delete n[draftKey]; return n; }));
                              }}>{saving ? "Saving…" : "Save"}</button>
                              <button className="btn ghost" onClick={() => void testProvider(pid)}>Test connection</button>
                              <span className="muted" style={{ fontSize: 12 }}>{status}</span>
                            </div>
                            {test && <p style={{ fontSize: 12, color: test.ok ? "var(--secondary)" : "var(--error)", marginTop: 6 }}>{test.ok ? "✓ " : "✗ "}{test.message} {test.kind ? `· ${test.kind}` : ""}</p>}
                          </div>
                        ) : (
                          <p className="muted" style={{ fontSize: 12 }}>Ollama is local — no key required. Set baseUrl below.</p>
                        )}
                        <div className="field" style={{ marginTop: 8 }}>
                          <label htmlFor={`base-${pid}`}>Base URL</label>
                          <div className="row">
                            <input id={`base-${pid}`} value={String(prov?.baseUrl ?? "")} onChange={(e) => {
                              const v = e.target.value;
                              // local draft, save on blur
                              setSettings((s) => s ? { ...s, providers: { ...(s.providers as Record<string, unknown>), [pid]: { ...(prov as Record<string, unknown>), baseUrl: v } } } as unknown as Record<string, unknown> : s);
                            }} onBlur={(e) => {
                              const v = e.target.value.trim().replace(/\/$/, "");
                              if (!v) return;
                              try { new URL(v); } catch { setFieldStatus((s) => ({ ...s, [`providers.${pid}.baseUrl`]: "Error: invalid URL" })); return; }
                              void patchSettings({ providers: { [pid]: { baseUrl: v } } } as unknown as Record<string, unknown>, `providers.${pid}.baseUrl`);
                            }} placeholder={pid === "openrouter" ? "https://openrouter.ai/api/v1" : pid === "openai" ? "https://api.openai.com/v1" : ""} style={{ flex: 1 }} />
                            <span className="muted" style={{ fontSize: 12 }}>{fieldStatus[`providers.${pid}.baseUrl`]}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
                    <button className="btn ghost" onClick={() => void fetch("/api/settings/export").then(async (r) => { const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "greeneek-settings.json"; a.click(); URL.revokeObjectURL(u); })}>Export settings (redacted)</button>
                    <button className="btn ghost" onClick={() => void fetch("/api/settings/export?includeSecrets=1").then(async (r) => { const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "greeneek-settings-secrets.json"; a.click(); URL.revokeObjectURL(u); notify("Exported with secrets — store safely"); })}>Export with secrets</button>
                    <label className="btn ghost" style={{ cursor: "pointer" }}>
                      Import <input type="file" accept="application/json" style={{ display: "none" }} onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const text = await f.text();
                        try {
                          const parsed = JSON.parse(text);
                          const res = await fetch("/api/settings/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(parsed) });
                          const body = await res.json() as Record<string, unknown>;
                          if (!res.ok) throw new Error(String((body as Record<string, unknown>).message ?? "invalid import"));
                          setSettings(body.settings as Record<string, unknown>);
                          notify("Imported ✓");
                        } catch (err) { notify(`Import failed: ${err instanceof Error ? err.message : String(err)}`); }
                      }} />
                    </label>
                    <button className="btn ghost" onClick={async () => { if (!confirm("Reset all settings to defaults?")) return; const res = await fetch("/api/settings/reset", { method: "POST" }); if (res.ok) { const body = await res.json() as Record<string, unknown>; setSettings(body.settings as Record<string, unknown>); notify("Reset to defaults ✓"); } }}>Reset to defaults</button>
                  </div>
                </>
              )}

              {!settingsLoading && tab === "api-keys" && settings && (
                <>
                  <h3>API Keys — Bring Your Own Key</h3>
                  <p className="muted" style={{ fontSize: 12 }}>Keys stay on this device. Local models run without any key. Cloud providers need a key only when you use them.</p>
                  <ApiKeysManager
                    providers={providers as unknown as Record<string, { apiKey?: string; baseUrl?: string; enabled?: boolean }>}
                    creds={creds}
                    setCreds={setCreds}
                    reveal={reveal}
                    setReveal={setReveal}
                    fieldSaving={fieldSaving as unknown as Record<string, boolean>}
                    fieldStatus={fieldStatus as unknown as Record<string, string>}
                    setFieldStatus={setFieldStatus as unknown as (f: (s: Record<string, string>) => Record<string, string>) => void}
                    testResult={testResult}
                    onSave={(pid, raw) => {
                      void patchSettings({ providers: { [pid]: { apiKey: raw, enabled: true } } } as unknown as Record<string, unknown>, `providers.${pid}.apiKey`).then(() => setCreds((c) => { const n = { ...c }; delete n[`${pid.toUpperCase()}_API_KEY`]; return n; }));
                    }}
                    onPatch={(patch, key) => void patchSettings(patch as unknown as Record<string, unknown>, key)}
                    onTest={(pid) => void testProvider(pid)}
                    onClear={(pid) => {
                      setCreds({ ...creds, [`${pid.toUpperCase()}_API_KEY`]: "" });
                      void patchSettings({ providers: { [pid]: { apiKey: "" } } } as unknown as Record<string, unknown>, `providers.${pid}.apiKey`);
                    }}
                  />
                </>
              )}

              {!settingsLoading && tab === "plugins" && (
                <>
                  <h3>Plugins</h3>
                  <p className="muted" style={{ fontSize: 12 }}>Every capability is a plugin. Built-ins use the same mechanism as third-party. Enable/disable is instant; a failing plugin is isolated and reported.</p>
                  <div className="row" style={{ gap: 8, marginBottom: 12 }}>
                    <button className="btn ghost" onClick={() => void loadRegistryPlugins()}>Reload plugins</button>
                    <span className="muted" style={{ fontSize: 11 }}>{registryPlugins.length} plugins</span>
                  </div>
                  <ul className="flat-list">
                    {registryPlugins.length === 0 && <li className="muted">Loading…</li>}
                    {registryPlugins.map((p) => (
                      <li key={p.id} style={{ border: "1px solid var(--outlineVariant)", borderRadius: 8, padding: 12, marginBottom: 8 }}>
                        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <strong>{p.name}</strong> <span className="muted">v{p.version} · {p.kinds.join(",")} · {p.permissions.join(",") || "no perms"}</span>
                            <div className="muted" style={{ fontSize: 12 }}>{p.description}</div>
                            <div style={{ fontSize: 11, marginTop: 4 }}>
                              <span className={`chip ${p.status === "active" ? "active" : p.status === "errored" ? "fail" : ""}`}>{p.status}</span>
                              {p.error && <span style={{ color: "var(--error)", marginLeft: 8 }}>Error: {p.error}</span>}
                              {p.status === "errored" && <span className="muted" style={{ marginLeft: 8 }}>Core and other plugins keep working.</span>}
                            </div>
                          </div>
                          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                            <input type="checkbox" checked={p.enabled} onChange={async (e) => {
                              const enable = e.target.checked;
                              const url = `/api/plugins/${encodeURIComponent(p.id)}/${enable ? "enable" : "disable"}`;
                              const res = await fetch(url, { method: "POST" });
                              if (res.ok) {
                                void loadRegistryPlugins();
                                void loadModels(true);
                                notify(`${p.id} ${enable ? "enabled" : "disabled"}`);
                              } else {
                                notify("Failed to toggle");
                              }
                            }} />
                            Enabled
                          </label>
                        </div>
                        {p.kinds.includes("provider") && p.id === "greeneek.provider.openrouter" && p.status !== "active" && (
                          <p style={{ fontSize: 11, color: "var(--error)", marginTop: 6 }}>Disabling OpenRouter will remove its models from the picker immediately.</p>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="muted" style={{ fontSize: 11 }}>Version check: plugins with minAppVersion &gt; 0.1.0 are marked errored. User plugins under <code>user.*</code> require explicit enable.</p>
                </>
              )}

              {!settingsLoading && tab === "defaults" && settings && (
                <>
                  <h3>Defaults</h3>
                  <p className="muted" style={{ fontSize: 12 }}>Default for <em>new</em> chats. Model is chosen from the chat picker — here it is read-only with a hint.</p>
                  <div className="field">
                    <label>Default model (read-only)</label>
                    <div className="row">
                      <span className="chip">{String(defaults.modelId ?? defaults.provider ?? "echo")} </span>
                      <span className="muted" style={{ fontSize: 12 }}>Change from the chat model picker (Phase 4)</span>
                    </div>
                  </div>
                  <div className="field">
                    <label>Mode</label>
                    <select value={String(defaults.mode ?? "chat")} onChange={(e) => void patchSettings({ defaults: { mode: e.target.value } } as unknown as Record<string, unknown>, "defaults.mode")}>
                      <option value="chat">chat</option>
                      <option value="agent">agent</option>
                      <option value="plan">plan</option>
                    </select>
                    <span className="muted" style={{ fontSize: 12 }}>{fieldStatus["defaults.mode"]}</span>
                  </div>
                  <div className="row wrap">
                    <div className="field grow">
                      <label>Temperature</label>
                      <input type="number" min={0} max={2} step={0.1} value={String(defaults.temperature ?? 0.7)} onChange={(e) => {
                        const v = parseFloat(e.target.value);
                        if (isNaN(v) || v < 0 || v > 2) { setFieldStatus((s) => ({ ...s, ["defaults.temperature"]: "Error: 0–2" })); return; }
                        void patchSettings({ defaults: { temperature: v } } as unknown as Record<string, unknown>, "defaults.temperature");
                      }} />
                      <span className="muted" style={{ fontSize: 12 }}>{fieldStatus["defaults.temperature"]}</span>
                    </div>
                    <div className="field grow">
                      <label>Max tokens</label>
                      <input type="number" min={1} value={String(defaults.maxTokens ?? "")} placeholder="auto" onChange={(e) => {
                        const v = e.target.value ? parseInt(e.target.value, 10) : undefined;
                        if (v !== undefined && (isNaN(v) || v < 1)) { setFieldStatus((s) => ({ ...s, ["defaults.maxTokens"]: "Error: positive integer" })); return; }
                        void patchSettings({ defaults: { maxTokens: v } } as unknown as Record<string, unknown>, "defaults.maxTokens");
                      }} />
                      <span className="muted" style={{ fontSize: 12 }}>{fieldStatus["defaults.maxTokens"]}</span>
                    </div>
                  </div>
                  <div className="field">
                    <label>System prompt</label>
                    <textarea value={String(defaults.systemPrompt ?? "")} onChange={(e) => setSettings((s) => s ? { ...s, defaults: { ...(s.defaults as Record<string, unknown>), systemPrompt: e.target.value } } as unknown as Record<string, unknown> : s)} onBlur={(e) => void patchSettings({ defaults: { systemPrompt: e.target.value } } as unknown as Record<string, unknown>, "defaults.systemPrompt")} rows={3} style={{ width: "100%" }} />
                    <span className="muted" style={{ fontSize: 12 }}>{fieldStatus["defaults.systemPrompt"]}</span>
                  </div>
                </>
              )}

              {!settingsLoading && tab === "tracing" && settings && (
                <>
                  <h3>Tracing</h3>
                  <div className="field">
                    <label><input type="checkbox" checked={Boolean(tracing.enabled)} onChange={(e) => void patchSettings({ tracing: { enabled: e.target.checked } } as unknown as Record<string, unknown>, "tracing.enabled")} /> Enabled</label>
                  </div>
                  <div className="field">
                    <label><input type="checkbox" checked={Boolean(tracing.storePrompts)} onChange={(e) => void patchSettings({ tracing: { storePrompts: e.target.checked } } as unknown as Record<string, unknown>, "tracing.storePrompts")} /> Store prompts</label>
                    <span className="muted" style={{ fontSize: 11 }}>If off, prompts are hashed/redacted before storage</span>
                  </div>
                  <div className="row wrap">
                    <div className="field grow">
                      <label>Retention days</label>
                      <input type="number" min={1} value={String(tracing.retentionDays ?? 30)} onChange={(e) => { const v = parseInt(e.target.value, 10); if (isNaN(v) || v < 1) return; void patchSettings({ tracing: { retentionDays: v } } as unknown as Record<string, unknown>, "tracing.retentionDays"); }} />
                    </div>
                    <div className="field grow">
                      <label>Max size MB</label>
                      <input type="number" min={1} value={String(tracing.maxSizeMB ?? 100)} onChange={(e) => { const v = parseInt(e.target.value, 10); if (isNaN(v) || v < 1) return; void patchSettings({ tracing: { maxSizeMB: v } } as unknown as Record<string, unknown>, "tracing.maxSizeMB"); }} />
                    </div>
                  </div>
                  <div className="field">
                    <label>OTLP endpoint</label>
                    <input value={String(tracing.otlpEndpoint ?? tracing.exportPath ?? "")} onChange={(e) => setSettings((s) => s ? { ...s, tracing: { ...(s.tracing as Record<string, unknown>), otlpEndpoint: e.target.value, exportPath: e.target.value } } as unknown as Record<string, unknown> : s)} onBlur={(e) => void patchSettings({ tracing: { otlpEndpoint: e.target.value, exportPath: e.target.value } } as unknown as Record<string, unknown>, "tracing.otlpEndpoint")} placeholder="https://otel.example.com/v1/traces" style={{ width: "100%" }} />
                  </div>
                  <div className="field">
                    <label>Redact patterns (regex, comma-separated)</label>
                    <input value={Array.isArray(tracing.redactPatterns) ? (tracing.redactPatterns as string[]).join(", ") : ""} onChange={(e) => setSettings((s) => s ? { ...s, tracing: { ...(s.tracing as Record<string, unknown>), redactPatterns: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } } as unknown as Record<string, unknown> : s)} onBlur={(e) => void patchSettings({ tracing: { redactPatterns: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } } as unknown as Record<string, unknown>, "tracing.redactPatterns")} placeholder="sk-or-.*, password.*" style={{ width: "100%" }} />
                  </div>
                </>
              )}

              {!settingsLoading && tab === "advanced" && settings && (
                <>
                  <h3>Advanced</h3>
                  <div className="row wrap">
                    <div className="field grow">
                      <label>Request timeout ms</label>
                      <input type="number" min={1000} value={String(advanced.requestTimeoutMs ?? 15000)} onChange={(e) => { const v = parseInt(e.target.value, 10); if (isNaN(v) || v < 1000) { setFieldStatus((s) => ({ ...s, ["advanced.requestTimeoutMs"]: "Error: ≥1000" })); return; } void patchSettings({ advanced: { requestTimeoutMs: v } } as unknown as Record<string, unknown>, "advanced.requestTimeoutMs"); }} />
                      <span className="muted" style={{ fontSize: 12 }}>{fieldStatus["advanced.requestTimeoutMs"]}</span>
                    </div>
                    <div className="field grow">
                      <label>Stream idle timeout ms</label>
                      <input type="number" min={1000} value={String(advanced.streamIdleTimeoutMs ?? 60000)} onChange={(e) => { const v = parseInt(e.target.value, 10); if (isNaN(v) || v < 1000) { setFieldStatus((s) => ({ ...s, ["advanced.streamIdleTimeoutMs"]: "Error: ≥1000" })); return; } void patchSettings({ advanced: { streamIdleTimeoutMs: v } } as unknown as Record<string, unknown>, "advanced.streamIdleTimeoutMs"); }} />
                      <span className="muted" style={{ fontSize: 12 }}>{fieldStatus["advanced.streamIdleTimeoutMs"]}</span>
                    </div>
                  </div>
                  <div className="field">
                    <label>Log level</label>
                    <select value={String(advanced.logLevel ?? "info")} onChange={(e) => void patchSettings({ advanced: { logLevel: e.target.value } } as unknown as Record<string, unknown>, "advanced.logLevel")}>
                      <option value="debug">debug</option><option value="info">info</option><option value="warn">warn</option><option value="error">error</option>
                    </select>
                  </div>
                </>
              )}

              {!settingsLoading && tab === "data" && settings && (
                <>
                  <h3>Data & Storage</h3>
                  <div className="field">
                    <label>Storage location</label>
                    <input value={String(dataCfg.storageLocation ?? "")} placeholder="default: ~/.greeneek" onChange={(e) => setSettings((s) => s ? { ...s, data: { ...(s.data as Record<string, unknown>), storageLocation: e.target.value } } as unknown as Record<string, unknown> : s)} onBlur={(e) => void patchSettings({ data: { storageLocation: e.target.value || undefined } } as unknown as Record<string, unknown>, "data.storageLocation")} style={{ width: "100%" }} />
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 12 }}>
                    <button className="btn ghost" onClick={async () => { if (!confirm("Clear all conversations?")) return; await fetch("/api/audit/entries", { method: "DELETE" }).catch(() => {}); notify("Conversations cleared (sessions remain on disk)"); }}>Clear conversations</button>
                    <button className="btn ghost" onClick={async () => { if (!confirm("Clear traces?")) return; notify("Traces are file-based — clear not yet implemented"); }}>Clear traces</button>
                  </div>
                  <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Settings are versioned (schemaVersion {String(settings.schemaVersion ?? 2)}) and migrated automatically. Size limit: {String(tracing.maxSizeMB ?? 100)} MB, retention: {String(tracing.retentionDays ?? 30)} days.</p>
                </>
              )}

              {!settingsLoading && tab === "diagnostics" && settings && (
                <>
                  <h3>Diagnostics</h3>
                  <p className="muted" style={{ fontSize: 12 }}>Version 0.1.0 · profile {meta?.profile ?? "web"} · provider {meta?.provider ? `${meta.provider.provider}/${meta.provider.model}` : "echo"} · logLevel {String(advanced.logLevel ?? "info")}</p>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    <button className="btn ghost" onClick={async () => { const res = await fetch("/api/diagnostics"); const j = await res.json(); await navigator.clipboard.writeText(JSON.stringify(j, null, 2)); notify("Diagnostics copied (redacted)"); }}>Copy diagnostics (redacted)</button>
                    <button className="btn ghost" onClick={async () => { const res = await fetch("/api/meta"); const j = await res.json(); await navigator.clipboard.writeText(JSON.stringify(j, null, 2)); notify("Meta copied"); }}>Copy meta</button>
                  </div>
                  <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>Secrets are never included in diagnostics or default exports. Use “Export with secrets” in Providers only when needed.</p>
                </>
              )}

              {tab === "billing" && (
                <>
                  <h3>{t(lang, "billing")}</h3>
                  <div className="row wrap">
                    <span className={`chip ${meta?.plan === "enterprise" ? "active" : ""}`}>{t(lang, "planLabel")}: {meta?.plan ?? "free"}</span>
                    <span className="chip">{t(lang, "usageLabel")}: ${(meta?.usage?.usd ?? 0).toFixed(4)} · {usable.toLocaleString()} tok · {meta?.usage?.requests ?? 0} req</span>
                  </div>
                  <p>Free 100k tok/mo · Pro $20/mo · Team $150/mo. Stripe products, prices, webhooks and dunning/grace-period flows are wired at the billing seam — token metering happens at agent/request, tier limits enforce pre-execution.</p>
                </>
              )}

              {tab === "marketplace" && (
                <>
                  <h3>{t(lang, "marketplace")}</h3>
                  <ul className="flat-list">
                    {plugins.length === 0 && <li>{t(lang, "noPlugins")}</li>}
                    {plugins.map((p) => (
                      <li key={p.id}>
                        <div className="row">
                          <div className="grow">
                            <strong>{p.name}</strong> <span className="muted">v{p.version} · {p.publisher ?? "unknown"}{p.verified ? " · verified" : ""}</span>
                            <div className="muted">{p.description}</div>
                          </div>
                          <button
                            className="btn ghost"
                            onClick={() =>
                              void fetch("/api/marketplace/install", {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ pluginId: p.id }),
                              }).then(() => notify(`Installed ${p.id} → ~/.greeneek/cordis.patch.yml`))
                            }
                          >
                            {t(lang, "install")}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {tab === "audit" && (
                <>
                  <h3>{t(lang, "audit")}</h3>
                  <div className="row">
                    <a className="btn ghost" href="/api/audit/export">{t(lang, "exportCsv")}</a>
                    <span className="muted">SHA-256 hash-chained · append-only</span>
                  </div>
                  <ul className="flat-list">
                    {audit.length === 0 && <li>{t(lang, "auditEmpty")}</li>}
                    {audit.slice(-12).reverse().map((e) => (
                      <li key={e.seq}>
                        <div className="row">
                          <span className="chip">{e.action}</span>
                          <span className="muted">{e.resource}</span>
                          <span className="muted" style={{ fontFamily: "var(--font-technical)", fontSize: "10px" }}>
                            #{e.seq} · {e.hash.slice(0, 12)}… · {new Date(e.ts).toLocaleString()}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {tab === "about" && (
                <>
                  <h3>{t(lang, "about")}</h3>
                  <p>Greeneek 0.1.0 · Greeneek Labs · MIT · Independent fork of an MIT-licensed agent harness, pinned at 4e84901e6471b79ec0338099867ebb4606d12bb5 (see FORK.md). License and third-party notices preserved; brand is wholly Greeneek.</p>
                  <p className="mono">greeneek --profile web --dump-config · ~/.greeneek</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", bottom: 92, left: "50%", transform: "translateX(-50%)", background: "var(--primary)", color: "var(--on-primary)", padding: "8px 14px", borderRadius: 999, fontSize: 12 }}>{toast}</div>}
    </div>
    </ErrorBoundary>
  );
}
