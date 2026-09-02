import { DEFAULT_REGISTRY, mergeRegistry } from "./registry";
import { OpenAICompatiblePAL } from "./openai-compatible";
import { OllamaNativePAL } from "./ollama-native";
import type { ProviderConfig, PALModel } from "./types";
import type { BaseChatProvider } from "./base";

// Factory — creates a PAL provider instance from registry id + apiKey.
// Adding a new provider is O(1): add entry to DEFAULT_REGISTRY, no scattered ifs elsewhere.
export function createPALProvider(
  providerId: string,
  opts: { apiKey?: string; registryOverrides?: Record<string, Partial<ProviderConfig>> } = {},
): BaseChatProvider {
  const registry = mergeRegistry(DEFAULT_REGISTRY, opts.registryOverrides);
  const cfg = registry[providerId];
  if (!cfg) throw new Error(`Unknown provider: ${providerId}`);
  switch (cfg.type) {
    case "ollama":
      return new OllamaNativePAL(cfg);
    case "openai":
    case "openai-compatible":
    case "deepseek":
    case "openrouter":
    case "custom":
      return new OpenAICompatiblePAL(cfg, { apiKey: opts.apiKey });
    case "anthropic": {
      // Reuse existing AnthropicAdapter seam until native PAL lands; wrap via OpenAICompat for now if needed
      // For Phase A, route anthropic via OpenAICompat with x-api-key header override via config.headers
      const anthCfg: ProviderConfig = { ...cfg, headers: { "x-api-key": opts.apiKey ?? "", "anthropic-version": "2023-06-01" } };
      return new OpenAICompatiblePAL(anthCfg, { apiKey: opts.apiKey });
    }
    case "google":
    case "azure":
      return new OpenAICompatiblePAL(cfg, { apiKey: opts.apiKey });
    default:
      return new OpenAICompatiblePAL(cfg, { apiKey: opts.apiKey });
  }
}

export async function listModelsPAL(
  providerId: string,
  opts: { apiKey?: string; registryOverrides?: Record<string, Partial<ProviderConfig>> } = {},
): Promise<PALModel[]> {
  const provider = createPALProvider(providerId, opts);
  return provider.listModels();
}

export async function healthCheckPAL(
  providerId: string,
  opts: { apiKey?: string; registryOverrides?: Record<string, Partial<ProviderConfig>> } = {},
): Promise<{ ok: boolean; error?: string; modelsCount?: number }> {
  const provider = createPALProvider(providerId, opts);
  return provider.healthCheck();
}
