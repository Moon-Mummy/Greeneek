import { randomUUID } from "node:crypto";
import { BaseChatProvider } from "./base";
import type {
  ProviderConfig,
  PALModel,
  ChatCompletionParams,
  ChatCompletionChunk,
} from "./types";
import { parseSSE, safeJsonParse } from "../sse";
import { mapProviderError, mapNetworkError, ProviderError } from "../errors";

// Unified streaming chunk shapes we normalize
interface OAIStreamChunk {
  id?: string;
  model?: string;
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
      thought?: string;
      thinking?: string;
      tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
  error?: { message?: string; code?: string | number };
}

const FALLBACK_OPENAI_COMPAT: PALModel[] = [
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    providerId: "openai-compatible",
    providerType: "openai-compatible",
    contextLength: 128000,
    streaming: true,
    tools: true,
    isLocal: false,
    available: false,
  },
];

function inferCapabilities(id: string): Pick<PALModel, "vision" | "reasoning" | "tools"> {
  const lid = id.toLowerCase();
  const vision = lid.includes("vision") || lid.includes("llava") || lid.includes("qwen2") && lid.includes("vl") || lid.includes("gpt-4o") || lid.includes("gemini");
  const reasoning = lid.includes("reasoner") || lid.includes("r1") || lid.includes("thinking") || lid.includes("qwen3") || lid.includes("deepseek-r1") || lid.includes("o1");
  const tools = !lid.includes("embedding");
  return { vision: !!vision, reasoning: !!reasoning, tools };
}

/**
 * OpenAI-compatible workhorse: Ollama (OpenAI compat), LM Studio, vLLM, LocalAI,
 * LiteLLM, AnythingLLM, FastChat, custom endpoints.
 * - Normalises baseURL (/v1, trailing /, /v1/chat/completions)
 * - Discovery: GET {base}/v1/models → fallback GET {base}/api/tags (Ollama native)
 * - Streaming: SSE data: {…} + data: [DONE], tolerates NDJSON, splits reasoningContent
 * - Auth: only sends Authorization if apiKeyRequired
 * - Vision/tools/reasoning mapping
 */
export class OpenAICompatiblePAL extends BaseChatProvider {
  readonly config: ProviderConfig;
  private apiKey?: string;

  constructor(config: ProviderConfig, opts: { apiKey?: string } = {}) {
    super();
    this.config = config;
    this.apiKey = opts.apiKey?.trim().replace(/^Bearer\s+/i, "") || undefined;
  }

  private effectiveBase(): string {
    let b = (this.config.baseURL ?? "").replace(/\/$/, "");
    // Strip trailing /v1/chat/completions or /chat/completions if user pasted full endpoint
    b = b.replace(/\/v1\/chat\/completions\/?$/, "").replace(/\/chat\/completions\/?$/, "");
    // Keep /v1 if already there, else ensure /v1 for discovery
    return b;
  }

  private chatUrl(): string {
    const base = this.effectiveBase();
    // If base already ends with /v1, just append /chat/completions
    if (base.endsWith("/v1")) return `${base}/chat/completions`;
    return `${base}/v1/chat/completions`;
  }

  private modelsUrl(): string {
    const base = this.effectiveBase();
    if (base.endsWith("/v1")) return `${base}/models`;
    return `${base}/v1/models`;
  }

  private ollamaTagsUrl(): string {
    const base = this.effectiveBase().replace(/\/v1$/, "");
    return `${base}/api/tags`;
  }

  override async healthCheck(): Promise<{ ok: boolean; error?: string; modelsCount?: number }> {
    try {
      const models = await this.listModels();
      return { ok: true, modelsCount: models.length };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  override async listModels(): Promise<PALModel[]> {
    // Try OpenAI spec first
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (this.config.apiKeyRequired && this.apiKey) headers["authorization"] = `Bearer ${this.apiKey}`;
      if (this.config.headers) Object.assign(headers, this.config.headers);
      const res = await fetch(this.modelsUrl(), { method: "GET", headers });
      if (res.ok) {
        const body = (await res.json()) as { data?: Array<{ id: string }> };
        const ids = body.data ?? [];
        if (ids.length) {
          return ids.map((m) => ({
            id: m.id,
            name: m.id,
            providerId: this.config.id,
            providerType: this.config.type,
            baseURL: this.config.baseURL,
            streaming: this.config.supportsStreaming,
            tools: this.config.supportsTools,
            vision: this.config.supportsVision,
            reasoning: this.config.supportsReasoning,
            isLocal: !!this.config.isLocal,
            available: true,
            ...inferCapabilities(m.id),
          }));
        }
      }
    } catch {
      // fall through to Ollama tags
    }

    // Fallback: Ollama native /api/tags
    try {
      const base = this.effectiveBase().replace(/\/v1$/, "");
      // Only try /api/tags if isLocal or base is localhost
      const shouldTryOllama = this.config.isLocal || base.includes("11434") || base.includes("localhost");
      if (shouldTryOllama) {
        const res = await fetch(this.ollamaTagsUrl(), { headers: { "content-type": "application/json" } });
        if (res.ok) {
          const body = (await res.json()) as { models?: Array<{ name: string; model: string }> };
          const list = body.models ?? [];
          if (list.length) {
            return list.map((m) => {
              const id = m.name || m.model;
              return {
                id,
                name: id,
                providerId: this.config.id,
                providerType: this.config.type,
                baseURL: this.config.baseURL,
                streaming: true,
                isLocal: true,
                available: true,
                ...inferCapabilities(id),
              };
            });
          }
        }
      }
    } catch {
      // ignore
    }

    if (this.config.isLocal) return [];
    return FALLBACK_OPENAI_COMPAT.map((m) => ({ ...m, providerId: this.config.id }));
  }

  override async chatCompletion(
    params: ChatCompletionParams,
  ): Promise<AsyncIterable<ChatCompletionChunk> | string> {
    if (!params.stream) {
      // Non-streaming: single POST then return string
      const res = await this.postChat(params, false);
      if (!res.ok) {
        const text = await res.text();
        throw mapProviderError(res.status, text, this.config.id);
      }
      const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
      if (body.error) throw mapProviderError(400, JSON.stringify(body), this.config.id);
      return body.choices?.[0]?.message?.content ?? "";
    }

    // Streaming → AsyncIterable
    const res = await this.postChat(params, true);
    if (!res.ok) {
      const text = await res.text();
      throw mapProviderError(res.status, text, this.config.id);
    }
    if (!res.body) throw new ProviderError({ kind: "unknown", message: "No body", providerMessage: "empty body" });
    return this.iterateSSE(res.body, params);
  }

  private async postChat(params: ChatCompletionParams, stream: boolean): Promise<Response> {
    const url = this.chatUrl();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.config.apiKeyRequired && this.apiKey) headers["authorization"] = `Bearer ${this.apiKey}`;
    if (this.config.headers) Object.assign(headers, this.config.headers);
    // Don't send Bearer undefined for local

    const messages = this.buildMessages(params);
    const body: Record<string, unknown> = {
      model: params.model,
      messages,
      stream,
    };
    if (stream) {
      body["stream_options"] = { include_usage: true };
      (body as Record<string, unknown>)["usage"] = { include: true };
    }
    if (params.temperature !== undefined) body["temperature"] = params.temperature;
    if (params.topP !== undefined) body["top_p"] = params.topP;
    if (params.maxTokens !== undefined) body["max_tokens"] = params.maxTokens;
    if (params.tools?.length) {
      body["tools"] = (params.tools as unknown[]).map((t) => {
        const tt = t as { name: string; description?: string; parameters?: unknown };
        return { type: "function", function: { name: tt.name, description: tt.description, parameters: tt.parameters } };
      });
    }

    try {
      return await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    } catch (e) {
      throw mapNetworkError(e, this.config.id);
    }
  }

  private buildMessages(params: ChatCompletionParams): unknown[] {
    const out: unknown[] = [];
    if (params.systemPrompt) out.push({ role: "system", content: params.systemPrompt });
    for (const m of params.messages) {
      if (m.role === "tool") {
        out.push({ role: "tool", tool_call_id: m.toolCallId, content: m.content });
        continue;
      }
      // Vision: if message has images and provider supports vision, map to image_url
      if (m.images?.length && this.config.supportsVision) {
        const content: unknown[] = [{ type: "text", text: m.content }];
        for (const img of m.images) {
          (content as unknown[]).push({ type: "image_url", image_url: { url: img.dataUrl } });
        }
        out.push({ role: m.role, content, tool_calls: m.toolCalls });
        continue;
      }
      out.push({ role: m.role, content: m.content, tool_calls: m.toolCalls });
    }
    return out;
  }

  private async *iterateSSE(
    body: ReadableStream<Uint8Array>,
    _params: ChatCompletionParams,
  ): AsyncIterable<ChatCompletionChunk> {
    const toolAcc = new Map<number, { id: string; name: string; arguments: string }>();
    for await (const payload of parseSSE(body)) {
      const chunk = safeJsonParse<OAIStreamChunk>(payload);
      if (!chunk) continue;
      if (chunk.error) throw mapProviderError(400, JSON.stringify({ error: chunk.error }), this.config.id);
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      const d = choice.delta;
      const content = d?.content;
      const reasoningContent = d?.reasoning_content ?? d?.thought ?? d?.thinking;
      // Tool calls accum
      for (const tc of d?.tool_calls ?? []) {
        const acc = toolAcc.get(tc.index) ?? { id: `call_${randomUUID().slice(0, 8)}`, name: "", arguments: "" };
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.name += tc.function.name;
        if (tc.function?.arguments) acc.arguments += tc.function.arguments;
        toolAcc.set(tc.index, acc);
      }
      if (content || reasoningContent || (d?.tool_calls?.length ?? 0) > 0) {
        yield {
          id: chunk.id ?? `chunk_${randomUUID().slice(0, 8)}`,
          model: chunk.model ?? _params.model,
          delta: {
            content: content || undefined,
            reasoningContent: reasoningContent || undefined,
            toolCalls: d?.tool_calls ? [...toolAcc.values()] : undefined,
          },
          finishReason: choice.finish_reason ?? null,
          done: false,
        };
      }
      if (choice.finish_reason) {
        // Emit final done if needed; tool calls already accumulated
        if (toolAcc.size) {
          yield {
            id: `done_${randomUUID().slice(0, 8)}`,
            model: chunk.model ?? _params.model,
            delta: { toolCalls: [...toolAcc.values()] },
            finishReason: choice.finish_reason,
            done: true,
          };
        } else {
          yield {
            id: `done_${randomUUID().slice(0, 8)}`,
            model: chunk.model ?? _params.model,
            delta: {},
            finishReason: choice.finish_reason,
            done: true,
          };
        }
      }
    }
  }
}
