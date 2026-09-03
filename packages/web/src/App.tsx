import React, { useCallback, useEffect, useRef, useState } from "react";
import { en } from "./locales/en";
import { es } from "./locales/es";
import { ApiKeysManager } from "./components/api-keys-settings";
import { ModelPickerGrouped } from "./components/model-selector";
import { ReasoningLog } from "./components/reasoning-log";
import { VisionDropzone, type VisionAttachment } from "./components/vision-dropzone";
import { ocrDataUrl, isVisionModel } from "./lib/vision-ocr";
import { ErrorBoundary, OfflineBanner, Skeleton, TraceSkeleton } from "./components/hardening";
import { Sidebar } from "./components/sidebar/Sidebar";
import { ConnectionStatus } from "./components/connection/ConnectionStatus";
import { Markdown } from "./components/markdown";
import { useChatStore } from "./stores/chat.store";
import { useSettingsStore } from "./stores/settings.store";
import { useProviderStore } from "./stores/provider.store";

type Lang = "en" | "es";
const tDict = { en, es } as const;

type Thread = import("./stores/chat.store").Thread;
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


function itemToChatMessage(item: Item, index: number, stableId?: string): import("./stores/chat.store").Thread["messages"][number] {
  const id = stableId ?? `m-${Date.now()}-${index}`;
  if (item.kind === "user") return { id, role: "user", content: item.text, createdAt: Date.now(), images: item.images?.map((img) => ({ dataUrl: img.dataUrl, name: img.name, mimeType: img.mimeType })) } as unknown as import("./stores/chat.store").Thread["messages"][number];
  if (item.kind === "assistant") return { id, role: "assistant", content: item.text, createdAt: Date.now(), reasoningContent: item.reasoningContent, model: item.modelId, providerId: item.providerId } as unknown as import("./stores/chat.store").Thread["messages"][number];
  if (item.kind === "tool") return { id, role: "tool", content: item.output, createdAt: Date.now(), name: item.name, error: !item.ok ? item.output : undefined } as unknown as import("./stores/chat.store").Thread["messages"][number];
  return { id, role: "system", content: item.text, createdAt: Date.now() } as unknown as import("./stores/chat.store").Thread["messages"][number];
}

export default function App() {
  // Zustand stores
  const {
    threads: _threads,
    activeThreadId,
    isGenerating,
    abortController: _abortController,
    createThread,
    setActiveThread: _setActiveThread,
    addMessage: _addMessage,
    updateMessage: _updateMessage,
    appendToMessage: _appendToMessage,
    deleteThread: _deleteThread,
    renameThread: _renameThread,
    pinThread: _pinThread,
    archiveThread: _archiveThread,
    setMessages,
    clearActiveThread: _clearActiveThread,
    setGenerating,
    setAbortController: _setAbortController,
  } = useChatStore();
  void _threads; void _abortController; void _setActiveThread; void _addMessage; void _updateMessage; void _appendToMessage; void _deleteThread; void _renameThread; void _pinThread; void _archiveThread; void _clearActiveThread;
  const setAbortController = _setAbortController;

  const {
    version,
    theme,
    autoTitle,
    sendOnEnter,
    autoScroll,
    showReasoning: settingsShowReasoning,
    keysEncrypted,
    encryptionPassphrase,
    providerSettings,
    activeProviderId,
    ollamaBaseUrl,
    lmstudioBaseUrl,
    vllmBaseUrl,
    setTheme: _setTheme,
    setAutoTitle: _setAutoTitle,
    setSendOnEnter: _setSendOnEnter,
    setAutoScroll: _setAutoScroll,
    setShowReasoning: _setShowReasoning,
    setKeysEncrypted: _setKeysEncrypted,
    setEncryptionPassphrase: _setEncryptionPassphrase,
    setProviderSetting: _setProviderSetting,
    getProviderSetting: _getProviderSetting,
    setActiveProvider: _setActiveProvider,
    getActiveProvider: _getActiveProvider,
    getActiveModel,
    setOllamaBaseUrl: _setOllamaBaseUrl,
    setLmstudioBaseUrl: _setLmstudioBaseUrl,
    setVllmBaseUrl: _setVllmBaseUrl,
    migrate: _migrate,
    reset: resetSettings,
  } = useSettingsStore();
  void _setTheme; void _setAutoTitle; void _setSendOnEnter; void _setAutoScroll; void _setShowReasoning; void _setKeysEncrypted; void _setEncryptionPassphrase; void _setProviderSetting; void _setActiveProvider; void _setOllamaBaseUrl; void _setLmstudioBaseUrl; void _setVllmBaseUrl; void _migrate;

  // Phase C/D/F preset defaults stored outside server settings
  const [defaultsTopP, setDefaultsTopP] = useState<number>(() => {
    try {
      const v = localStorage.getItem("greeneek.defaults.topP");
      return v ? parseFloat(v) : 1;
    } catch {
      return 1;
    }
  });
  const [defaultsMaxTokens, setDefaultsMaxTokens] = useState<number | undefined>(() => {
    try {
      const v = localStorage.getItem("greeneek.defaults.maxTokens");
      return v ? parseInt(v, 10) : undefined;
    } catch {
      return undefined;
    }
  });

  // Derive settings object for backward compatibility with existing UI code
  const settings = {
    version,
    theme,
    autoTitle,
    sendOnEnter,
    autoScroll,
    showReasoning: settingsShowReasoning,
    keysEncrypted,
    encryptionPassphrase,
    providers: providerSettings,
    activeProviderId,
    ollamaBaseUrl,
    lmstudioBaseUrl,
    vllmBaseUrl,
    defaults: {
      modelId: getActiveModel()?.id,
      mode: "chat",
      temperature: 0.7,
      topP: defaultsTopP,
      maxTokens: defaultsMaxTokens,
      systemPrompt: "",
    },
    behavior: {
      showReasoning: settingsShowReasoning,
    },
    tracing: {
      enabled: false,
      storePrompts: false,
      retentionDays: 30,
      maxSizeMB: 100,
      otlpEndpoint: "",
      redactPatterns: [],
    },
    advanced: {
      requestTimeoutMs: 15000,
      streamIdleTimeoutMs: 60000,
      logLevel: "info",
    },
    data: {
      storageLocation: "",
    },
  };

  const {
    registry: _registry,
    selectedProviderId: _selectedProviderId,
    availableModels: _providerModels,
    setSelectedProvider: _selectProvider,
    refreshModels: _refreshModels,
    toggleProviderEnabled: _toggleProviderEnabled,
    addCustomProvider: _addCustomProvider,
    reset: resetProviderStore,
  } = useProviderStore();
  void _getProviderSetting; void _getActiveProvider; void _registry; void _selectedProviderId; void _providerModels; void _selectProvider; void _refreshModels; void _toggleProviderEnabled; void _addCustomProvider;

  // Local UI state (transient, not persisted)
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("gk.lang") as Lang) ?? "en");
  const [input, setInput] = useState("");
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
  const [attachments, setAttachments] = useState<VisionAttachment[]>([]);

  // Sidebar (Phase D1) — persists width/collapsed, mobile drawer
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem("gk.sidebar.width");
      const n = raw ? parseInt(raw, 10) : NaN;
      if (!Number.isNaN(n)) return Math.max(240, Math.min(360, n));
      return 280;
    } catch { return 280; }
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("gk.sidebar.collapsed") === "1"; } catch { return false; }
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean>(() => typeof window !== "undefined" ? window.innerWidth < 768 : false);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    const m = window.matchMedia("(max-width: 768px)");
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    try { m.addEventListener("change", onChange); } catch { /* safari */ }
    return () => {
      window.removeEventListener("resize", onResize);
      try { m.removeEventListener("change", onChange); } catch {}
    };
  }, []);
  useEffect(() => {
    try { localStorage.setItem("gk.sidebar.width", String(Math.max(240, Math.min(360, Math.round(sidebarWidth))))); } catch {}
  }, [sidebarWidth]);
  useEffect(() => {
    try { localStorage.setItem("gk.sidebar.collapsed", sidebarCollapsed ? "1" : "0"); } catch {}
  }, [sidebarCollapsed]);
  // Ctrl+N new chat (global) — also handled in Sidebar but keep here for shell
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        const id = createThread();
        // optionally maybeAutoTitle will trigger on first message
        void id;
        if (isMobile) setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile]);


  const [settingsLoading, setSettingsLoading] = useState(false);
  const [fieldSaving, setFieldSaving] = useState<Record<string, boolean>>({});
  const [fieldStatus, setFieldStatus] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string; kind?: string; lastTested?: number }>>({});
  const [reveal, setReveal] = useState<Record<string, boolean>>({});

  // Phase 4 — per-conversation model/mode, picker state
  const [conversationModel, setConversationModel] = useState<string>(() => localStorage.getItem("gk.model.current") ?? "");
  const [conversationMode, setConversationMode] = useState<string>(() => localStorage.getItem("gk.mode.current") ?? "chat");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [modePickerOpen, setModePickerOpen] = useState(false);
  const [modes, setModes] = useState<Array<{ id: string; label: string; description: string; capabilities: { tools: boolean; multiStep: boolean; sideEffects: string } }>>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsErrorLocal, setModelsErrorLocal] = useState<string | null>(null);
  const [modelsUpdatedAt, setModelsUpdatedAt] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("gk.model.favorites") ?? "[]"); } catch { return []; }
  });
  const [recents, setRecents] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("gk.model.recents") ?? "[]"); } catch { return []; }
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [presets, setPresets] = useState<Record<string, Record<string, unknown>>>(() => {
    try { return JSON.parse(localStorage.getItem("greeneek.presets") ?? "{}"); } catch { return {}; }
  });
  const [presetName, setPresetName] = useState("");

  // Derive messages from active thread and convert to UI format
  const activeThread = useChatStore((s) => s.getActiveThread());
  const rawMessages = activeThread?.messages ?? [];
  const items: Item[] = rawMessages.map((m) => {
    if (m.role === "user") {
      return {
        kind: "user" as const,
        text: m.content,
        images: m.images?.map((img) => ({ dataUrl: img.dataUrl, name: img.name, mimeType: img.mimeType })),
      };
    }
    if (m.role === "assistant") {
      return {
        kind: "assistant" as const,
        text: m.content,
        streaming: false,
        reasoningContent: m.reasoningContent,
        reasoningStreaming: false,
        usage: m.tokenUsage ? { inputTokens: m.tokenUsage.promptTokens ?? 0, outputTokens: m.tokenUsage.completionTokens ?? 0 } : undefined,
        modelId: m.model,
        providerId: m.providerId,
        latencyMs: undefined,
      };
    }
    if (m.role === "tool") {
      return {
        kind: "tool" as const,
        name: m.name ?? "tool",
        ok: !m.error,
        output: m.content,
        durationMs: 0,
        running: false,
      };
    }
    return {
      kind: "system" as const,
      text: m.content,
    };
  });
  const running = isGenerating;

  const itemsRef = useRef<Item[]>(items);

  // Persist UI items to Zustand store — single source of truth is chat.store
  const setItems = (updater: Item[] | ((prev: Item[]) => Item[])) => {
    const next: Item[] = typeof updater === "function" ? (updater as (p: Item[]) => Item[])(items) : updater;
    const tid = activeThreadId ?? useChatStore.getState().activeThreadId ?? createThread();
    const chatMessages = next.map((it, i) => itemToChatMessage(it, i, rawMessages[i]?.id));
    setMessages(tid, chatMessages as any);
  };

  const showReasoning = settingsShowReasoning ?? true;

  const loadSettings = async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch("/api/settings");
      if (res.ok) {
        const _data = await res.json() as Record<string, unknown>;
        void _data;
        // Migrate server settings to local store if needed
      }
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
      // Update local Zustand store
      // Note: server-side patch will be reflected on next loadSettings call
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
    const prov = settings.providers[provider] as unknown as Record<string, unknown> | undefined;
    const baseUrl = prov?.baseUrl ? String(prov.baseUrl) : undefined;
    // Use draft cred if present (unmasked), else use settings masked check
    const draftKey = creds[`${provider.toUpperCase()}_API_KEY`];
    const rawKey = draftKey ?? (prov?.apiKey ? String(prov.apiKey) : "");
    if (!rawKey || rawKey === "****") {
      setTestResult((r) => ({ ...r, [provider]: { ok: false, message: "Enter API key first (masked value cannot be tested — re-enter to test)", lastTested: Date.now() } }));
      return;
    }
    setTestResult((r) => ({ ...r, [provider]: { ok: false, message: "Testing…", lastTested: Date.now() } }));
    try {
      const res = await fetch("/api/settings/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, apiKey: rawKey, baseUrl }) });
      const body = await res.json() as { ok: boolean; message: string; kind?: string; details?: unknown };
      setTestResult((r) => ({ ...r, [provider]: { ...body, lastTested: Date.now() } }));
    } catch (e) {
      setTestResult((r) => ({ ...r, [provider]: { ok: false, message: e instanceof Error ? e.message : String(e), lastTested: Date.now() } }));
    }
  };

  // Helpers: time, redact, chat controls, presets, export/import
  const formatHHMM = (ts?: number) => {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const redactSecrets = (text: string): string => {
    if (!text) return text;
    // Redact common secret patterns: sk-..., Bearer, api_key, etc.
    return text
      .replace(/sk-[A-Za-z0-9-_]{10,}/g, "sk-***")
      .replace(/sk-or-[A-Za-z0-9-_]{10,}/g, "sk-or-***")
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
      .replace(/(api[_-]?key\s*[:=]\s*)["']?[^"'\s,;]+["']?/gi, "$1***");
  };

  const handleStop = () => {
    // Abort via Zustand and any fetch abort controller
    try {
      useChatStore.getState().abortGeneration();
    } catch {
      // ignore
    }
    const ctrl = useChatStore.getState().abortController;
    if (ctrl) {
      try {
        ctrl.abort();
      } catch {
        // ignore
      }
      setAbortController(null);
    }
    setGenerating(false);
    notify("Stopped");
  };

  const handleRegenerate = () => {
    if (isGenerating) return;
    // Find last user message from rawMessages
    const lastUser = [...rawMessages].reverse().find((m) => m.role === "user");
    if (!lastUser) {
      notify("No user message to regenerate");
      return;
    }
    void runTask(lastUser.content);
  };

  const handleCopyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify("Copied ✓");
    } catch {
      // fallback
      const el = document.createElement("textarea");
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      notify("Copied ✓");
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    const tid = activeThreadId ?? useChatStore.getState().activeThreadId;
    if (!tid) return;
    const thread = useChatStore.getState().getThread(tid) ?? activeThread;
    if (!thread) return;
    const idx = thread.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;
    const next = thread.messages.filter((m) => m.id !== messageId);
    setMessages(tid, next as any);
    setDeleteConfirmId(null);
    notify("Message deleted");
  };

  const handleEditSave = (messageId: string) => {
    const tid = activeThreadId ?? useChatStore.getState().activeThreadId;
    if (!tid) return;
    const thread = useChatStore.getState().getThread(tid) ?? activeThread;
    if (!thread) return;
    const msg = thread.messages.find((m) => m.id === messageId);
    if (!msg) return;
    const trimmed = editDraft.trim();
    if (!trimmed) {
      notify("Message cannot be empty");
      return;
    }
    // update content then truncate after this message and resubmit
    const idx = thread.messages.findIndex((m) => m.id === messageId);
    const updated = thread.messages.map((m) => (m.id === messageId ? { ...m, content: trimmed } : m));
    // truncate any messages after edited user message (including old assistant replies)
    const truncated = updated.slice(0, idx + 1);
    setMessages(tid, truncated as any);
    setEditingId(null);
    setEditDraft("");
    // resubmit
    void runTask(trimmed);
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) {
      notify("Preset name required");
      return;
    }
    const preset = {
      modelId: conversationModel,
      mode: conversationMode,
      temperature: (settings.defaults as Record<string, unknown>).temperature ?? 0.7,
      topP: defaultsTopP,
      maxTokens: defaultsMaxTokens,
      systemPrompt: (settings.defaults as Record<string, unknown>).systemPrompt ?? "",
    };
    const next = { ...presets, [name]: preset as unknown as Record<string, unknown> };
    setPresets(next);
    try {
      localStorage.setItem("greeneek.presets", JSON.stringify(next));
    } catch {
      // ignore
    }
    notify(`Preset saved: ${name}`);
  };

  const applyPreset = (name: string) => {
    const p = presets[name];
    if (!p) return;
    const typed = p as Record<string, unknown>;
    if (typeof typed.modelId === "string" && typed.modelId) {
      setConversationModel(typed.modelId as string);
      localStorage.setItem("gk.model.current", typed.modelId as string);
    }
    if (typeof typed.mode === "string" && typed.mode) {
      setConversationMode(typed.mode as string);
      localStorage.setItem("gk.mode.current", typed.mode as string);
    }
    if (typed.topP !== undefined) {
      const v = Number(typed.topP);
      if (!Number.isNaN(v) && v >= 0 && v <= 1) {
        setDefaultsTopP(v);
        try { localStorage.setItem("greeneek.defaults.topP", String(v)); } catch { /* ignore */ }
      }
    }
    if (typed.maxTokens !== undefined) {
      const v = typed.maxTokens === null || typed.maxTokens === undefined ? undefined : Number(typed.maxTokens);
      if (v === undefined || (!Number.isNaN(v) && v >= 1)) {
        setDefaultsMaxTokens(v as number | undefined);
        try {
          if (v === undefined) localStorage.removeItem("greeneek.defaults.maxTokens");
          else localStorage.setItem("greeneek.defaults.maxTokens", String(v));
        } catch { /* ignore */ }
      }
    }
    if (typed.systemPrompt !== undefined) {
      void patchSettings({ defaults: { systemPrompt: typed.systemPrompt } } as unknown as Record<string, unknown>, "defaults.systemPrompt");
    }
    if (typed.temperature !== undefined) {
      void patchSettings({ defaults: { temperature: typed.temperature } } as unknown as Record<string, unknown>, "defaults.temperature");
    }
    notify(`Preset applied: ${name}`);
  };

  const deletePreset = (name: string) => {
    const next = { ...presets };
    delete next[name];
    setPresets(next);
    try { localStorage.setItem("greeneek.presets", JSON.stringify(next)); } catch { /* ignore */ }
    notify(`Preset deleted: ${name}`);
  };

  const exportChats = (scope: "current" | "all", format: "json" | "markdown") => {
    const allThreads = useChatStore.getState().threads as Record<string, Thread>;
    const threadsToExport: Thread[] = scope === "current"
      ? activeThread ? [activeThread as unknown as Thread] : []
      : (Object.values(allThreads) as Thread[]);
    if (threadsToExport.length === 0) { notify("No chats to export"); return; }
    let content: string;
    let mimeType: string;
    let ext: string;
    if (format === "json") {
      // Redact any secret-like strings before export
      const redactThread = (thr: Thread) => ({
        ...thr,
        messages: thr.messages.map((m: Thread["messages"][number]) => ({ ...m, content: redactSecrets(String((m as {content:string}).content)) })),
      });
      const redacted = threadsToExport.map(redactThread);
      content = JSON.stringify(scope === "current" ? redacted[0] : redacted, null, 2);
      mimeType = "application/json";
      ext = "json";
    } else {
      // Markdown export — one markdown doc per thread concatenated
      const mdParts: string[] = [];
      for (const thr of threadsToExport) {
        mdParts.push(`# ${redactSecrets(thr.title)}`);
        mdParts.push(`_Created: ${new Date(thr.createdAt).toLocaleString()} · Model: ${thr.modelId ?? ""} · Provider: ${thr.providerId ?? ""}_\n`);
        for (const m of thr.messages) {
          const when = formatHHMM((m as unknown as { timestamp?: number }).timestamp ?? (m as unknown as { createdAt?: number }).createdAt);
          const header = m.role === "user" ? `## User ${when ? `· ${when}` : ""}` : m.role === "assistant" ? `## Assistant ${m.model ? `· ${m.model}` : ""} ${when ? `· ${when}` : ""}` : `## ${m.role}`;
          mdParts.push(header);
          mdParts.push(redactSecrets(m.content));
          if (m.tokenUsage) {
            const tu = m.tokenUsage as { promptTokens?: number; completionTokens?: number };
            mdParts.push(`*Tokens — prompt: ${tu.promptTokens ?? 0}, completion: ${tu.completionTokens ?? 0}*\n`);
          }
          mdParts.push("");
        }
        mdParts.push("---\n");
      }
      content = mdParts.join("\n");
      mimeType = "text/markdown";
      ext = "md";
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = scope === "current" ? `greeneek-chat-${threadsToExport[0].id.slice(0, 8)}.${ext}` : `greeneek-chats-all.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
    notify(`Exported ${scope} as ${format.toUpperCase()}`);
  };

  const importChats = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Thread | Thread[];
      const threadsArray: Thread[] = Array.isArray(parsed) ? parsed : [parsed];
      // Basic validation
      for (const thr of threadsArray) {
        if (!thr.id || !Array.isArray(thr.messages)) throw new Error("Invalid thread format");
      }
      const state = useChatStore.getState();
      for (const thr of threadsArray) {
        // Ensure messages have ids and timestamps redacted-safe
        const safeMessages = thr.messages.map((m: Thread["messages"][number]) => ({
          ...m,
          content: redactSecrets(String(m.content ?? "")),
          id: (m.id as string) ?? `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        }));
        const safeThread: Thread = {
          id: thr.id,
          title: redactSecrets(String(thr.title ?? "Imported")),
          messages: safeMessages,
          createdAt: typeof thr.createdAt === "number" ? thr.createdAt : Date.now(),
          updatedAt: Date.now(),
          pinned: Boolean(thr.pinned),
          archived: Boolean(thr.archived),
          modelId: thr.modelId,
          providerId: thr.providerId,
        };
        // Insert via direct store mutation to preserve ids
        useChatStore.setState((s) => ({
          threads: { ...s.threads, [safeThread.id]: safeThread },
          activeThreadId: safeThread.id,
        }));
        // also via add? setState is enough
        void state; // ensure state used
      }
      notify(`Imported ${threadsArray.length} chat(s)`);
    } catch (e) {
      notify(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
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
    setModelsErrorLocal(null);
    try {
      const res = await fetch(`/api/models${force ? "?refresh=1" : ""}`);
      const body = await res.json() as { models?: ModelInfo[]; errors?: unknown[]; updatedAt?: string };
      if (!res.ok) throw new Error((body as unknown as { message?: string }).message ?? "failed");
      setModels((body.models ?? []) as ModelInfo[]);
      setModelsUpdatedAt(body.updatedAt ?? new Date().toISOString());
      if ((body.models ?? []).length === 0) setModelsErrorLocal("No models available — enable and test a provider in Settings → Providers");
    } catch (e) {
      // Retry once on transient failure when online
      if (!force && navigator.onLine && !models.length) {
        try { await new Promise((r) => setTimeout(r, 700)); const r2 = await fetch(`/api/models?refresh=1`); const b2 = await r2.json() as { models?: ModelInfo[]; updatedAt?: string }; if (r2.ok && Array.isArray(b2.models) && b2.models.length) { setModels(b2.models as ModelInfo[]); setModelsUpdatedAt(b2.updatedAt ?? new Date().toISOString()); setModelsErrorLocal(null); return; } } catch { /* fall through */ }
      }
      // Offline degrade: use cached fallback if any models already loaded, else show error
      if (models.length) {
        // keep cached list, show warning
        setModelsErrorLocal(`Failed to refresh — showing cached list: ${e instanceof Error ? e.message : String(e)}`);
      } else {
        setModelsErrorLocal(e instanceof Error ? e.message : String(e));
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
    setGenerating(true);
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
    // Auto-title from first user message (persisted via store)
    try {
      const tid = useChatStore.getState().activeThreadId;
      if (tid) useChatStore.getState().maybeAutoTitle(tid);
    } catch {}
    const hadImages = Boolean(pendingImages?.length);
    if (hadImages) setAttachments([]);
    const sessionId = await ensureSession();
    try {
      // Capture full history for multi-turn (thread.messages)
      const currentThreadId = useChatStore.getState().activeThreadId ?? activeThreadId;
      const historyMessages = currentThreadId ? (useChatStore.getState().threads[currentThreadId]?.messages ?? []) : rawMessages;
      // Ensure history includes the just-added user message (store already updated via setItems above, so historyMessages is current)
      const res = await fetch(`/api/sessions/${sessionId}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: effectiveTask, model: currentModel, provider: provHint, mode: conversationMode, history: historyMessages, ...(pendingImages ? { images: pendingImages } : {}) }),
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
      setGenerating(false);
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

  // Chat scroll: autoScroll setting, stick-bottom unless user scrolls up
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const isAtBottomRef = useRef(true);
  useEffect(() => { isAtBottomRef.current = isAtBottom; }, [isAtBottom]);
  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const threshold = 80;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      isAtBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
      setShowScrollButton(!atBottom && items.length > 0);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    // init
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [items.length]);
  // Auto scroll when new items arrive if autoScroll enabled and user is at bottom (or first load)
  useEffect(() => {
    if (!autoScroll) return;
    if (isAtBottomRef.current || items.length <= 1) {
      scrollToBottom(false);
      setShowScrollButton(false);
    } else {
      // if not at bottom, keep button visible but don't force scroll
      setShowScrollButton(true);
    }
  }, [items, autoScroll, scrollToBottom]);
  // While streaming, keep sticking if user hasn't detached
  useEffect(() => {
    if (!isGenerating) return;
    if (!autoScroll) return;
    if (!isAtBottomRef.current) return;
    const id = window.setInterval(() => {
      if (isAtBottomRef.current) scrollToBottom(false);
    }, 120);
    return () => window.clearInterval(id);
  }, [isGenerating, autoScroll, scrollToBottom]);

  const providerMeta = meta?.provider ? `${meta.provider.provider} · ${meta.provider.model}` : "echo · echo-1";
  const usable = meta?.usage?.tokens ?? 0;

  const providers = (settings.providers as unknown as Record<string, Record<string, unknown>>) ?? {};
  const defaults = (settings?.defaults as Record<string, unknown> | undefined) ?? {};
  const tracing = (settings?.tracing as Record<string, unknown> | undefined) ?? {};
  const advanced = (settings?.advanced as Record<string, unknown> | undefined) ?? {};
  const dataCfg = (settings?.data as Record<string, unknown> | undefined) ?? {};

  return (
    <ErrorBoundary>
    <div className="app">
      <OfflineBanner />
      <header className="header">
        {(isMobile || sidebarCollapsed) && (
          <button className="icon-btn" title={isMobile ? (drawerOpen ? "Close chats" : "Open chats") : "Expand sidebar"} aria-label="Toggle sidebar" onClick={() => (isMobile ? setDrawerOpen((v) => !v) : setSidebarCollapsed(false))} style={{ flexShrink: 0 }}>
            ☰
          </button>
        )}
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
        <ConnectionStatus running={running} />
        <span className="statusline" title={providerMeta} style={{ display: "none" }}>
          <span className="dot" style={{ background: running ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-label-tertiary)" }} />
          {running ? t(lang, "streaming") : providerMeta}
        </span>
        <span className="muted" style={{ fontSize: 11, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={providerMeta}>{providerMeta}</span>
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

      <div className="app-body">
        <Sidebar
          width={sidebarWidth}
          onWidthChange={setSidebarWidth}
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
          drawerOpen={drawerOpen}
          onDrawerOpenChange={setDrawerOpen}
          isMobile={isMobile}
        />
        <div className="app-main">
          <div className="scroll" ref={scrollRef} style={{ position: "relative" }}>
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
                  <div className="bubble">
                    {editingId === String(i) ? (
                      <div>
                        <textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)} style={{ width: "100%", minHeight: 60 }} />
                        <div className="row" style={{ gap: 6, marginTop: 6 }}>
                          <button className="btn" onClick={() => handleEditSave(String(rawMessages[i]?.id ?? String(i)))}>Save & resubmit</button>
                          <button className="btn ghost" onClick={() => { setEditingId(null); setEditDraft(""); }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      item.text
                    )}
                  </div>
                  <div className="meta-line" style={{ justifyContent: "flex-end", fontSize: 11, gap: 6 }}>
                    <span className="muted">{formatHHMM(Date.now())}</span>
                    <button className="btn ghost" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => void handleCopyMessage(item.text)}>Copy</button>
                    <button className="btn ghost" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => { setEditingId(String(i)); setEditDraft(item.text); }}>Edit</button>
                    <button className="btn ghost" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => handleDeleteMessage(String(rawMessages[i]?.id ?? String(i)))}>Delete</button>
                  </div>
                  {item.images?.length ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {item.images.map((img, idx) => (
                        <img key={idx} src={img.dataUrl} alt={img.name} style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 8, border: "1px solid var(--dsw-alias-border-l2)" }} />
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
                  <div className="meta-line" style={{ fontSize: 11, gap: 6, marginTop: 4 }}>
                    <span className="muted">{formatHHMM(Date.now())}</span>
                    <button className="btn ghost" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => void handleCopyMessage(item.text)}>Copy</button>
                    {!item.streaming && <button className="btn ghost" style={{ fontSize: 11, padding: "2px 6px" }} onClick={handleRegenerate}>↻ Regenerate</button>}
                    {deleteConfirmId === String(i) ? (
                      <><button className="btn" style={{ fontSize: 11 }} onClick={() => handleDeleteMessage(String(rawMessages[i]?.id ?? String(i)))}>Confirm delete</button><button className="btn ghost" style={{ fontSize: 11 }} onClick={() => setDeleteConfirmId(null)}>Cancel</button></>
                    ) : (
                      <button className="btn ghost" style={{ fontSize: 11, padding: "2px 6px" }} onClick={() => setDeleteConfirmId(String(i))}>Delete</button>
                    )}
                  </div>
                </div>
              );
            }
            if (item.kind === "system") {
              return (
                <div className="turn" key={i}>
                  <p className="meta-line" style={{ justifyContent: "center", fontStyle: "italic" }}>
                    <span className="dot" style={{ background: "var(--dsw-alias-border-l3)" }} />
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
              <span className="dot" style={{ background: "var(--dsw-alias-border-l3)" }} />
              {t(lang, "runAgain")}
            </p>
          )}
        </div>
            {showScrollButton && (
              <button className="scroll-to-bottom" onClick={() => scrollToBottom(true)} aria-label="Scroll to bottom" title="Scroll to bottom">
                ↓ Bottom
              </button>
            )}
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
            {running ? (
              <button className="btn" onClick={handleStop} title="Stop generation" style={{ minWidth: 56 }}>Stop</button>
            ) : (
              <button className="send" onClick={submit} disabled={!input.trim() && attachments.length === 0} title={t(lang, "send")}>↑</button>
            )}
            {!running && (
              <button className="btn ghost" onClick={handleRegenerate} title="Regenerate last" style={{ fontSize: 12 }}>↻</button>
            )}
          </div>
        </div>
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
              {modelsErrorLocal && <span style={{ fontSize: 11, color: "var(--dsw-alias-state-error-primary)" }}>{modelsErrorLocal} — <a href="#" onClick={(e) => { e.preventDefault(); setPickerOpen(false); setSettingsOpen(true); setTab("providers"); }}>Open Settings → Providers</a></span>}
            </div>
            {modelsLoading && <Skeleton lines={4} />}
            {!modelsLoading && models.length === 0 && !modelsErrorLocal && <p className="muted">No models — enable a provider in Settings → Providers and Test connection.</p>}
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
                        <div key={`fav-${fid}`} className="row" style={{ padding: "6px 0", borderBottom: "1px solid var(--dsw-alias-border-l2)", alignItems: "center" }}>
                          <button className="btn ghost" onClick={() => toggleFavorite(fid)} title="Unfavorite">★</button>
                          <div style={{ flex: 1, cursor: "pointer" }} onClick={() => { persistModel(m.id, m.provider); setPickerOpen(false); }}>
                            <strong>{m.id}</strong> <span className="muted" style={{ fontSize: 11 }}>{m.name}</span>
                            <span className="chip" style={{ marginLeft: 8, fontSize: 10 }}>{m.contextLength ? `${Math.round((m.contextLength ?? 0) / 1000)}k` : ""}</span>
                            {m.pricing?.isFree ? <span className="chip" style={{ fontSize: 10, background: "var(--dsw-alias-state-business-tertiary)" }}>FREE</span> : m.pricing?.promptPer1M ? <span className="muted" style={{ fontSize: 10 }}>${m.pricing.promptPer1M}/1M in</span> : null}
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
                        <div key={`rec-${rid}`} className="row" style={{ padding: "6px 0", borderBottom: "1px solid var(--dsw-alias-border-l2)", alignItems: "center" }}>
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
              <div key={m.id} className="row" style={{ padding: "10px 0", borderBottom: "1px solid var(--dsw-alias-border-l2)", cursor: "pointer", background: conversationMode === m.id ? "var(--dsw-alias-bg-layer-1)" : "transparent" }} onClick={() => {
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
                {conversationMode === m.id && <span style={{ color: "var(--dsw-alias-state-business-primary)" }}>✓</span>}
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
            {tracesLoading ? <TraceSkeleton rows={6} /> : traces.length === 0 ? <p className="muted">No traces yet — send a message, cancel one mid-stream, and send one that 401s to see all three statuses.</p> : (
              <div style={{ maxHeight: 500, overflowY: "auto" }}>
                <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid var(--dsw-alias-border-l2)" }}>
                      <th>Time</th><th>Conversation</th><th>Model</th><th>Mode</th><th>Status</th><th>Tokens</th><th>Cost</th><th>Latency</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {traces.map((r) => (
                      <tr key={r.runId} style={{ borderBottom: "1px solid var(--dsw-alias-border-l2)" }}>
                        <td>{new Date(r.startedAt).toLocaleTimeString()}</td>
                        <td style={{ fontFamily: "var(--ds-font-family-code)", fontSize: 10 }}>{r.conversationId?.slice(0, 8) ?? "-"}</td>
                        <td>{r.modelId}</td>
                        <td>{r.modeId}</td>
                        <td><span className={`chip ${r.status === "ok" ? "active" : r.status === "error" ? "fail" : ""}`}>{r.status}</span>{r.error && <span style={{ color: "var(--dsw-alias-state-error-primary)", marginLeft: 6 }}>{r.error.kind}: {r.error.message.slice(0, 60)}</span>}</td>
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
                <div key={i} style={{ borderLeft: `4px solid ${s.status === "ok" ? "var(--dsw-alias-state-business-primary)" : s.status === "error" ? "var(--dsw-alias-state-error-primary)" : "var(--dsw-alias-border-l3)"}`, padding: "6px 8px", marginBottom: 6, background: "var(--dsw-alias-bg-layer-1)" }}>
                  <strong>{s.name}</strong> <span className="muted">{s.kind} · {s.status}</span> <span className="muted">{s.startedAt} → {s.endedAt ?? "-"}</span>
                  <pre style={{ fontSize: 10, whiteSpace: "pre-wrap", margin: "4px 0 0 0" }}>{JSON.stringify(s.attributes, null, 2).slice(0, 800)}</pre>
                </div>
              ))}
              <h4>Raw JSON</h4>
              <pre style={{ fontSize: 10, background: "var(--dsw-alias-bg-layer-1)", padding: 8, overflowX: "auto" }}>{JSON.stringify(selectedTrace, null, 2).slice(0, 8000)}</pre>
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
                      <div key={pid} style={{ border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
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
                            {test && <p style={{ fontSize: 12, color: test.ok ? "var(--dsw-alias-state-business-primary)" : "var(--dsw-alias-state-error-primary)", marginTop: 6 }}>{test.ok ? "✓ " : "✗ "}{test.message} {test.kind ? `· ${test.kind}` : ""}</p>}
                          </div>
                        ) : (
                          <p className="muted" style={{ fontSize: 12 }}>Ollama is local — no key required. Set baseUrl below.</p>
                        )}
                        <div className="field" style={{ marginTop: 8 }}>
                          <label htmlFor={`base-${pid}`}>Base URL</label>
                          <div className="row">
                            <input id={`base-${pid}`} value={String(prov?.baseUrl ?? "")} onChange={() => {
                              // local draft - actual save on blur via patchSettings
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
                          notify("Imported ✓ — reload to reflect imported settings");
                        } catch (err) { notify(`Import failed: ${err instanceof Error ? err.message : String(err)}`); }
                      }} />
                    </label>
                    <button className="btn ghost" onClick={async () => { if (!confirm("Reset all settings to defaults?")) return; const res = await fetch("/api/settings/reset", { method: "POST" }); if (res.ok) { resetSettings(); resetProviderStore(); notify("Reset to defaults ✓"); } }}>Reset to defaults</button>
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
                      <li key={p.id} style={{ border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 8, padding: 12, marginBottom: 8 }}>
                        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                          <div>
                            <strong>{p.name}</strong> <span className="muted">v{p.version} · {p.kinds.join(",")} · {p.permissions.join(",") || "no perms"}</span>
                            <div className="muted" style={{ fontSize: 12 }}>{p.description}</div>
                            <div style={{ fontSize: 11, marginTop: 4 }}>
                              <span className={`chip ${p.status === "active" ? "active" : p.status === "errored" ? "fail" : ""}`}>{p.status}</span>
                              {p.error && <span style={{ color: "var(--dsw-alias-state-error-primary)", marginLeft: 8 }}>Error: {p.error}</span>}
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
                          <p style={{ fontSize: 11, color: "var(--dsw-alias-state-error-primary)", marginTop: 6 }}>Disabling OpenRouter will remove its models from the picker immediately.</p>
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
                    <label>Top P — {defaultsTopP.toFixed(2)}</label>
                    <input type="range" min={0} max={1} step={0.05} value={defaultsTopP} onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setDefaultsTopP(v);
                      void patchSettings({ defaults: { topP: v } } as unknown as Record<string, unknown>, "defaults.topP");
                    }} />
                    <span className="muted" style={{ fontSize: 12 }}>{fieldStatus["defaults.topP"]}</span>
                  </div>
                  <div className="field">
                    <label>Presets — save/load current model + params</label>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      <input placeholder="preset name" value={presetName} onChange={(e) => setPresetName(e.target.value)} style={{ flex: 1, minWidth: 120 }} />
                      <button className="btn" onClick={savePreset}>Save current</button>
                    </div>
                    {Object.keys(presets).length > 0 ? (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                        {Object.keys(presets).map((n) => (
                          <div key={n} className="row" style={{ justifyContent: "space-between", border: "1px solid var(--dsw-alias-border-l2)", borderRadius: 6, padding: 6 }}>
                            <strong style={{ fontSize: 12 }}>{n}</strong>
                            <span className="row" style={{ gap: 4 }}>
                              <button className="btn ghost" style={{ fontSize: 11 }} onClick={() => applyPreset(n)}>Apply</button>
                              <button className="btn ghost" style={{ fontSize: 11 }} onClick={() => deletePreset(n)}>Delete</button>
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>No presets yet — save the current model/mode/temperature/topP.</p>
                    )}
                  </div>
                  <div className="field">
                    <label>System prompt</label>
                    <textarea defaultValue={String(defaults.systemPrompt ?? "")} onBlur={(e) => void patchSettings({ defaults: { systemPrompt: e.target.value } } as unknown as Record<string, unknown>, "defaults.systemPrompt")} rows={3} style={{ width: "100%" }} />
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
                    <input defaultValue={String(tracing.otlpEndpoint ?? tracing.exportPath ?? "")} onBlur={(e) => void patchSettings({ tracing: { otlpEndpoint: e.target.value, exportPath: e.target.value } } as unknown as Record<string, unknown>, "tracing.otlpEndpoint")} placeholder="https://otel.example.com/v1/traces" style={{ width: "100%" }} />
                  </div>
                  <div className="field">
                    <label>Redact patterns (regex, comma-separated)</label>
                    <input defaultValue={Array.isArray(tracing.redactPatterns) ? (tracing.redactPatterns as string[]).join(", ") : ""} onBlur={(e) => void patchSettings({ tracing: { redactPatterns: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) } } as unknown as Record<string, unknown>, "tracing.redactPatterns")} placeholder="sk-or-.*, password.*" style={{ width: "100%" }} />
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
                    <input defaultValue={String(dataCfg.storageLocation ?? "")} placeholder="default: ~/.greeneek" onBlur={(e) => void patchSettings({ data: { storageLocation: e.target.value || undefined } } as unknown as Record<string, unknown>, "data.storageLocation")} style={{ width: "100%" }} />
                  </div>
                  <div className="row" style={{ gap: 8, marginTop: 12 }}>
                    <button className="btn ghost" onClick={async () => { if (!confirm("Clear all conversations?")) return; await fetch("/api/audit/entries", { method: "DELETE" }).catch(() => {}); notify("Conversations cleared (sessions remain on disk)"); }}>Clear conversations</button>
                    <button className="btn ghost" onClick={async () => { if (!confirm("Clear traces?")) return; notify("Traces are file-based — clear not yet implemented"); }}>Clear traces</button>
                  </div>
                  <div className="field" style={{ marginTop: 12 }}>
                    <label>Chats — export / import (secrets redacted)</label>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      <button className="btn ghost" onClick={() => exportChats("current", "json")}>Export current JSON</button>
                      <button className="btn ghost" onClick={() => exportChats("all", "json")}>Export all JSON</button>
                      <button className="btn ghost" onClick={() => exportChats("current", "markdown")}>Export current MD</button>
                      <button className="btn ghost" onClick={() => exportChats("all", "markdown")}>Export all MD</button>
                      <label className="btn ghost" style={{ cursor: "pointer" }}>
                        Import JSON<input type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) void importChats(f); (e.target as HTMLInputElement).value = ""; }} />
                      </label>
                    </div>
                  </div>
                  <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Settings are versioned (schemaVersion {String(settings.version ?? 2)}) and migrated automatically. Size limit: {String(tracing.maxSizeMB ?? 100)} MB, retention: {String(tracing.retentionDays ?? 30)} days.</p>
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
                          <span className="muted" style={{ fontFamily: "var(--ds-font-family-code)", fontSize: "10px" }}>
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

      {toast && <div style={{ position: "fixed", bottom: 92, left: "50%", transform: "translateX(-50%)", background: "var(--dsw-alias-label-primary)", color: "var(--dsw-static-neutral-bluish-00)", padding: "8px 14px", borderRadius: 999, fontSize: 12 }}>{toast}</div>}
    </div>
    </ErrorBoundary>
  );
}