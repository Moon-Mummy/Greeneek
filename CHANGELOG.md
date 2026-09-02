# Changelog

## 0.1.0 — Technical Precision System rebrand + full build plan execution

- **Base** pinned to `4e84901e6471b79ec0338099867ebb4606d12bb5` `FORK.md:1`, MIT preserved `LICENSE`/`THIRD_PARTY_NOTICES.md`.
- **Rebrand** 8 ops — `scripts/brand-sweep.sh:7`, `@greeneek` scope, `greeneek` CLI, `~/.greeneek`, `#34d399` accent, `packages/brand` `BRAND_GUIDELINES.md`.
- **Composition** `docs/architecture/composition.md:1` `Harness.patch` `bundle.ts:54`.
- **Phase 1** `packages/base/src/logger.ts:1` `storage.ts:1` `settings.ts:1` `bundle.ts:60` single `process.env` reader, `GET/PATCH /api/settings` `server/src/app.ts:90`.
- **Phase 2** `packages/adapters/src/openrouter.ts:1` `errors.ts:1` `sse.ts:1` `provider.ts:1` `GET /auth/key` + `GET /models` public + `HTTP-Referer`/`X-Title` + `usage:{include:true}` + `ProviderError` `mapProviderError:42`.
- **Phase 3** `App.tsx:123` theme removed, `settings.ts:16` versioned, `App.tsx:132` field-level `PATCH`, `POST /api/settings/test` `server/src/app.ts:111`, `GET /api/settings/export|import|reset|diagnostics` `server/src/app.ts:141`.
- **Phase 4** `GET /api/models` `server/src/app.ts:99`, `App.tsx:591` model/mode chips `Ctrl+M` `/model`, per-conversation `conversationModel` `App.tsx:145`, `server/src/app.ts:82` `POST /api/sessions/:id/run {model,provider,mode}` + `Switched to …` `server/src/app.ts:397`.
- **Phase 5** `packages/base/src/plugin.ts:1` `PluginRegistry` `plugins/provider-*/manifest.json:1` 12 built-ins, `GET /api/plugins` `server/src/app.ts:215`, `POST /api/plugins/:id/enable|disable` `server/src/app.ts:228`, `docs/PLUGINS.md:1`.
- **Phase 6** `packages/core/src/trace.ts:3` `Run/TraceSpan/Runtime` `trace.ts:70` `LocalTraceStore` `telemetry/src/store.ts:9` JSONL `~/.greeneek/traces`, `GET /api/traces` `server/src/app.ts:318`, `App.tsx:599` Traces page + `View trace` `App.tsx:642`.
- **Phase 7** `packages/core/src/mode.ts:4` `MODES` `chat/agent/plan/dry-run/replay`, `plugins/mode-*/manifest.json:1`, `AgentLoop` `modeId` `core/src/agent.ts:90` `dry-run` stub `agent.ts:168`, `apps/headless/src/index.ts:12` `runBatch` `apps/cli/src/index.ts:37` `greeneek run --mode/--input/--out`.
- **CI** `.github/workflows/ci.yml:1` `install→lint→typecheck→test --coverage→build→gitleaks→audit→smoke→brand-sweep`, `vitest.config.ts:8` `coverage` 70%/85%.
- **Docs** `docs/ARCHITECTURE.md:1`, `TRACING.md:1`, `MODES.md:1`, `SETTINGS.md:1`, `PLUGINS.md:1`, `TESTING.md:1`, `FIX_LOG.md:1`, `ACCEPTANCE.md:1`.

## 0.0.0 — Fork

- Initial fork from `deepseek-ai/deepseek-harness` `dsh 0.1.2-alpha.4`.
