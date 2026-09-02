# Architecture

Greeneek is a thin kernel with a plugin tree, a traced runtime gateway, and a Harness composition model. Every capability is a plugin; the base is pinned to `4e84901e6471b79ec0338099867ebb4606d12bb5`.

## Kernel / Harness

- **Harness** `packages/core/src/harness.ts` — ordered `ProfilePatchRow[]`, `patch()` last-write-wins, `dump()` inspectable via `greeneek --profile web --dump-config`.
- **Boot order** `packages/base/src/bundle.ts:54` `buildBundle` — `loadSettings` + `loadCredentials` → `Harness` → `PluginRegistry(builtins)` → `registerAdapterRows` (now no-op) → `registerTelemetryRows`/`Billing`/`Audit`/`Gateway`/`Marketplace` → `profile`/`core.*` rows → `profile patch` → `home patch` → `CLI overlay` → `ToolRegistry`/`PromptAssembly` → `TelemetrySeam`/`CostLedger`/`AlertEngine` → `UsageMeter`/`AuditStore` → `RateLimitTable`/`RequestSigner` → `Runtime`+`LocalTraceStore` → `llm.active`.

## Plugin tree (Phase 5)

- **Contract** `packages/base/src/plugin.ts:1` `PluginManifest`/`Plugin`/`PluginContext`/`Middleware`/`PluginRegistry` with `register/init/activate/deactivate` + `compareVersions` + `withTimeout 5s` + isolation.
- **Discovery** `plugins/<name>/manifest.json` + `packages/base/src/plugins/*/index.ts` (mirrored at `plugins/` for the file tree), statically listed in `plugins/index.js` / `packages/base/src/plugins/index.ts` (12 built-ins: 5 providers, 1 tool, 1 tracer, 5 modes, 1 template).
- **Lifecycle** `storage→tracer→provider→tool→mode→panel` `plugin.ts:113`, `initAll` checks `settings.plugins[id].enabled` (built-ins enabled by default, `user.*` requires explicit), `disable/enable` at runtime `plugin.ts:140`.

## Runtime gateway (Phase 6)

- **Model** `packages/core/src/trace.ts:3` `Run`/`TraceSpan`/`RunSpec`/`RunEvent`/`Runtime` `trace.ts:70` `execute(spec, fn, signal)` — single way to call a provider, creates `runId/traceId` + `TraceSpan kind:run`, records `usage/cost/ttft/latency`, finalises `ok|error|cancelled`, redacts `sk-or-` via `redactSecrets` `trace.ts:53`, `storePrompts:false` hashes, `otlpEndpoint` POST `gen_ai.*` `trace.ts:201`.
- **Store** `packages/telemetry/src/store.ts:1` `LocalTraceStore` append-only `~/.greeneek/traces/YYYY-MM-DD.runs/spans.jsonl` `store.ts:71`, `Map` indexes `store.ts:8`, `queryRuns(conversationId/modelId/status)` `store.ts:38`, `exportJson` `store.ts:52`, `sweep` retention `retentionDays` + size `maxSizeMB` `store.ts:115`.

## Modes (Phase 7)

- **Contract** `packages/core/src/mode.ts:4` `Mode` `id/label/description/capabilities/defaultParams/buildSystemPrompt/run`, `ModeContext` `messages/tools/secrets/workingDir/signal/chat/callTool/emit/traceStore`, `ModeRunEvent` `assistant.delta/done/step.start/end/tool.request/result/approval.request/plan/note/error`.
- **Built-ins** `MODES:41` `chat`/`plan`/`agent`/`dry-run`/`replay` (plus `headless` via `apps/headless` batch). Each is a `plugins/mode-*/manifest.json` `kinds:["mode"]` and `packages/base/src/plugins/mode-*/index.ts` `registerMode`.
- **AgentLoop** `packages/core/src/agent.ts:71` `run(task, signal)` builds `systemPrompt` via `mode.buildSystemPrompt`, `runtime.execute` for each `llm.stream` `agent.ts:99`, `modeId` path delegates to `MODES.find` `agent.ts:91`, `dry-run` stub `agent.ts:168`, `chat` ignores tools `agent.ts:167`.

## Seams

| Seam | File | What mounts |
| --- | --- | --- |
| `ctx.llm` | `packages/adapters` + `plugins/provider-*` | echo/openai/openrouter/anthropic/ollama via `PluginRegistry.registerProvider` |
| Tool registry | `packages/core/src/tools.ts` + `plugins/tool-basic` | `ToolRegistry` + `ctx.registry.registerTool` |
| System prompt | `packages/core/src/prompt.ts` | `PromptAssembly` + `mode.buildSystemPrompt` |
| Telemetry | `packages/core/src/telemetry.ts` + `packages/telemetry` | `TelemetrySeam` + `Runtime`/`LocalTraceStore`/`ConsoleSink`/`OTelJsonlSink` |
| Session events | `packages/core/src/session.ts` | `SessionLog` JSONL + `AgentLoop` `session/start/turn/*` |
| Audit | `packages/audit` | `AuditStore` hash chain |
| Billing | `packages/billing` | `UsageMeter`/`MeteringSink` |
| Gateway | `packages/gateway` | `RateLimitTable`/`RequestSigner` |
| Marketplace | `packages/marketplace` | `MarketplaceRegistry` → `profile patch` |
| Plugins | `packages/base/src/plugin.ts` | `PluginRegistry` |

## Data flow for one chat message

`packages/web/src/App.tsx:335` `runTask` `POST /api/sessions/:id/run {task,model,provider,mode}` → `packages/server/src/app.ts:82` `streamRun` `AgentLoop` `agent.ts:71` `runtime.execute` `trace.ts:79` `adapter.stream` `adapters/openrouter.ts:182` `fetch https://openrouter.ai/api/v1/chat/completions` `parseSSE` `sse.ts:9` → `RunEvent` → `agent.ts:112` `emit assistant/stream` → `app.ts:454` `send` `event: assistant/stream` → `App.tsx:350` `commit` → render → `LocalTraceStore.appendRun/Span` `store.ts:25`.

## Settings data flow

`packages/base/src/settings.ts:16` `Settings` `validateSettings:202` `loadSettings:290` `loadVersioned` `storage.ts:24` + `settingsFromEnv:108` (single `process.env` reader) → `bundle.ts:60` `loadSettings` → `bundle.settings`/`secrets` → `app.ts:91` `GET /api/settings` `redactSettings` `app.ts:374` → `App.tsx:132` `loadSettings` `settingsLoading` → field-level `PATCH /api/settings` `app.ts:96` `updateSettings` `bundle.ts:203` `patch` → live `bundle.settings/secrets` → next `createAdapter`/`AgentLoop` without restart.

## Baseline dump

`pnpm greeneek --profile web --dump-config > docs/architecture/dump-config.web.json` — any row can be replaced/disabled by a patch without touching source.
