import { randomUUID } from "node:crypto";
import { BaseChatProvider } from "./base";
import type {
  ProviderConfig,
  PALModel,
  ChatCompletionParams,
  ChatCompletionChunk,
} from "./types";
import { mapNetworkError, ProviderError } from "../errors";

interface OllamaChatChunk {
  model: string;
  created_at?: string;
  message?: { role: string; content: string; thinking?: string; images?: string[] };
  thinking?: string;
  response?: string;
  done?: boolean;
  done_reason?: string;
}

/**
 * Native Ollama provider — speaks /api/chat and /api/tags directly.
 * Handles `thinking`/`reasoning` fields, NDJSON streaming, images: [base64].
 * Preferred over OpenAI-compatible when talking to Ollama (more faithful).
 */
export class OllamaNativePAL extends BaseChatProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    super();
    // Native Ollama base is http://localhost:11434 (no /v1)
    this.config = { ...config, baseURL: config.baseURL.replace(/\/v1\/?$/, "") };
  }

  private base(): string {
    return this.config.baseURL.replace(/\/$/, "");
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
    try {
      const res = await fetch(`${this.base()}/api/tags`, { headers: { "content-type": "application/json" } });
      if (!res.ok) return [];
      const body = (await res.json()) as { models?: Array<{ name: string; details?: { parameter_size?: string } }> };
      const list = body.models ?? [];
      return list.map((m) => {
        const id = m.name;
        const lid = id.toLowerCase();
        return {
          id,
          name: id,
          providerId: this.config.id,
          providerType: this.config.type,
          baseURL: this.config.baseURL,
          streaming: true,
          isLocal: true,
          available: true,
          vision: lid.includes("llava") || lid.includes("vision") || lid.includes("llama3.2") && lid.includes("vision"),
          reasoning: lid.includes("r1") || lid.includes("deepseek-r1") || lid.includes("qwen3"),
          tools: true,
          tags: m.details?.parameter_size ? [m.details.parameter_size] : [],
        };
      });
    } catch {
      return [];
    }
  }

  override async chatCompletion(
    params: ChatCompletionParams,
  ): Promise<AsyncIterable<ChatCompletionChunk> | string> {
    if (!params.stream) {
      const chunks: ChatCompletionChunk[] = [];
      for await (const c of this.streamChat(params)) chunks.push(c);
      return chunks.map((c) => c.delta.content ?? "").join("");
    }
    return this.streamChat(params);
  }

  private async *streamChat(params: ChatCompletionParams): AsyncIterable<ChatCompletionChunk> {
    const url = `${this.base()}/api/chat`;
    const messages = params.messages.map((m) => {
      // Ollama native: images as base64 stripped of data: prefix
      if (m.images?.length) {
        return {
          role: m.role,
          content: m.content,
          images: m.images.map((im) => im.dataUrl.replace(/^data:[^;]+;base64,/, "")),
        };
      }
      if (m.toolCalls?.length) {
        return { role: "assistant", content: m.content, tool_calls: m.toolCalls };
      }
      return { role: m.role, content: m.content };
    });
    // Prepend system prompt if provided
    if (params.systemPrompt) messages.unshift({ role: "system", content: params.systemPrompt });

    const body: Record<string, unknown> = {
      model: params.model,
      messages,
      stream: true,
      think: params.reasoning ?? undefined,
    };
    if (params.temperature !== undefined) body["options"] = { ...(body["options"] as object ?? {}), temperature: params.temperature };
    if (params.tools?.length) body["tools"] = params.tools;

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw mapNetworkError(e, this.config.id);
    }
    if (!res.ok) {
      const text = await res.text();
      throw new ProviderError({ kind: "server", message: `Ollama error ${res.status}: ${text.slice(0, 500)}`, status: res.status, providerMessage: text.slice(0, 500) });
    }
    if (!res.body) throw new ProviderError({ kind: "unknown", message: "No body", providerMessage: "empty body" });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let chunk: OllamaChatChunk | null = null;
        try {
          chunk = JSON.parse(trimmed) as OllamaChatChunk;
        } catch {
          continue;
        }
        if (!chunk) continue;
        const content = chunk.message?.content ?? chunk.response;
        const reasoning = chunk.message?.thinking ?? chunk.thinking;
        if (reasoning) yield { type: "reasoning", delta: reasoning } as never;
        if (content) {
          yield {
            id: `ollama_${randomUUID().slice(0, 8)}`,
            model: chunk.model ?? params.model,
            delta: {
              content: content || undefined,
              reasoningContent: undefined,
            },
            finishReason: chunk.done ? (chunk.done_reason ?? "stop") : null,
            done: !!chunk.done,
          };
        } else if (chunk.done) {
          yield {
            id: `ollama_${randomUUID().slice(0, 8)}`,
            model: chunk.model ?? params.model,
            delta: {},
            finishReason: chunk.done_reason ?? "stop",
            done: true,
          };
        }
      }
    }
  }
}
