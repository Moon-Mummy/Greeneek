import { randomUUID } from "node:crypto";
import type { Message, ModelAdapter, ToolCall, ToolDefinition, Usage } from "@greeneek/core";

/**
 * Echo provider — the deterministic, offline, zero-cost adapter.
 *
 * It gives the harness a real model seam without a network dependency:
 * streaming, tool calling, and usage accounting all work, which is what the
 * contract tests and the live Web UI demo run against.
 *
 * Tool trigger: `@execute <toolName> <json args>` in the user message.
 */
export class EchoAdapter implements ModelAdapter {
  readonly provider = "echo";
  readonly model = "echo-1";
  readonly pricing = { inputPerMToken: 0, outputPerMToken: 0 };

  async *stream(messages: Message[], _options: { tools?: ToolDefinition[] }): AsyncGenerator<any> {
    const last = messages[messages.length - 1];
    const text = last?.content ?? "";
    const call = this.parseToolCall(text);
    const prose = call
      ? `Running \`${call.name}\` via the Echo adapter.`
      : `Echo response — you asked: "${text.slice(0, 160)}".\n\nSet \`GREENEK_MODEL_PROVIDER\` to openai, anthropic, or ollama (or add provider keys in Settings) to route this through a real model.`;
    for (const word of prose.split(/(\s+)/)) {
      await new Promise((r) => setTimeout(r, 6));
      yield { type: "text", delta: word };
    }

    // After a tool result, summarize and stop — no re-triggering the call.
    if (last?.role === "tool") {
      const summary = `\n\n\`${last.name}\` returned:\n\`\`\`\n${String(last.content).slice(0, 800)}\n\`\`\``;
      for (const word of summary.split(/(\s+)/)) {
        await new Promise((r) => setTimeout(r, 4));
        yield { type: "text", delta: word };
      }
      const done: Usage = {
        inputTokens: Math.ceil(text.length / 4),
        outputTokens: Math.ceil((prose.length + summary.length) / 4),
      };
      yield { type: "usage", usage: done };
      return;
    }

    if (call) yield { type: "toolCalls", calls: [call] };

    const usage: Usage = {
      inputTokens: Math.ceil(text.length / 4),
      outputTokens: Math.ceil(prose.length / 4),
    };
    yield { type: "usage", usage };
  }

  private parseToolCall(text: string): ToolCall | null {
    const match = text.match(/@execute\s+([\w.]+)\s*([\s\S]*)/);
    if (!match) return null;
    const name = match[1];
    const raw = match[2].trim();
    let args: Record<string, unknown> = {};
    if (raw) {
      try {
        args = JSON.parse(raw);
      } catch {
        args = { query: raw };
      }
    }
    return { id: `call_${randomUUID().slice(0, 8)}`, name, arguments: args };
  }
}
