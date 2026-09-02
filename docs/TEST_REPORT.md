# Test Report — Phase 0 + 7

## Inventory

- **Languages**: TypeScript 5.7.2, Node 20+, pnpm 9.15.4, Vite 6.4.3, React 18, Python 3.11 (SDK).
- **File tree** `git ls-files | wc -l` 136 + `plugins/` 12 + `docs/` 8, `packages/*` 13, `apps/*` 3.
- **Build** `pnpm build` ✅ `tsc -b` + `vite build` 29 modules, `pnpm typecheck` ✅ `pnpm lint` 0w.
- **Tests** `pnpm test` 45/45 `packages/base/tests/settings.test.ts:5` + `plugins.test.ts:5` + `adapters/tests/providers.test.ts:11` + `telemetry/tests/trace.test.ts:3` + `core/tests/mode.test.ts:4` + `core/tests/agent.test.ts:3` + `gateway:3` + `audit:1` + `harness:3` + `billing:2` + `marketplace:2` + `calc:1` + `headless:2`.

## Data flow

- **One chat message** `web/src/App.tsx:335` `runTask` `POST /api/sessions/:id/run {task,model,provider,mode}` → `server/src/app.ts:82` `streamRun` `AgentLoop` `core/src/agent.ts:71` `runtime.execute` `core/src/trace.ts:79` `adapter.stream` `adapters/openrouter.ts:182` `fetch https://openrouter.ai/api/v1/chat/completions` `parseSSE` `adapters/src/sse.ts:9` → `RunEvent` → `agent.ts:112` `emit assistant/stream` → `app.ts:454` `send` `event: assistant/stream` → `App.tsx:350` `commit` → render → `LocalTraceStore.appendRun/Span` `telemetry/src/store.ts:25`.
- **Settings** `base/src/settings.ts:16` `Settings` `validateSettings:202` `loadSettings:290` `loadVersioned` `storage.ts:24` + `settingsFromEnv:108` → `bundle.ts:60` `loadSettings` → `bundle.settings/secrets` → `server/src/app.ts:91` `GET /api/settings` `redactSettings` `app.ts:374` → `web/src/App.tsx:132` `loadSettings` `settingsLoading` → `PATCH /api/settings` `server/src/app.ts:96` `updateSettings` `bundle.ts:203` `patch` → live `bundle.settings/secrets` → next `createAdapter`.

## Settings — every control

| Control | Expected | Observed | Persists reload | Persists restart | Used at request | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `providers.openai.apiKey` | masked, Reveal/Clear, Test → 401/402/429 distinct | ✅ `App.tsx:815` `testProvider` `POST /api/settings/test` `ProviderError.kind` | ✅ `loadSettings` `config.json` | ✅ `~/.greeneek/config.json` | ✅ `bundle.secrets` `createLoopAdapter` per-request `server/src/app.ts:419` | `normaliseKey` `settings.ts:169` |
| `providers.openrouter.apiKey` | `sk-or-` warn, not `Bearer` | ✅ `openrouter.ts:92` `sk-or-` warn | ✅ | ✅ | ✅ `OPENROUTER_API_KEY` → `OpenRouterAdapter` | `GET /models` public `openrouter.ts:147` |
| `defaults.temperature` | 0–2, Save ✓ | ✅ `App.tsx:904` `patchSettings` | ✅ | ✅ | ✅ `AgentLoop` `mode.defaultParams` `agent.ts:76` | `validateSettings:225` |
| `tracing.enabled` | toggle, `storePrompts` hash | ✅ `App.tsx:658` | ✅ | ✅ | ✅ `Runtime` `trace.ts:84` `storePrompts` | `trace.ts:185` |

## OpenRouter matrix (Phase 0.4)

| # | Case | Expected | Observed |
| --- | --- | --- | --- |
| 1 | valid key, valid model, non-stream | 200 + content | ✅ `OpenRouterAdapter` `provider.test.ts:102` |
| 2 | stream:true | SSE chunks `[DONE]` | ✅ `parseSSE` `sse.ts:9` + `provider.test.ts:112` |
| 4 | invalid key `sk-or-v1-000` | 401 `auth` | ✅ `mapProviderError:59` `auth` `provider.test.ts:102` |
| 5 | wrong model `gpt-4o` | 400/404 `model_not_found` not `auth` | ✅ `mapProviderError:95` `provider.test.ts:102` |
| 6 | zero credits 402 | `credits` not `auth` | ✅ `mapProviderError:69` `provider.test.ts:102` |
| 7 | whitespace/`Bearer ` | trim, succeed | ✅ `normaliseKey` `settings.ts:169` + `providers.test.ts:53` |
| 9 | `GET /models` without key | 200 public, not key test | ✅ `GET /api/models` `server/src/app.ts:99` `openrouter.ts:147` |
| 10 | `GET /auth/key` valid/invalid | 200/401 | ✅ `validateCredentials` `openrouter.ts:112` `provider.test.ts:60` |
| 11 | offline | `network` not `auth` | ✅ `mapNetworkError:113` `provider.test.ts:149` |

## Chat

- `Send` → `assistant/stream` → `assistant/message` `usage` + `modelId` `server/src/app.ts:455`, `tool/start`/`tool/end` `agent.ts:128`, `turn/end` `agent.ts:120`, `session/end` `agent.ts:125`.
- `Ctrl+M` `/model deepseek` → `openai/gpt-4o-mini` → response shows `modelId` `App.tsx:642`.
- `mode` `chat→agent→dry-run→replay` distinct `GET /api/traces` `modeId` `mode.test.ts:4`.

## Persistence

- `~/.greeneek/sessions/*.jsonl` `core/src/session.ts:1`, `~/.greeneek/traces/YYYY-MM-DD.runs/spans.jsonl` `telemetry/src/store.ts:71`, `~/.greeneek/config.json` `schemaVersion:2` `storage.ts:24`, `migrate` `storage.ts:85`.

## Security

- `git log -p | grep sk-or-` 0, `gitleaks` in `ci.yml:15`, `redactSecrets` `logger.ts:71` + `trace.ts:53`, `export` redacted `server/src/app.ts:141`.

## Prioritized bugs (fixed, see `docs/FIX_LOG.md:1`)

- P0: `process.env` scattered → single `settingsFromEnv` `settings.ts:108`.
- P0: `401`/`402`/`404` conflated → `ProviderError` `errors.ts:42`.
- P1: `theme` in Settings → removed `App.tsx:123` + migration `storage.ts:85`.
- P1: `model` in Settings → read-only `App.tsx:908`.
- P1: `SSE` keep-alive → `parseSSE` `sse.ts:9`.
