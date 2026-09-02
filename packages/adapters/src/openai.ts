import { randomUUID } from "node:crypto";
import type { Message, ModelAdapter, ToolCall, ToolDefinition, Usage } from "@greeneek/core";

interface OpenAIStreamChunk {
  choices?: Array<{
    delta?: { content?: string; tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }> };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
}

/**
 * OpenAI-compatible adapter.
 *
 * Speaks /chat/completions streaming — which covers OpenAI, any OpenAI-
 * compatible gateway, and Ollama's OpenAI-compatible endpoint. Registering a
 * provider is one config row; nothing outside this seam changes.
 */
export class OpenAICompatibleAdapter implements ModelAdapter {
  readonly provider: string = "openai";
  readonly model: string;
  readonly baseUrl: string;
  private apiKey?: string;
  readonly pricing = { inputPerMToken: 2.5, outputPerMToken: 10 };

  constructor(options: { model?: string; baseUrl?: string; apiKeyEnv?: string; apiKey?: string }) {
    this.model = options.model ?? "gpt-4o-mini";
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    const env = options.apiKeyEnv ?? "OPENAI_API_KEY";
    this.apiKey = options.apiKey ?? process.env[env];
  }

  async *stream(messages: Message[], options: { tools?: ToolDefinition[]; signal?: AbortSignal }): AsyncGenerator<any> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => {
        if (m.role === "tool") return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
        return { role: m.role, content: m.content, tool_calls: m.toolCalls };
      }),
      stream: true,
    };
    if (options.tools?.length) {
      body.tools = options.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey ?? ""}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (!res.ok) throw new Error(`OpenAI-compatible provider error ${res.status}: ${await res.text()}`);

    const toolAcc = new Map<number, { id: string; name: string; arguments: string }>();
    let usage: Usage = { inputTokens: 0, outputTokens: 0 };
    const reader = res.body!.getReader();
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
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        const chunk: OpenAIStreamChunk = JSON.parse(payload);
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
      }
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
