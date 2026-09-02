import { randomUUID } from "node:crypto";
import type { Message, ModelAdapter, ToolCall, ToolDefinition, Usage } from "@greeneek/core";
import { mapNetworkError, mapProviderError } from "./errors";

/**
 * Anthropic adapter — /v1/messages SSE streaming with tool_use blocks.
 */
export class AnthropicAdapter implements ModelAdapter {
  readonly provider = "anthropic";
  readonly model: string;
  readonly baseUrl: string;
  private apiKey?: string;
  readonly pricing = { inputPerMToken: 3, outputPerMToken: 15 };

  constructor(options: { model?: string; baseUrl?: string; apiKey?: string }) {
    this.model = options.model ?? "claude-sonnet-4-5";
    this.baseUrl = (options.baseUrl ?? "https://api.anthropic.com/v1").replace(/\/$/, "");
    this.apiKey = options.apiKey?.trim().replace(/^Bearer\s+/i, "");
  }

  async *stream(messages: Message[], options: { tools?: ToolDefinition[]; signal?: AbortSignal }): AsyncGenerator<any> {
    const system = messages.filter((m) => m.role === "system");
    const rest = messages.filter((m) => m.role !== "system").map((m) => {
      if (m.role === "tool") return { role: "user" as const, content: [{ type: "tool_result" as const, tool_use_id: m.toolCallId, content: m.content }] };
      if (m.toolCalls?.length) {
        return {
          role: "assistant",
          content: [
            ...(m.content ? [{ type: "text" as const, text: m.content }] : []),
            ...m.toolCalls.map((tc) => ({ type: "tool_use" as const, id: tc.id, name: tc.name, input: tc.arguments })),
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: 4096,
      messages: rest,
      stream: true,
    };
    if (system.length) body.system = system.map((s) => s.content).join("\n\n");
    if (options.tools?.length) {
      body.tools = options.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": this.apiKey ?? "",
        },
        body: JSON.stringify(body),
        signal: options.signal,
      });
    } catch (e) {
      throw mapNetworkError(e, "anthropic");
    }
    if (!res.ok) {
      const text = await res.text();
      throw mapProviderError(res.status, text, "anthropic");
    }

    const toolAcc = new Map<string, { id: string; name: string; arguments: string }>();
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
        const payload = JSON.parse(trimmed.slice(5).trim());
        if (payload.type === "content_block_delta" && payload.delta?.type === "text_delta") {
          yield { type: "text", delta: payload.delta.text };
        } else if (payload.type === "content_block_start" && payload.content_block?.type === "tool_use") {
          toolAcc.set(payload.index, { id: payload.content_block.id, name: payload.content_block.name, arguments: "" });
        } else if (payload.type === "content_block_delta" && payload.delta?.type === "input_json_delta") {
          const acc = toolAcc.get(payload.index);
          if (acc) acc.arguments += payload.delta.partial_json;
        } else if (payload.type === "message_delta" && payload.usage) {
          usage = { inputTokens: 0, outputTokens: payload.usage.output_tokens ?? 0 };
        } else if (payload.type === "message_start" && payload.message?.usage) {
          usage = { inputTokens: payload.message.usage.input_tokens ?? 0, outputTokens: usage.outputTokens };
        }
      }
    }

    if (toolAcc.size) {
      const calls: ToolCall[] = [...toolAcc.values()].map((v) => ({
        id: v.id || `call_${randomUUID().slice(0, 8)}`,
        name: v.name,
        arguments: (() => {
          try {
            return JSON.parse(v.arguments || "{}");
          } catch {
            return { raw: v.arguments };
          }
        })(),
      }));
      yield { type: "toolCalls", calls };
    }
    yield { type: "usage", usage };
  }
}
