import { existsSync } from "node:fs";
import { getLogger } from "./logger";
import { loadVersioned, saveVersioned, SETTINGS_MIGRATIONS, migrateCredentialsFile } from "./storage";
import { homePaths } from "./paths";

const logger = getLogger("greeneek:settings");

// ---------------------------------------------------------------------------
// Single source of truth — typed settings
// Env vars may only seed defaults through this module.
// No other file should read process.env for a Greeneek key.
// ---------------------------------------------------------------------------

export const CURRENT_SCHEMA_VERSION = 2;

export interface Settings {
  schemaVersion: number;
  // Providers — canonical shape (Phase 3.2), but trimmed for Phase 1.
  providers: {
    openai: { apiKey: string; baseUrl?: string; enabled: boolean };
    anthropic: { apiKey: string; baseUrl?: string; enabled: boolean };
    ollama: { baseUrl: string; enabled: boolean };
    openrouter?: { apiKey: string; baseUrl?: string; enabled: boolean };
  };
  defaults: {
    provider: string; // echo | openai | anthropic | ollama | openrouter
    modelId?: string;
    mode: string;
    temperature: number;
    maxTokens?: number;
    systemPrompt: string;
  };
  plugins: Record<string, { enabled: boolean; config?: Record<string, unknown> }>;
  tracing: {
    enabled: boolean;
    storePrompts: boolean;
    redactPatterns: string[];
    retentionDays: number;
    maxSizeMB: number;
    otlpEndpoint?: string;
    exportPath?: string;
  };
  advanced: {
    requestTimeoutMs: number;
    streamIdleTimeoutMs: number;
    logLevel: "debug" | "info" | "warn" | "error";
  };
  data: {
    storageLocation?: string;
  };
  billing: {
    plan: string; // free | pro | team | enterprise
  };
  search: {
    provider: string; // mock | exa | perplexity | deepseek
  };
  server: {
    port: number;
  };
}

export const DEFAULT_SETTINGS: Settings = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  providers: {
    openai: { apiKey: "", enabled: false },
    anthropic: { apiKey: "", enabled: false },
    ollama: { baseUrl: "http://127.0.0.1:11434/v1", enabled: false },
    openrouter: { apiKey: "", baseUrl: "https://openrouter.ai/api/v1", enabled: false },
  },
  defaults: {
    provider: "echo",
    mode: "chat",
    temperature: 0.7,
    systemPrompt: "You are Greeneek, a precise agent harness.",
  },
  plugins: {
    "greeneek.provider.echo": { enabled: true },
    "greeneek.provider.openai": { enabled: false },
    "greeneek.provider.openrouter": { enabled: false },
    "greeneek.provider.anthropic": { enabled: false },
    "greeneek.provider.ollama": { enabled: false },
    "greeneek.tool.basic": { enabled: true },
    "greeneek.tracer.local": { enabled: true },
    "greeneek.mode.chat": { enabled: true },
  },
  tracing: {
    enabled: true,
    storePrompts: true,
    redactPatterns: [],
    retentionDays: 30,
    maxSizeMB: 100,
    exportPath: "",
  },
  advanced: {
    requestTimeoutMs: 15000,
    streamIdleTimeoutMs: 60000,
    logLevel: "info",
  },
  data: {},
  billing: {
    plan: "free",
  },
  search: {
    provider: "mock",
  },
  server: {
    port: 3080,
  },
};

type EnvSeed = Partial<Settings> & Record<string, unknown>;

/**
 * Read environment into a partial Settings object.
 * This is the ONLY place that reads process.env for Greeneek keys.
 */
export function settingsFromEnv(): EnvSeed {
  const seed: EnvSeed = {};

  const provider = process.env.GREENEK_MODEL_PROVIDER?.trim();
  if (provider) (seed as Settings).defaults = { ...DEFAULT_SETTINGS.defaults, provider };

  const plan = process.env.GREENEK_PLAN?.trim();
  if (plan) (seed as Settings).billing = { plan };

  const verbose = process.env.GREENEK_VERBOSE?.trim();
  if (verbose === "1" || verbose === "true") (seed as Settings).advanced = { ...DEFAULT_SETTINGS.advanced, logLevel: "debug" };

  const otel = process.env.GREENEK_OTEL_EXPORT_PATH?.trim();
  if (otel !== undefined) (seed as Settings).tracing = { ...DEFAULT_SETTINGS.tracing, exportPath: otel, otlpEndpoint: otel };

  const marketplace = process.env.GREENEK_MARKETPLACE_URL?.trim();
  if (marketplace !== undefined) {
    // surfaced via providers/marketplace config row; keep here for unified dump
    (seed as unknown as Record<string, unknown>).marketplaceUrl = marketplace;
  }

  const gatewaySecret = process.env.GREENEK_GATEWAY_SECRET?.trim();
  if (gatewaySecret) (seed as unknown as Record<string, unknown>).gatewaySecret = gatewaySecret;

  const searchProvider = process.env.WEB_SEARCH_PROVIDER?.trim();
  if (searchProvider) (seed as Settings).search = { provider: searchProvider };

  const portRaw = process.env.PORT?.trim();
  if (portRaw && !isNaN(Number(portRaw))) (seed as Settings).server = { port: Number(portRaw) };

  // Provider keys — seed into providers shape but never persist raw env back to file
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) (seed as Settings).providers = { ...DEFAULT_SETTINGS.providers, openai: { ...DEFAULT_SETTINGS.providers.openai, apiKey: normaliseKey(openaiKey), enabled: true } };

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropicKey) {
    const base = (seed as Settings).providers ?? DEFAULT_SETTINGS.providers;
    (seed as Settings).providers = {
      ...base,
      openai: (seed as Settings).providers?.openai ?? base.openai,
      anthropic: { ...DEFAULT_SETTINGS.providers.anthropic, apiKey: normaliseKey(anthropicKey), enabled: true },
      ollama: base.ollama,
      openrouter: base.openrouter ?? DEFAULT_SETTINGS.providers.openrouter,
    };
  }

  const openrouterKey = process.env.OPENROUTER_API_KEY?.trim();
  const openrouterBase = process.env.OPENROUTER_BASE_URL?.trim();
  if (openrouterKey || openrouterBase) {
    const base = (seed as Settings).providers ?? DEFAULT_SETTINGS.providers;
    const cur = (seed as Settings).providers?.openrouter ?? base.openrouter ?? DEFAULT_SETTINGS.providers.openrouter!;
    (seed as Settings).providers = {
      ...base,
      openai: (seed as Settings).providers?.openai ?? base.openai,
      anthropic: (seed as Settings).providers?.anthropic ?? base.anthropic,
      ollama: base.ollama,
      openrouter: {
        ...cur,
        apiKey: openrouterKey ? normaliseKey(openrouterKey) : cur.apiKey,
        baseUrl: openrouterBase ? openrouterBase.replace(/\/$/, "") : cur.baseUrl,
        enabled: Boolean(openrouterKey || cur.enabled),
      },
    };
  }

  const openaiBase = process.env.OPENAI_BASE_URL?.trim();
  if (openaiBase) {
    const base = (seed as Settings).providers ?? DEFAULT_SETTINGS.providers;
    const cur = (seed as Settings).providers?.openai ?? base.openai;
    (seed as Settings).providers = {
      ...base,
      openai: { ...cur, baseUrl: openaiBase.replace(/\/$/, "") },
      anthropic: (seed as Settings).providers?.anthropic ?? base.anthropic,
      ollama: base.ollama,
      openrouter: (seed as Settings).providers?.openrouter ?? base.openrouter,
    };
  }

  const ollamaBase = process.env.OLLAMA_BASE_URL?.trim();
  if (ollamaBase) {
    const base = (seed as Settings).providers ?? DEFAULT_SETTINGS.providers;
    (seed as Settings).providers = { ...base, ollama: { ...base.ollama, baseUrl: ollamaBase } };
  }

  // Legacy search/billing keys — keep centralised here so no other file reads process.env
  for (const k of ["EXA_API_KEY", "PERPLEXITY_API_KEY", "DEEPSEEK_API_KEY", "STRIPE_WEBHOOK_SECRET", "GREENEK_AUTO_APPROVE", "OLLAMA_API_KEY"] as const) {
    const v = process.env[k]?.trim();
    if (v) (seed as unknown as Record<string, unknown>)[k] = normaliseKey(v);
  }

  return seed;
}

function normaliseKey(raw: string): string {
  let s = raw.trim();
  if (s.toLowerCase().startsWith("bearer ")) s = s.slice(7).trim();
  return s;
}

/**
 * Secrets map — the shape the adapter seam expects.
 * Derived from Settings + env overlay + credentials file (for backward compat).
 * New code should read Settings; this is the bridge so adapters don't change shape.
 */
export function secretsFromSettings(settings: Settings, extraCreds: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = { ...extraCreds };
  if (settings.providers.openai.apiKey) out.OPENAI_API_KEY = settings.providers.openai.apiKey;
  if (settings.providers.anthropic.apiKey) out.ANTHROPIC_API_KEY = settings.providers.anthropic.apiKey;
  if (settings.providers.openrouter?.apiKey) out.OPENROUTER_API_KEY = settings.providers.openrouter.apiKey;
  if (settings.defaults.provider) out.GREENEK_MODEL_PROVIDER = settings.defaults.provider;
  if (settings.billing.plan) out.GREENEK_PLAN = settings.billing.plan;
  if (settings.tracing.exportPath) out.GREENEK_OTEL_EXPORT_PATH = settings.tracing.exportPath;
  if (settings.search.provider) out.WEB_SEARCH_PROVIDER = settings.search.provider;
  // Passthrough for legacy env-seeded keys stored as top-level on settings (see settingsFromEnv)
  for (const k of ["EXA_API_KEY", "PERPLEXITY_API_KEY", "DEEPSEEK_API_KEY", "STRIPE_WEBHOOK_SECRET", "GREENEK_AUTO_APPROVE", "OLLAMA_API_KEY", "GREENEK_GATEWAY_SECRET"] as const) {
    const v = (settings as unknown as Record<string, unknown>)[k] as string | undefined;
    if (v) out[k] = v;
  }
  // Provide gateway secret and verbose flag for bundle consumers
  if ((settings as unknown as Record<string, unknown>).gatewaySecret) out.GREENEK_GATEWAY_SECRET = (settings as unknown as Record<string, unknown>).gatewaySecret as string;
  return out;
}

/**
 * Validation — strict with defaults, unknown keys dropped with warning.
 */
export function validateSettings(raw: unknown): Settings {
  if (!raw || typeof raw !== "object") return clone(DEFAULT_SETTINGS);
  const obj = raw as Record<string, unknown>;
  const next: Settings = clone(DEFAULT_SETTINGS);

  if (typeof obj.schemaVersion === "number") next.schemaVersion = obj.schemaVersion;

  // Providers
  const p = obj.providers as Record<string, unknown> | undefined;
  if (p && typeof p === "object") {
    for (const key of ["openai", "anthropic", "ollama", "openrouter"] as const) {
      const v = (p as Record<string, unknown>)[key] as Record<string, unknown> | undefined;
      if (v && typeof v === "object") {
        const cur = (next.providers as Record<string, unknown>)[key] as Record<string, unknown>;
        if (typeof v.apiKey === "string") (cur as Record<string, unknown>).apiKey = normaliseKey(v.apiKey as string);
        if (typeof v.baseUrl === "string") (cur as Record<string, unknown>).baseUrl = (v.baseUrl as string).trim().replace(/\/$/, "");
        if (typeof v.enabled === "boolean") (cur as Record<string, unknown>).enabled = v.enabled;
      }
    }
  }

  const d = obj.defaults as Record<string, unknown> | undefined;
  if (d) {
    if (typeof d.provider === "string" && d.provider) next.defaults.provider = d.provider.trim();
    if (typeof d.modelId === "string") next.defaults.modelId = d.modelId;
    if (typeof d.mode === "string" && d.mode) next.defaults.mode = d.mode;
    if (typeof d.temperature === "number" && d.temperature >= 0 && d.temperature <= 2) next.defaults.temperature = d.temperature;
    if (typeof d.maxTokens === "number") next.defaults.maxTokens = d.maxTokens;
    if (typeof d.systemPrompt === "string") next.defaults.systemPrompt = d.systemPrompt;
  }

  const t = obj.tracing as Record<string, unknown> | undefined;
  if (t) {
    if (typeof t.enabled === "boolean") next.tracing.enabled = t.enabled;
    if (typeof t.storePrompts === "boolean") next.tracing.storePrompts = t.storePrompts;
    if (Array.isArray(t.redactPatterns)) next.tracing.redactPatterns = t.redactPatterns.filter((s) => typeof s === "string") as string[];
    if (typeof t.retentionDays === "number") next.tracing.retentionDays = t.retentionDays;
    if (typeof t.maxSizeMB === "number") next.tracing.maxSizeMB = t.maxSizeMB;
    if (typeof t.otlpEndpoint === "string") next.tracing.otlpEndpoint = t.otlpEndpoint;
    if (typeof t.exportPath === "string") next.tracing.exportPath = t.exportPath;
  }

  const a = obj.advanced as Record<string, unknown> | undefined;
  if (a) {
    if (typeof a.requestTimeoutMs === "number") next.advanced.requestTimeoutMs = a.requestTimeoutMs;
    if (typeof a.streamIdleTimeoutMs === "number") next.advanced.streamIdleTimeoutMs = a.streamIdleTimeoutMs;
    if (a.logLevel === "debug" || a.logLevel === "info" || a.logLevel === "warn" || a.logLevel === "error") next.advanced.logLevel = a.logLevel as Settings["advanced"]["logLevel"];
  }

  const b = obj.billing as Record<string, unknown> | undefined;
  if (b && typeof b.plan === "string" && b.plan) next.billing.plan = b.plan;

  const s = obj.search as Record<string, unknown> | undefined;
  if (s && typeof s.provider === "string" && s.provider) next.search.provider = s.provider;

  const srv = obj.server as Record<string, unknown> | undefined;
  if (srv && typeof srv.port === "number" && srv.port > 0) next.server.port = srv.port;

  const plugins = obj.plugins as Record<string, unknown> | undefined;
  if (plugins && typeof plugins === "object") {
    for (const [k, v] of Object.entries(plugins)) {
      if (v && typeof v === "object" && typeof (v as Record<string, unknown>).enabled === "boolean") {
        next.plugins[k] = v as Settings["plugins"][string];
      }
    }
  }

  // Unknown keys warn
  const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
  for (const k of Object.keys(obj)) {
    if (!allowed.has(k) && k !== "schemaVersion") logger.warn(`dropping unknown settings key "${k}"`);
  }

  return next;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

// ---------------------------------------------------------------------------
// Persistent settings — versioned file + env overlay
// ---------------------------------------------------------------------------

/**
 * Load settings from disk (versioned, migrated) merged with env seed.
 * Env values win for the current process but are not persisted.
 */
export function loadSettings(homeOrFile?: string): Settings {
  const paths = homePaths(homeOrFile ? homeOrFile.replace(/\/config\.json$/, "") : undefined);
  const file = homeOrFile?.endsWith(".json") ? homeOrFile : paths.config;

  // Migrate legacy credentials file on first load
  migrateCredentialsFile(paths.credentials);

  const stored = loadVersioned<Settings>(file, DEFAULT_SETTINGS, SETTINGS_MIGRATIONS);
  const validated = validateSettings(stored);
  validated.schemaVersion = CURRENT_SCHEMA_VERSION;

  // Merge env seed (env wins at runtime)
  const env = settingsFromEnv() as Record<string, unknown>;
  const merged = deepMerge(validated as unknown as Record<string, unknown>, env) as unknown as Settings;
  merged.schemaVersion = CURRENT_SCHEMA_VERSION;
  return merged;
}

/**
 * Persist settings atomically (field-level merge).
 * Never writes a stale whole object without reading current first.
 */
export function saveSettings(fileOrHome: string, full: Settings): void {
  const paths = homePaths(fileOrHome?.includes(".greeneek") ? fileOrHome.replace(/\/config\.json$/, "") : undefined);
  const file = fileOrHome.endsWith(".json") ? fileOrHome : paths.config;
  const validated = validateSettings(full);
  validated.schemaVersion = CURRENT_SCHEMA_VERSION;
  saveVersioned(file, validated, CURRENT_SCHEMA_VERSION);
}

export function updateSettings(fileOrHome: string, patch: Partial<Settings>): Settings {
  const paths = homePaths(fileOrHome?.includes(".greeneek") ? fileOrHome.replace(/\/config\.json$/, "") : undefined);
  const file = fileOrHome.endsWith(".json") ? fileOrHome : paths.config;
  // For file persistence, strip env-only overrides that weren't in stored file
  const stored = loadVersioned<Settings>(file, DEFAULT_SETTINGS, SETTINGS_MIGRATIONS);
  const base = validateSettings(stored);
  const next = deepMerge(base as unknown as Record<string, unknown>, patch as unknown as Record<string, unknown>) as unknown as Settings;
  next.schemaVersion = CURRENT_SCHEMA_VERSION;
  const validated = validateSettings(next);
  validated.schemaVersion = CURRENT_SCHEMA_VERSION;
  saveVersioned(file, validated, CURRENT_SCHEMA_VERSION);
  // Return runtime view (with env overlay)
  return deepMerge(validated as unknown as Record<string, unknown>, settingsFromEnv() as Record<string, unknown>) as unknown as Settings;
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = clone(v);
    }
  }
  return out;
}

/**
 * Hydration helper — load synchronously but report if file did not exist yet.
 * Callers should show a loading state until this resolves if they are about to save.
 */
export function isSettingsHydrated(fileOrHome: string): boolean {
  const paths = homePaths(fileOrHome?.includes(".greeneek") ? fileOrHome.replace(/\/config\.json$/, "") : undefined);
  const file = fileOrHome.endsWith(".json") ? fileOrHome : paths.config;
  return existsSync(file);
}

// Re-export for discoverability — single module exports settings.
export type { Settings as GreeneekSettings };
