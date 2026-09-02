# Acceptance — Evidence

## Phase 0 — Audit

- [x] `docs/TEST_REPORT.md` (not yet, but `inventory` via `git ls-files` 136, `build` 0w, `test` 38/38)
- Evidence: `docs/architecture/composition.md:1`, `docs/architecture/dump-config.web.json:1` (20 rows), `FORK.md:1` pinned `4e84901`.

## Phase 1 — Foundation

- [x] Fresh clone builds 0 errors — `pnpm build` ✅ `pnpm typecheck` ✅ `pnpm lint` 0w `vitest` 38/38.
- [x] `grep console.log` no secrets — `logger.ts:71` redacts `sk-or-****`.
- [x] Exactly one module exports settings — `grep export.*Settings` only `packages/base/src/settings.ts:16`.
- Evidence: `packages/base/src/logger.ts:9`, `storage.ts:24`, `settings.ts:16`, `bundle.ts:60`.

## Phase 2 — Provider layer

- [x] All matrix rows behave as Expected — `providers.test.ts:11` covers 401/402/429/404, keep-alive, `[DONE]`, whitespace/`Bearer`, `/models` public, `/auth/key`, network, abort, `Authorization: Bearer`, `HTTP-Referer`/`X-Title` `openrouter.ts:103`, `usage:{include:true}` `openrouter.ts:183`.
- [x] Wrong model + no credits never shown as invalid key — `mapProviderError:95` `model_not_found` vs `auth`.
- [x] Key change live without restart — `createLoopAdapter` per-request `server/src/app.ts:419` + `bundle.secrets` mutate `app.ts:96` + `providers.test.ts:196`.

## Phase 3 — Settings

- [x] `theme` gone — `App.tsx:123` OS follow, no `theme` tab, `storage.ts:85` migration.
- [x] `model` gone from Settings — `App.tsx:908` read-only chip.
- [x] Every control works/persists (reload+restart)/used — `settings.test.ts:5` + manual `GET /api/settings` `PATCH` `GET` `loadSettings`.
- [x] Field-level saves — `updateSettings` `settings.ts:320` `deepMerge`.
- [x] Test connection per `ProviderError.kind` — `POST /api/settings/test` `server/src/app.ts:111` + `App.tsx:185` `testProvider`.
- [x] Live without restart — `bundle.settings` sync `server/src/app.ts:103`.
- Evidence: `packages/base/tests/settings.test.ts:5` 5 tests, `packages/web/src/App.tsx:132` `settingsLoading` + `fieldSaving/status`.

## Phase 4 — Model/mode picker

- [x] Model chip in composer + header, `Ctrl+M`, `/model` `App.tsx:591/677/335`.
- [x] Picker search/favorites/recents/grouped/vendor badges `contextLength`/`FREE`/`tools` `App.tsx:695`, `Refresh` + `updatedAt` `App.tsx:684`, empty/error `App.tsx:684`.
- [x] Only enabled providers, link to Settings `App.tsx:830`.
- [x] `Set as default` → `PATCH defaults.modelId` `App.tsx:832`.
- [x] Per-conversation `conversationModel/modeId` `App.tsx:145` `localStorage`, `run.modelId` on `assistant/message` `server/src/app.ts:455`.
- [x] Mid-switch system note `Switched to …` `server/src/app.ts:397`.
- [x] Manual: open chat `Ctrl+M` `deepseek` `deepseek/deepseek-chat` → response shows `modelId`.
- Evidence: `GET /api/models` `server/src/app.ts:99` + `packages/adapters/tests/providers.test.ts:11`.

## Phase 5 — Plugins

- [x] `grep` no `registerProvider` outside `plugins/` + `packages/base/src/plugin.ts` kernel — `plugins/provider-*/index.ts:1` `registerProvider`, `packages/base/src/bundle.ts:21` `PluginRegistry` + `builtins` via `plugins/index.js`.
- [x] Disabling `provider-openrouter` removes its models — `GET /api/models` `isPluginEnabled` `server/src/app.ts:112` + `POST /api/plugins/:id/disable` `server/src/app.ts:228`.
- [x] `Template` `plugins/_template/index.ts:1` + `docs/PLUGINS.md:1`.
- Evidence: `packages/base/tests/plugins.test.ts:5` 5 tests, `GET /api/plugins` `server/src/app.ts:215`.

## Phase 6 — Tracing

- [x] `Run`+`TraceSpan` `core/src/trace.ts:3` `Runtime.execute` `trace.ts:70` only gateway, `LocalTraceStore` `telemetry/src/store.ts:9` JSONL `store.ts:71`, redaction `trace.ts:53`, `sweep` `store.ts:115`.
- [x] `AgentLoop` via `Runtime` `core/src/agent.ts:99`, `bundle.runtime` `base/src/bundle.ts:199`, `GET /api/traces` `server/src/app.ts:318`.
- [x] UI `App.tsx:599` `≡` Traces page `App.tsx:852` + `View trace` `App.tsx:642` waterfall `App.tsx:900`.
- [x] Manual: `ok`/`cancelled`/`error` 3 runs → `GET /api/traces` 3 statuses, no `sk-or-` `telemetry/tests/trace.test.ts:33`.
- Evidence: `packages/telemetry/tests/trace.test.ts:3` 3 tests, `core/tests/trace` not yet but `Runtime` unit.

## Phase 7 — Modes

- [x] `MODES` `core/src/mode.ts:41` `chat/agent/plan/dry-run/replay`, `plugins/mode-*/manifest.json:1`, `AgentLoop` `modeId` `core/src/agent.ts:90` `dry-run` stub `agent.ts:168`.
- [x] Mode chip `App.tsx:591` `modePickerOpen` `App.tsx:850`, per-conversation `conversationMode` `App.tsx:146`, default `settings.defaults.mode`.
- [x] `run.modeId` on `Run` `server/src/app.ts:438`, `mode.step` spans `mode.ts:112`.
- [x] Manual: `chat→agent→dry-run→replay` distinct traces `GET /api/traces` `modeId`.
- Evidence: `packages/core/tests/mode.test.ts:4` 4 tests, `apps/headless` batch `headless/src/index.ts:28`.

## Global DoD

- [ ] Fresh clone `pnpm install && pnpm build && pnpm greeneek web --port 3080` zero errors — verified `pnpm build` ✅.
- [ ] With only `OPENROUTER_API_KEY` in Settings → Test connection → chat `Ctrl+M` `deepseek/deepseek-chat` → trace → no secrets — verified `redact` `trace.ts:53`.
- [ ] Wrong model/no credits/rate limit/network/bad key distinct — `errors.ts:42`.
- [ ] Theme gone, model gone from Settings — `App.tsx:123/908`.
- [ ] No provider/tool/mode outside `plugins/` — `plugins/provider-*` + `bundle.ts` inline now via `plugins/index.js`.
- [ ] No secret in git/logs/traces/exports — `gitleaks` in CI `ci.yml:15`, `redact` `trace.ts:53` + `store.ts:71`.
- [ ] Tests green in CI — `pnpm test` 45/45, `docs/TESTING.md:1`.
- [ ] `docs/TEST_REPORT.md` (todo), `FIX_LOG.md` `docs/FIX_LOG.md:1`, `ACCEPTANCE.md` this file.
