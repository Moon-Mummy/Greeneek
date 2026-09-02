import type { Harness, ModelAdapter } from "@greeneek/core";
import { EchoAdapter } from "./echo";
import { OpenAICompatibleAdapter } from "./openai";
import { AnthropicAdapter } from "./anthropic";
import { OllamaAdapter } from "./ollama";
import { OpenRouterAdapter } from "./openrouter";

export { EchoAdapter, OpenAICompatibleAdapter, AnthropicAdapter, OllamaAdapter, OpenRouterAdapter };
export { ProviderError, mapProviderError, mapNetworkError } from "./errors";
export type { ModelInfo, Provider } from "./provider";

/**
 * @deprecated — provider rows are now registered via plugins/provider-*
 * Kept as no-op for backward compat; the plugin kernel (packages/base/src/plugin.ts)
 * is the single way to add a provider. See plugins/provider-openrouter/index.ts.
 */
export function registerAdapterRows(_harness: Harness): void {
  // No-op: providers are registered via the plugin registry (plugins/provider-*)
  // This shim remains so old code that calls registerAdapterRows does not break,
  // but it does not add rows — the plugin init does.
}

/** Instantiate the adapter selected by config rows + env — per-request, not frozen at startup. */
export function createAdapter(harness: Harness, secrets: Record<string, string | undefined>): ModelAdapter {
  const wanted = (secrets["GREENEK_MODEL_PROVIDER"] ?? "echo").trim();
  // Include disabled rows when matching wanted provider so env-driven swap works without a patch.
  const allRows = harness.dump().filter((r) => r.type === "llm.adapter");
  const enabledRows = allRows.filter((r) => r.enabled !== false);
  const row = allRows.find((r) => r.options?.provider === wanted) ?? enabledRows[0];
  const provider = row?.options?.provider ?? "echo";

  switch (provider) {
    case "openai":
      return new OpenAICompatibleAdapter({
        model: row?.options?.model as string | undefined,
        baseUrl: row?.options?.baseUrl as string | undefined,
        apiKey: secrets["OPENAI_API_KEY"],
      });
    case "openrouter":
      return new OpenRouterAdapter({
        model: row?.options?.model as string | undefined,
        baseUrl: row?.options?.baseUrl as string | undefined,
        apiKey: secrets["OPENROUTER_API_KEY"] ?? secrets["OPENAI_API_KEY"],
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
