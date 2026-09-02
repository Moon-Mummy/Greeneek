import type {
  ProviderConfig,
  PALModel,
  ChatCompletionParams,
  ChatCompletionChunk,
} from "./types";

// PAL abstract base — every provider must implement this contract (spec §4.2.2)
export abstract class BaseChatProvider {
  abstract readonly config: ProviderConfig;

  /** List available models (discovery). Use "auto" + healthCheck for local. */
  abstract listModels(): Promise<PALModel[]>;

  /**
   * Chat completion. When params.stream===true returns AsyncIterable<Chunk>.
   * When false, returns full string. Implementations must separate reasoningContent.
   */
  abstract chatCompletion(
    params: ChatCompletionParams,
  ): Promise<AsyncIterable<ChatCompletionChunk> | string>;

  /** Lightweight reachability check; sets available flag. */
  abstract healthCheck(): Promise<{ ok: boolean; error?: string; modelsCount?: number }>;

  /** Optional config validation (e.g., baseURL reachable). */
  validateConfig?(): Promise<boolean>;

  /** Helpers shared by all OpenAI-compatible children */
  protected normaliseBaseUrl(raw?: string): string {
    return (raw ?? this.config.baseURL).replace(/\/$/, "");
  }
  protected normaliseKey(raw?: string): string | undefined {
    if (!raw) return undefined;
    let s = raw.trim();
    if (s.toLowerCase().startsWith("bearer ")) s = s.slice(7).trim();
    return s || undefined;
  }
  protected headers(apiKey?: string): Record<string, string> {
    const h: Record<string, string> = { "content-type": "application/json" };
    if (this.config.apiKeyRequired && apiKey) h["authorization"] = `Bearer ${apiKey}`;
    // Never send Bearer undefined for local providers
    if (this.config.headers) Object.assign(h, this.config.headers);
    return h;
  }
}
