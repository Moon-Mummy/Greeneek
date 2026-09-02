# Provider Support

## Interface
`adapters/pal/types.ts` — `PALModel {vision,reasoning,tools,streaming,isLocal}`, `ProviderConfig {baseURL,apiKeyRequired,supportsVision/Tools/Reasoning}`, `ChatMessage {reasoningContent,images}`, `ChatCompletionChunk`. Normalized stream → `message.delta/reasoning.delta/tool_call.* /usage`.

## Registry (§5.1)
| Provider | Adapter | Discovery | Auth | Capability | Status |
|----------|---------|-----------|------|------------|--------|
| `echo` | `EchoAdapter` | built-in | none | chat | Verified |
| `openai` | `openai-compatible` | `GET /v1/models` | `Bearer` | chat/streaming/tools/vision | Verified |
| `openrouter` | `OpenRouterAdapter` | `GET /models` + `HTTP-Referer/X-Title` + `/auth/key` cache | `sk-or-` | chat/streaming/tools/vision/free | Verified |
| `anthropic` | `AnthropicAdapter` | format check | `x-api-key` | chat/tools | Partial (no live validate) |
| `ollama` | `ollama-native` | `GET /api/tags` | none | chat/vision/reasoning (r1/qwen3) | Verified |
| `deepseek` | `openai-compatible` preset | `GET /v1/models` | `Bearer` BYOK | chat/reasoning | Partial (BYOK only) |
| `generic` | `openai-compatible` | custom `discoveryEndpoint` | custom headers | user-overridable | Verified |
| `lmstudio/vLLM/LocalAI/llama.cpp` | `openai-compatible` preset | same | none | local-first | Partial (reuse preset, needs health) |
| `mistral/groq/xai/cohere/together/fireworks/perplexity/azure/bedrock/gemini` | OAI preset reuse | `GET /v1/models` | `Bearer` | via preset | Missing (doc + preset) |

Generic provider (§5.2): custom `name/baseURL/apiKey/headers/org/project/pathOverrides/discoveryEndpoint/manual models/TLS toggle` + plugin interface `packages/base/src/plugin.ts`.

## Settings (§5.3)
Per provider: `enabled/displayName/apiKeyRef/baseURL/region/org/project/headers/timeout/retry/proxy/allowlist/testConnection/delete`. Keys never fully shown; `Test` returns `ProviderError.kind` (auth/rate/unknown) HTTP 200.

## Model manager (§5.4)
`ModelPickerGrouped` — searchable, favorites (`gk.model.favorites`), recents MRU8, badges `LOCAL/FREE/VISION/REASONING/tools`, `k` ctx, `$ /1M`, `● local/cloud/offline`, `isLocal` flag, per-conversation override + `Switched to…` note.

## Adding a provider
1. Add `registry` entry `DEFAULT_REGISTRY[id]`.
2. Reuse `openai-compatible` or implement `PALProvider` (see `adapters/CONTRIBUTING.md`).
3. Add `validateCredentials` + `listModels` contract tests (§20.2).
