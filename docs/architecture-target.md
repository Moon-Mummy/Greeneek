# Architecture — Target

> Adapts §4 target to the existing stack — no framework swap without documented reason (spec §3.1). Web stays Vite+React, core stays Node/TS; new modules mount **beside** the loop via registry, never inside.

## Shell
```
Application Shell
├── UI + routing (web SPA + CLI/headless/ACP profiles)
├── Workspace manager (open/recent/trust, .gitignore + greeneek-ignore)
├── Conversation manager (threads, search, pin/archive, branching, virtualized)
├── Agent runtime (core/AgentLoop 10-step, limits, cancellation)
├── Provider registry (PAL DEFAULT_REGISTRY, capability flags)
├── Model registry (search, fav/recents, badges, health, pricing with source+date)
├── Tool registry (typed, risk-classified) + MCP manager (stdio/SSE, per-tool perms)
├── Context engine (system + workspace + files + map + diagnostics, budgeting, truncation warnings)
├── File + Terminal + Git services (patch→review→checkpoint→rollback)
├── Permission engine (ask/allow-once/run/workspace/deny + 11 categories, risk prompt)
├── Secret vault (Keychain → encrypted vault, env refs, export excludes secrets)
├── Persistence (settings.json vN, Dexie vN, traces JSONL, migrations + backup/rollback)
├── Usage/cost (per response/conversation/workspace/provider, budget hard-stop)
├── Import/export (versioned schemas, encrypted backup, MCP/DeepSeek adapters)
└── Diagnostics/logging (redacted, categories, retry with backoff, OTLP export)
```

## Provider abstraction (§4.2)
Single interface `PALProvider` (already `adapters/pal/types.ts:47` `PALModel {vision,reasoning,tools,streaming,isLocal}`, `ChatMessage {reasoningContent,images}`, `ChatCompletionChunk {reasoningContent}`) — all web UI goes through it, never SDK directly. Internal event stream normalized:
```
message.started → message.delta → reasoning.delta → tool_call.started
→ tool_call.arguments.delta → tool_call.completed → tool_result
→ usage.updated → message.completed / failed
```
Provider-specific → `capabilities` flags; UI disables/explains unavailable controls.

## Capability registry (§4.3)
Every `PALModel` exposes `chat/streaming/tool_call/vision/reasoning/embedding/code` + `contextLength/maxTokens/temperature/systemPrompt`. UI reads flags; no `if (provider===deepseek)`.

## Local-first (§6)
- Onboarding: detect `127.0.0.1:11434` (Ollama), `1234` (LM Studio), `8000` (vLLM) → health + `listModels`; manual endpoint, install guidance, offline mode (blocks `fetch` to remote providers, banner).
- Persistence: versioned DB + migrations, never destroy on upgrade.

## Delta from current
Already near-target: PAL spine, SecureStore, traces, reasoning+vision. Missing to reach target: MCP client/manager, Workspace manager (trust, ignore, layout persist), Context engine (token budget, map, instructions `AGENTS.md`), Permission engine (full 6×11 matrix), virtualization, workspace git/patch review UI, import/export versioned, command palette.

## Non-goals
No mandatory account/cloud, no analytics by default, no silent large-model download, no framework churn (Next/Nuxt, Tauri/Electron not introduced without reason).
