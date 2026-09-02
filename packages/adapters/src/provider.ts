/**
 * Provider contract per Phase 2.1 — generic across OpenRouter, OpenAI-compatible, Anthropic, Ollama.
 * Extended ModelAdapter keeps backward compat while exposing richer ops where available.
 */
export interface ModelInfo {
  id: string; // "openai/gpt-4o-mini" or "gpt-4o-mini"
  name: string;
  provider: string;
  contextLength?: number;
  pricing?: { promptPer1M?: number; completionPer1M?: number; isFree: boolean };
  modalities?: { input: string[]; output: string[] };
  supportsTools?: boolean;
  supportsStreaming: boolean;
  tags?: string[];
}

export interface ProviderCredentialCheck {
  ok: boolean;
  message: string;
  details?: unknown;
}

export interface Provider {
  id: string;
  label: string;
  validateCredentials(cfg: { apiKey?: string; baseUrl?: string }): Promise<ProviderCredentialCheck>;
  listModels(cfg: { apiKey?: string; baseUrl?: string }, opts?: { forceRefresh?: boolean }): Promise<ModelInfo[]>;
  // chat is the existing ModelAdapter.stream — kept for harness compatibility
}
