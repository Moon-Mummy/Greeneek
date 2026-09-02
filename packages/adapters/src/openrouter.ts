import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Message, ModelAdapter, StreamEvent, ToolCall, ToolDefinition, Usage } from "@greeneek/core";

const HOME_DIR_NAME = ".greeneek";
import { ProviderError, mapNetworkError, mapProviderError } from "./errors";
import { parseSSE, safeJsonParse } from "./sse";
import type { ModelInfo } from "./provider";

interface OpenRouterChunk {
  choices?: Array<{
    delta?: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  error?: { message?: string; code?: string | number };
  id?: string;
}

interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: string[];
}

const FALLBACK_MODELS: ModelInfo[] = [
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "openrouter", contextLength: 128000, pricing: { promptPer1M: 0.15, completionPer1M: 0.6, isFree: false }, supportsStreaming: true, supportsTools: true },
  { id: "openai/gpt-4o", name: "GPT-4o", provider: "openrouter", contextLength: 128000, pricing: { promptPer1M: 2.5, completionPer1M: 10, isFree: false }, supportsStreaming: true, supportsTools: true },
  { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "openrouter", contextLength: 200000, pricing: { promptPer1M: 3, completionPer1M: 15, isFree: false }, supportsStreaming: true, supportsTools: true },
  { id: "google/gemini-flash-1.5", name: "Gemini Flash 1.5", provider: "openrouter", contextLength: 1000000, pricing: { promptPer1M: 0.075, completionPer1M: 0.3, isFree: false }, supportsStreaming: true, supportsTools: true },
  { id: "meta-llama/llama-3.1-8b-instruct:free", name: "Llama 3.1 8B (free)", provider: "openrouter", contextLength: 131000, pricing: { promptPer1M: 0, completionPer1M: 0, isFree: true }, supportsStreaming: true, supportsTools: true },
];

function cachePath(): string {
  return join(homedir(), HOME_DIR_NAME, "cache", "openrouter-models.json");
}

function isFreeModel(id: string, pricing?: { prompt?: string; completion?: string }): boolean {
  if (id.endsWith(":free")) return true;
  if (!pricing) return false;
  return pricing.prompt === "0" && pricing.completion === "0";
}

function mapModel(m: OpenRouterModel): ModelInfo {
  const promptPer1M = m.pricing?.prompt ? parseFloat(m.pricing.prompt) * 1_000_000 : undefined;
  const completionPer1M = m.pricing?.completion ? parseFloat(m.pricing.completion) * 1_000_000 : undefined;
  return {
    id: m.id,
    name: m.name ?? m.id,
    provider: "openrouter",
    contextLength: m.context_length,
    pricing: { promptPer1M, completionPer1M, isFree: isFreeModel(m.id, m.pricing) },
    modalities: { input: m.architecture?.input_modalities ?? ["text"], output: m.architecture?.output_modalities ?? ["text"] },
    supportsTools: m.supported_parameters?.includes("tools") ?? false,
    supportsStreaming: true,
    tags: isFreeModel(m.id, m.pricing) ? ["free"] : [],
  };
}

function normaliseKey(raw?: string): string | undefined {
  if (!raw) return undefined;
  let s = raw.trim();
  if (s.toLowerCase().startsWith("bearer ")) s = s.slice(7).trim();
  return s || undefined;
}

function normaliseBaseUrl(raw?: string): string {
  return (raw ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
}

/**
 * OpenRouter adapter — full spec 2.2.
 * Base URL https://openrouter.ai/api/v1, headers Authorization Bearer + HTTP-Referer + X-Title,
 * key normalisation, validate via /auth/key, list via /models with cache, chat via /chat/completions
 * with usage.include, SSE keep-alive tolerant, precise error mapping.
 */
export class OpenRouterAdapter implements ModelAdapter {
  readonly provider = "openrouter";
  readonly model: string;
  readonly baseUrl: string;
  private apiKey?: string;
  readonly pricing = { inputPerMToken: 0.15, outputPerMToken: 0.6 };

  constructor(options: { model?: string; baseUrl?: string; apiKey?: string }) {
    this.model = options.model ?? "openai/gpt-4o-mini";
    this.baseUrl = normaliseBaseUrl(options.baseUrl);
    this.apiKey = normaliseKey(options.apiKey);
    if (this.apiKey && !this.apiKey.startsWith("sk-or-")) {
      console.warn(`[greeneek:openrouter] OpenRouter key does not start with sk-or- (got ${this.apiKey.slice(0, 6)}...)`);
    }
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      authorization: `Bearer ${this.apiKey ?? ""}`,
      "HTTP-Referer": "https://greeneek.dev",
      "X-Title": "Greeneek",
    };
  }

  async validateCredentials(cfg: { apiKey?: string; baseUrl?: string } = {}): Promise<{ ok: boolean; message: string; details?: unknown }> {
    const key = normaliseKey(cfg.apiKey ?? this.apiKey);
    const base = normaliseBaseUrl(cfg.baseUrl ?? this.baseUrl);
    if (!key) return { ok: false, message: "No API key provided for OpenRouter" };
    // Never use GET /models as key test — it's public and always succeeds (spec 0.4 #9)
    try {
      const res = await fetch(`${base}/auth/key`, { method: "GET", headers: { authorization: `Bearer ${key}` } });
      const text = await res.text();
      if (res.ok) {
        let data: unknown = null;
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
        return { ok: true, message: "OpenRouter key valid", details: data };
      }
      const err = mapProviderError(res.status, text, "openrouter");
      return { ok: false, message: err.message, details: err };
    } catch (e) {
      const err = mapNetworkError(e, "openrouter");
      return { ok: false, message: err.message, details: err };
    }
  }

  async listModels(
    cfg: { apiKey?: string; baseUrl?: string } = {},
    opts: { forceRefresh?: boolean } = {},
  ): Promise<ModelInfo[]> {
    const base = normaliseBaseUrl(cfg.baseUrl ?? this.baseUrl);
    const cache = cachePath();
    const useCache = !opts.forceRefresh && existsSync(cache);
    let cached: { ts: number; models: ModelInfo[] } | null = null;
    if (useCache) {
      try {
        const parsed = JSON.parse(readFileSync(cache, "utf8")) as { ts: number; models: ModelInfo[] };
        cached = parsed;
        if (cached && Date.now() - cached.ts < 24 * 60 * 60 * 1000) return cached.models;
      } catch {
        cached = null;
      }
    }
    try {
      // GET /models is public — no key required (spec 0.4 #9)
      const res = await fetch(`${base}/models`, { method: "GET", headers: { "content-type": "application/json" } });
      if (!res.ok) throw new Error(`models fetch ${res.status}: ${await res.text()}`);
      const body = (await res.json()) as { data?: OpenRouterModel[] };
      const models = (body.data ?? []).map(mapModel);
      if (models.length === 0) throw new Error("empty model list");
      try {
        mkdirSync(join(cache, ".."), { recursive: true });
        writeFileSync(cache, JSON.stringify({ ts: Date.now(), models }, null, 2), "utf8");
      } catch {
        // cache write is best-effort
      }
      return models;
    } catch (e) {
      if (cached?.models?.length) {
        console.warn(`[greeneek:openrouter] models fetch failed, using cache: ${e instanceof Error ? e.message : String(e)}`);
        return cached.models;
      }
      // No cache — fallback list with warning
      console.warn(`[greeneek:openrouter] models fetch failed, using fallback list: ${e instanceof Error ? e.message : String(e)}`);
      return FALLBACK_MODELS;
    }
  }

  async *stream(messages: Message[], options: { tools?: ToolDefinition[]; signal?: AbortSignal }): AsyncGenerator<StreamEvent> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => {
        if (m.role === "tool") return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
        return { role: m.role, content: m.content, tool_calls: m.toolCalls };
      }),
      stream: true,
      usage: { include: true },
    };
    if (options.tools?.length) {
      body.tools = options.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (e) {
      throw mapNetworkError(e, "openrouter");
    }
    if (!res.ok) {
      const text = await res.text();
      throw mapProviderError(res.status, text, "openrouter");
    }
    if (!res.body) throw new ProviderError({ kind: "unknown", message: "OpenRouter returned no body", providerMessage: "empty body" });

    const toolAcc = new Map<number, { id: string; name: string; arguments: string }>();
    let usage: Usage = { inputTokens: 0, outputTokens: 0 };
    let streamError: OpenRouterChunk["error"] | null = null;

    for await (const payload of parseSSE(res.body, options.signal)) {
      const chunk = safeJsonParse<OpenRouterChunk>(payload);
      if (!chunk) continue;
      if (chunk.error) {
        streamError = chunk.error;
        // Mid-stream error — map and throw
        throw mapProviderError(400, JSON.stringify({ error: chunk.error }), "openrouter");
      }
      const choice = chunk.choices?.[0];
      if (choice?.delta?.content) yield { type: "text", delta: choice.delta.content };
      for (const tc of choice?.delta?.tool_calls ?? []) {
        const acc = toolAcc.get(tc.index) ?? { id: `call_${randomUUID().slice(0, 8)}`, name: "", arguments: "" };
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.name += tc.function.name;
        if (tc.function?.arguments) acc.arguments += tc.function.arguments;
        toolAcc.set(tc.index, acc);
      }
      if (chunk.usage) {
        usage = { inputTokens: chunk.usage.prompt_tokens ?? 0, outputTokens: chunk.usage.completion_tokens ?? 0 };
      }
      // Honour abort after each chunk
      if (options.signal?.aborted) throw new ProviderError({ kind: "unknown", message: "aborted", providerMessage: "aborted" });
    }

    if (toolAcc.size) {
      const calls: ToolCall[] = [...toolAcc.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => ({ id: v.id, name: v.name, arguments: this.safeParse(v.arguments) }));
      yield { type: "toolCalls", calls };
    }
    yield { type: "usage", usage };
    void streamError;
  }

  private safeParse(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return { raw };
    }
  }
}
