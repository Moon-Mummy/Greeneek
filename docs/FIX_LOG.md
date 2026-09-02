# Fix Log — Phase 0 → 7

| # | Symptom | Root cause | Fix | Guarding test |
| --- | --- | --- | --- | --- |
| 1 | `OPENAI_API_KEY` pasted with `Bearer ` or whitespace fails | No trim/normalisation | `normaliseKey` `settings.ts:169` + `openai.ts:26` `trim`+`Bearer` strip | `providers.test.ts:53` key normalisation |
| 2 | Changing key in Settings requires restart | `Bundle` created `adapter` once at boot via `createAdapter(harness,secrets)` and `llm.active` never updated | Per-request `createLoopAdapter(bundle,opts)` `server/src/app.ts:419` + `bundle.secrets` mutated live `app.ts:96` + `patchSettings` `settings.ts:320` | `providers.test.ts:196` reactive + manual `GET /api/meta` after `PATCH` |
| 3 | Every non-200 shown as “invalid key” | Generic `throw new Error(\`provider error ${status}: ...\`)` `openai.ts:57` | `ProviderError` `errors.ts:17` `mapProviderError:42` 401→`auth` 402→`credits` 429→`rate_limit` 404→`model_not_found` | `providers.test.ts:102` 402/404 not `auth` |
| 4 | SSE parser chokes on `: OPENROUTER PROCESSING` or `[DONE]` | `line.trim().startsWith("data:")` without handling empty/colon | `parseSSE` `sse.ts:9` skips `""` + `":"` + `data:` + `[DONE]` tolerate `JSON.parse` failure | `providers.test.ts:112` keep-alive |
| 5 | `GET /models` used as key test (always 200) | `validateCredentials` called `GET /models` | `validateCredentials` → `GET /auth/key` `openrouter.ts:112` + `openai.ts:31` `GET /models` with key | `providers.test.ts:60` not called with `/models` |
| 6 | `settings` partial save overwrites others | `saveCredential` wrote whole file, no merge | `updateSettings` `settings.ts:320` `deepMerge` atomic, `storage.ts:24` versioned | `settings.test.ts:25` partial no-clobber |
| 7 | Settings race: open before store loaded overwrites with defaults | No hydration guard | `isSettingsHydrated` `settings.ts:352` + UI `settingsLoading` `App.tsx:132` loading state | `settings.test.ts:52` hydrate |
| 8 | Theme in Settings should be gone | `App.tsx` had `theme` state, `PRESETS`, `shareTheme`, header toggle, `theme` tab | Deleted `PRESETS`/`theme`/`accent`/`presetId`/`shareTheme` `App.tsx:42`, header toggle `App.tsx:358`, `theme` tab `App.tsx:513`, fixed OS follow `App.tsx:123` | `grep theme` in Settings 0 + `settings.test.ts:33` migration |
| 9 | Model selection in Settings should be gone | No model dropdown now, but `defaults.modelId` read-only | `App.tsx:908` read-only chip + hint, `validateSettings:225` `modelId` | Manual: Settings has no dropdown |
| 10 | `process.env` scattered (9 files) | `openai.ts:18` `process.env[env]` etc. | Single `settingsFromEnv:108` in `settings.ts` (only reader), `secretsFromSettings:180` | `grep process.env` only `settings.ts` + `shell.ts` |
| 11 | No structured logger, secrets logged | `console.log` everywhere | `Logger` `logger.ts:9` `redactSecrets:71` `sk-or-****`, `systemLogger` `logger.ts:100` | `providers.test.ts:33` redaction |
| 12 | No versioned storage/migration | `credentials.json` flat, no `schemaVersion` | `storage.ts:24` `loadVersioned`/`saveVersioned` `SETTINGS_MIGRATIONS:85` v1→v2 | `settings.test.ts:33` migration |
| 13 | `GET /api/models` without key should be 200 (public) | Not implemented | `GET /api/models` `server/src/app.ts:99` `tryProvider` without key, `listModels` public `openrouter.ts:147` | `providers.test.ts:75` |
| 14 | `HTTP-Referer`/`X-Title` missing | `openai.ts` headers only `authorization` | `OpenRouterAdapter.headers:103` `HTTP-Referer` + `X-Title` `openrouter.ts:103` | `openrouter.test` headers |
| 15 | `provider` row disabled prevents env swap | `createAdapter` used `configsByType` filtered `enabled:false` | `createAdapter` `adapters/src/index.ts:24` uses `harness.dump()` including disabled for `wanted` | `providers.test.ts:196` reactive |
| 16 | `bundle` `llm.active` stale after provider switch | `meta` used `harness.config("llm.active")` | `server/src/app.ts:279` `meta` reactive to `bundle.settings.defaults.provider` + `dump.find` | `GET /api/meta` after `PATCH` |
| 17 | `shell.run` used `process.env` directly | `shell.ts:28` `env: process.env` | `shell.ts:28` `env: {...process.env, ...ctx.secrets}` via `settings` | `shell.test` |
| 18 | `telemetry` `console`/`OTLP` not redacted | `sinks.ts:12` `JSON.stringify(event.data)` | `sinks.ts:12` `replace(/sk-or-...)` + `logger.ts:71` | `trace.test.ts:33` |
| 19 | `billing` `UsageMeter` read `process.env.GREENEK_PLAN` | `meter.ts:29` | `meter.ts:29` `tierId?: string` + `bundle.ts:140` `new UsageMeter(settings.billing.plan)` | `meter.test.ts` |
| 20 | `PORT` read scattered | `server/src/index.ts:21` `process.env.PORT` | `settings.ts:135` `PORT` in `settingsFromEnv` + `server/src/index.ts:25` `bundle.settings.server.port` | `bundle.test` |
