// Provider Registry — browser-safe copy of @greeneek/adapters/src/pal/registry.ts
// WHY duplicated: adapters pulls node:crypto (server-only) which Vite externalizes and breaks the web build.
// This file is the pure-data subset for the browser; adapters remains SSOT for provider logic.
// Keep in sync with adapters/src/pal/registry.ts when adding providers.
// Default 10 providers, Local first, deepseek BYOK never default, custom generic line.

import type { ProviderConfig } from "@greeneek/adapters";

export const DEFAULT_REGISTRY: Record<string, ProviderConfig> = {
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    type: "ollama",
    baseURL: "http://localhost:11434",
    apiKeyRequired: false,
    defaultBaseURL: "http://localhost:11434",
    models: "auto",
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: true,
    isLocal: true,
    enabled: true,
    healthCheckEndpoint: "/api/tags",
    docsUrl: "https://ollama.com",
    icon: "ollama",
  },
  lmstudio: {
    id: "lmstudio",
    name: "LM Studio (Local)",
    type: "openai-compatible",
    baseURL: "http://localhost:1234/v1",
    apiKeyRequired: false,
    defaultBaseURL: "http://localhost:1234/v1",
    models: "auto",
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    isLocal: true,
    enabled: true,
    healthCheckEndpoint: "/v1/models",
    docsUrl: "https://lmstudio.ai",
    icon: "lmstudio",
  },
  vllm: {
    id: "vllm",
    name: "vLLM (Local)",
    type: "openai-compatible",
    baseURL: "http://localhost:8000/v1",
    apiKeyRequired: false,
    defaultBaseURL: "http://localhost:8000/v1",
    models: "auto",
    supportsStreaming: true,
    supportsTools: true,
    isLocal: true,
    enabled: false,
    healthCheckEndpoint: "/v1/models",
    docsUrl: "https://docs.vllm.ai",
    icon: "vllm",
  },
  localai: {
    id: "localai",
    name: "LocalAI (Local)",
    type: "openai-compatible",
    baseURL: "http://localhost:8080/v1",
    apiKeyRequired: false,
    defaultBaseURL: "http://localhost:8080/v1",
    models: "auto",
    supportsStreaming: true,
    isLocal: true,
    enabled: false,
    healthCheckEndpoint: "/v1/models",
    docsUrl: "https://localai.io",
    icon: "localai",
  },
  "openai-compatible": {
    id: "openai-compatible",
    name: "Custom OpenAI-Compatible",
    type: "openai-compatible",
    baseURL: "http://localhost:4000/v1",
    apiKeyRequired: false,
    defaultBaseURL: "http://localhost:4000/v1",
    models: "auto",
    supportsStreaming: true,
    isLocal: true,
    enabled: false,
    healthCheckEndpoint: "/v1/models",
    docsUrl: "",
    icon: "custom",
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    type: "openrouter",
    baseURL: "https://openrouter.ai/api/v1",
    apiKeyRequired: true,
    defaultBaseURL: "https://openrouter.ai/api/v1",
    models: "auto",
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: true,
    isLocal: false,
    enabled: true,
    healthCheckEndpoint: "/models",
    headers: { "HTTP-Referer": "https://greeneek.dev", "X-Title": "Greeneek" },
    docsUrl: "https://openrouter.ai/docs",
    icon: "openrouter",
  },
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    type: "deepseek",
    baseURL: "https://api.deepseek.com/v1",
    apiKeyRequired: true,
    defaultBaseURL: "https://api.deepseek.com/v1",
    models: [
      { id: "deepseek-chat", name: "DeepSeek Chat (V3)", providerId: "deepseek", providerType: "deepseek", reasoning: false, tools: true, streaming: true, isLocal: false },
      { id: "deepseek-reasoner", name: "DeepSeek Reasoner (R1)", providerId: "deepseek", providerType: "deepseek", reasoning: true, tools: false, streaming: true, isLocal: false },
    ],
    supportsStreaming: true,
    supportsTools: true,
    supportsReasoning: true,
    isLocal: false,
    enabled: false,
    healthCheckEndpoint: "/v1/models",
    docsUrl: "https://api-docs.deepseek.com",
    icon: "deepseek",
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    type: "openai",
    baseURL: "https://api.openai.com/v1",
    apiKeyRequired: true,
    defaultBaseURL: "https://api.openai.com/v1",
    models: "auto",
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    supportsReasoning: true,
    isLocal: false,
    enabled: true,
    healthCheckEndpoint: "/v1/models",
    docsUrl: "https://platform.openai.com/docs",
    icon: "openai",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    type: "anthropic",
    baseURL: "https://api.anthropic.com/v1",
    apiKeyRequired: true,
    defaultBaseURL: "https://api.anthropic.com/v1",
    models: "auto",
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    isLocal: false,
    enabled: true,
    healthCheckEndpoint: "/v1/models",
    docsUrl: "https://docs.anthropic.com",
    icon: "anthropic",
  },
  google: {
    id: "google",
    name: "Google Gemini",
    type: "google",
    baseURL: "https://generativelanguage.googleapis.com/v1beta",
    apiKeyRequired: true,
    defaultBaseURL: "https://generativelanguage.googleapis.com/v1beta",
    models: "auto",
    supportsStreaming: true,
    supportsVision: true,
    supportsTools: true,
    isLocal: false,
    enabled: false,
    healthCheckEndpoint: "/v1beta/models",
    docsUrl: "https://ai.google.dev",
    icon: "google",
  },
};

// Merge helper: defaults + user overrides (providers patch from settings.providers + settings.plugins)
// User can override baseURL/enabled per provider without breaking registry updates on version bumps.
export function mergeRegistry(
  defaults: Record<string, ProviderConfig>,
  userOverrides: Record<string, Partial<ProviderConfig>> = {},
): Record<string, ProviderConfig> {
  const out: Record<string, ProviderConfig> = { ...defaults };
  for (const [id, patch] of Object.entries(userOverrides)) {
    if (out[id]) out[id] = { ...out[id], ...patch } as ProviderConfig;
    else {
      // Custom provider added by user (e.g. lmstudio2)
      const base = patch as ProviderConfig;
      if (base.id && base.baseURL) out[id] = { ...base } as ProviderConfig;
    }
  }
  return out;
}

export function registryGrouped(registry: Record<string, ProviderConfig>): {
  local: ProviderConfig[];
  cloud: ProviderConfig[];
} {
  const all = Object.values(registry);
  return {
    local: all.filter((p) => p.isLocal).sort((a, b) => Number(!!b.enabled) - Number(!!a.enabled)),
    cloud: all.filter((p) => !p.isLocal).sort((a, b) => Number(!!b.enabled) - Number(!!a.enabled)),
  };
}

export const LOCAL_FIRST_ORDER = ["ollama", "lmstudio", "vllm", "localai", "openai-compatible", "openrouter", "deepseek", "openai", "anthropic", "google"];
