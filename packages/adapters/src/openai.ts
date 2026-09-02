import { randomUUID } from "node:crypto";
import type { Message, ModelAdapter, StreamEvent, ToolCall, ToolDefinition, Usage } from "@greeneek/core";
import { mapNetworkError, mapProviderError, ProviderError } from "./errors";
import { parseSSE, safeJsonParse } from "./sse";
import type { ModelInfo } from "./provider";

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  error?: { message?: string; code?: string };
}

const OPENAI_FALLBACK_MODELS: ModelInfo[] = [
  { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", contextLength: 128000, pricing: { promptPer1M: 0.15, completionPer1M: 0.6, isFree: false }, supportsStreaming: true, supportsTools: true },
  { id: "gpt-4o", name: "GPT-4o", provider: "openai", contextLength: 128000, pricing: { promptPer1M: 2.5, completionPer1M: 10, isFree: false }, supportsStreaming: true, supportsTools: true },
  { id: "gpt-4o-mini:free", name: "GPT-4o Mini (free)", provider: "openai", contextLength: 128000, pricing: { promptPer1M: 0, completionPer1M: 0, isFree: true }, supportsStreaming: true, supportsTools: true },
];

function normaliseBaseUrl(raw?: string): string {
  return (raw ?? "https://api.openai.com/v1").replace(/\/$/, "");
}
function normaliseKey(raw?: string): string | undefined {
  if (!raw) return undefined;
  let s = raw.trim();
  if (s.toLowerCase().startsWith("bearer ")) s = s.slice(7).trim();
  return s || undefined;
}

/**
 * OpenAI-compatible adapter.
 *
 * Speaks /chat/completions streaming — covers OpenAI, any OpenAI-compatible
 * gateway, and Ollama's OpenAI-compatible endpoint. Shares SSE/error logic
 * with the OpenRouter adapter. Registering a provider is one config row;
 * nothing outside this seam changes.
 *
 * Also exposes validateCredentials and listModels for parity with OpenRouter
 * so the model picker and Settings test-connection buttons work uniformly.
 */
export class OpenAICompatibleAdapter implements ModelAdapter {
  readonly provider: string = "openai";
  readonly model: string;
  readonly baseUrl: string;
  private apiKey?: string;
  readonly pricing = { inputPerMToken: 2.5, outputPerMToken: 10 };

  constructor(options: { model?: string; baseUrl?: string; apiKey?: string }) {
    this.model = options.model ?? "gpt-4o-mini";
    this.baseUrl = normaliseBaseUrl(options.baseUrl);
    this.apiKey = normaliseKey(options.apiKey);
  }

  async validateCredentials(cfg: { apiKey?: string; baseUrl?: string } = {}): Promise<{ ok: boolean; message: string; details?: unknown }> {
    const key = normaliseKey(cfg.apiKey ?? this.apiKey);
    const base = normaliseBaseUrl(cfg.baseUrl ?? this.baseUrl);
    if (!key) return { ok: false, message: "No API key provided for OpenAI" };
    try {
      const res = await fetch(`${base}/models`, { method: "GET", headers: { authorization: `Bearer ${key}` } });
      const text = await res.text();
      if (res.ok) return { ok: true, message: "OpenAI key valid", details: text.slice(0, 500) };
      const err = mapProviderError(res.status, text, "openai");
      return { ok: false, message: err.message, details: err };
    } catch (e) {
      const err = mapNetworkError(e, "openai");
      return { ok: false, message: err.message, details: err };
    }
  }

  async listModels(cfg: { apiKey?: string; baseUrl?: string } = {}, _opts: { forceRefresh?: boolean } = {}): Promise<ModelInfo[]> {
    const key = normaliseKey(cfg.apiKey ?? this.apiKey);
    const base = normaliseBaseUrl(cfg.baseUrl ?? this.baseUrl);
    if (!key) return OPENAI_FALLBACK_MODELS;
    try {
      const res = await fetch(`${base}/models`, { method: "GET", headers: { authorization: `Bearer ${key}` } });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const body = (await res.json()) as { data?: Array<{ id: string }> };
      const ids = body.data ?? [];
      if (ids.length === 0) return OPENAI_FALLBACK_MODELS;
      return ids.map((m) => ({ id: m.id, name: m.id, provider: "openai", supportsStreaming: true, supportsTools: true, pricing: { isFree: false } }));
    } catch {
      return OPENAI_FALLBACK_MODELS;
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
      stream_options: { include_usage: true },
      usage: { include: true },
    };
    if (options.tools?.length) {
      body.tools = options.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${this.apiKey ?? ""}`,
    };

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (e) {
      throw mapNetworkError(e, "openai");
    }
    if (!res.ok) {
      const text = await res.text();
      throw mapProviderError(res.status, text, "openai");
    }
    if (!res.body) throw new ProviderError({ kind: "unknown", message: "OpenAI returned no body", providerMessage: "empty body" });

    const toolAcc = new Map<number, { id: string; name: string; arguments: string }>();
    let usage: Usage = { inputTokens: 0, outputTokens: 0 };

    for await (const payload of parseSSE(res.body, options.signal)) {
      const chunk = safeJsonParse<OpenAIStreamChunk>(payload);
      if (!chunk) continue;
      if ((chunk as OpenAIStreamChunk).error) {
        throw mapProviderError(400, JSON.stringify({ error: (chunk as OpenAIStreamChunk).error }), "openai");
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
      if (options.signal?.aborted) throw new ProviderError({ kind: "unknown", message: "aborted", providerMessage: "aborted" });
    }

    if (toolAcc.size) {
      const calls: ToolCall[] = [...toolAcc.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => ({ id: v.id, name: v.name, arguments: this.safeParse(v.arguments) }));
      yield { type: "toolCalls", calls };
    }
    yield { type: "usage", usage };
  }

  private safeParse(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return { raw };
    }
  }
}
