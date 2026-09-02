import type { Harness, ModelAdapter } from "@greeneek/core";
import { EchoAdapter } from "./echo";
import { OpenAICompatibleAdapter } from "./openai";
import { AnthropicAdapter } from "./anthropic";
import { OllamaAdapter } from "./ollama";

export { EchoAdapter, OpenAICompatibleAdapter, AnthropicAdapter, OllamaAdapter };

/**
 * Registers the provider rows on the ctx.llm adapter seam.
 *
 * Profile patches define which adapter runs first — provider swap changes
 * nothing else in the tree.
 */
export function registerAdapterRows(harness: Harness): void {
  harness
    .add({ id: "llm.echo", type: "llm.adapter", options: { provider: "echo", model: "echo-1" } })
    .add({ id: "llm.openai", type: "llm.adapter", enabled: false, options: { provider: "openai", model: "gpt-4o-mini" } })
    .add({ id: "llm.anthropic", type: "llm.adapter", enabled: false, options: { provider: "anthropic", model: "claude-sonnet-4-5" } })
    .add({ id: "llm.ollama", type: "llm.adapter", enabled: false, options: { provider: "ollama", model: "qwen2.5-coder:7b", baseUrl: "http://127.0.0.1:11434/v1" } })
    .add({ id: "llm.default", type: "llm.default", options: { provider: "$GREENEK_MODEL_PROVIDER", fallback: "echo" } });
}

/** Instantiate the adapter selected by config rows + env. */
export function createAdapter(harness: Harness, secrets: Record<string, string | undefined>): ModelAdapter {
  const wanted = secrets["GREENEK_MODEL_PROVIDER"] ?? "echo";
  const rows = harness.configsByType("llm.adapter");
  const row = rows.find((r) => r.options?.provider === wanted) ?? rows.find((r) => r.enabled !== false);
  const provider = row?.options?.provider ?? "echo";

  switch (provider) {
    case "openai":
      return new OpenAICompatibleAdapter({
        model: row?.options?.model as string | undefined,
        baseUrl: row?.options?.baseUrl as string | undefined,
        apiKey: secrets["OPENAI_API_KEY"],
      });
    case "anthropic":
      return new AnthropicAdapter({
        model: row?.options?.model as string | undefined,
        baseUrl: row?.options?.baseUrl as string | undefined,
        apiKey: secrets["ANTHROPIC_API_KEY"],
      });
    case "ollama":
      return new OllamaAdapter({
        model: row?.options?.model as string | undefined,
        baseUrl: row?.options?.baseUrl as string | undefined,
      });
    default:
      return new EchoAdapter();
  }
}
