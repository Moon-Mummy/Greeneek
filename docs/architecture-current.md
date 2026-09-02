# Architecture — Current (Phase 0 audit, 2026-09-03)

> Inspected live at `/mnt/sdb1/Projects/Greeneek` — not inferred. Build: `pnpm build` 65 modules, `typecheck` pass, `lint` 1 unicorn warning, `45/45 tests`.

## Stack
- **Runtime:** Node 20, pnpm 9.15.4 workspaces (`packages/*`, `apps/*`), `commonjs`, `tsx` CLI.
- **TS:** project refs `tsconfig.build.json` → `brand,core,adapters,tools,telemetry,audit,billing,gateway,marketplace,base,server,headless,acp,cli`; web has own `tsconfig.json` (`vite`).
- **Web:** Vite 6.4.3 + `@vitejs/plugin-react` 4.3, React 18.3, `zustand 4.5.5` (`chat/settings/provider` stores), `dexie 4.0.11` (`greeneek.threads`), `tesseract.js 5` dynamic OCR.
- **Core deps:** `@greeneek/*` workspace, `oxlint`, `vitest 2.1.9`, `vite-node`, `zod` via settings.

## Composition (profile bundles)
`profile bundles → profile patch → home patch → CLI overlay` — `packages/base/src/bundle.ts` + `FORK.md` pinned `4e84901`. `greeneek --profile web --dump-config` inspects. 4 profiles: `web, headless, sdk, acp`.

## Modules
| Module | Path | Role |
|--------|------|------|
| `base` | `packages/base` | **Single source** `settings.ts` v3 (`schemaVersion`, `settings.json` versioned, `validateSettings`/`storage.ts` migrations), `SecureStore` (`adapters/secure-storage.ts` → `secretStore.ts`), `plugin.ts` (12 built-ins), `bundle/paths/config`. |
| `core` | `packages/core` | `AgentLoop` (provider-neutral, `mode` aware `mode.ts:41` chat/agent/plan/dry-run/replay, `ToolRegistry`, `PromptAssembly`, `Runtime` trace seam, `Message {reasoningContent,images}`, `StreamEvent {text,reasoning}`, `SessionEvent {assistant/stream,reasoning,message}`). |
| `adapters` | `packages/adapters` | PAL: `registry.ts` `DEFAULT_REGISTRY` (ollama,lmstudio,openai,anthropic,openrouter,deepseek,generic), `openai-compatible.ts` (stream SSE→reasoning split), `ollama-native.ts`, `factory.ts` `createPALProvider`, `secure-storage.ts`. Legacy: `OpenRouter/OpenAI/Anthropic/Ollama/Echo` adapters. |
| `tools` | `packages/tools` | `fs.ts (read/write/patch with traversal guard)`, `shell.ts`, `calc.ts`, `web.ts`, `index.ts` registry. |
| `telemetry` | `packages/telemetry` | `LocalTraceStore` JSONL `~/.greeneek/traces` (`store.ts:9` retention, `runtime.ts`). |
| `server` | `packages/server` | `app.ts` SSE `POST /api/sessions/:id/run` (`task+images`), `GET /api/models?refresh`, `PATCH /api/settings`, `GET /api/plugins`, `GET /api/traces`. |
| `web` | `packages/web` | React SPA (`App.tsx` ~1350 LOC): composer (`VisionDropzone`, `ReasoningLog`, model/mode chips `Ctrl+M`, `Shift+Enter`), `components/{api-keys-settings,model-selector,reasoning-log,vision-dropzone,hardening}`, `stores/*`, `lib/vision-ocr.ts`. |
| `gateway/billing/audit/marketplace` | `packages/*` | Rate limits, meter, audit JSONL, plugin registry `seedDemoRegistry`. |

## State & Persistence
- **Settings:** `settings.json` v3 (`providers.deepseek` BYOK, `appearance/behavior` {showReasoning}), migrations `v2→v3` in `storage.ts`, `PATCH /api/settings` field-level, masked `****` + `hasKey`, `Reveal/Clear/Test`. Secrets via `secretsFromSettings` + `secretStore` (Keychain fallback → encrypted vault).
- **Chat:** `zustand` `chat.store` (`threads/activeThreadId`, `messages {reasoningContent}`), `Dexie` `greeneek.threads`, `settings.store` (`behavior.showReasoning`), `provider.store` (`registry` + `refreshModels()`).
- **Traces:** `core/trace.ts` `Runtime` → `telemetry/store.ts` JSONL, `GET /api/traces` + waterfall UI.

## Existing API/Provider Support
- **Built-in:** `echo` (offline), `openai`, `openrouter` (`sk-or-` + `HTTP-Referer/X-Title` + `/auth/key` + cache), `anthropic` (format check), `ollama` (native `/api/tags`), `deepseek` (BYOK), generic `openai-compatible` (custom baseURL/headers).
- **Local-first:** Ollama/LM Studio/vLLM/LocalAI auto-detect `127.0.0.1`, `GET /api/models` without key, offline degrade (cached list + `Failed to refresh — showing cached list`).

## Tests/Build Gaps (honest)
- **Pass:** `build` 65 modules, `typecheck`, `45/45 tests` (harness+agent+marketplace+headless smoke).
- **Warn:** `oxlint` unicorn no-useless-fallback, `pnpm audit` 5 vulns (vitest<3.2.6 `GHSA-5xrq…`, vite≤6.4.2 `GHSA-fx2h…` via `vitest→vite 5.4.21`).
- **Gaps:** No Playwright E2E (15 workflows in spec §20.4 not automated), no MCP stdio/SSE client yet, no workspace file-tree/context inspector, permission engine is `GREENEK_AUTO_APPROVE` only, no virtualized large-history rendering, no signed artifacts/CI matrix.

## Security/Accessibility/Perf Notes
- Secrets masked in UI/logs/exports (`redactSettings`), but `tesseract` OCR runs client-side (no exfiltration). Path traversal guarded in `fs.ts`. No CSP header yet. No WCAG audit; dialogs have `role=dialog` + `Escape` but no focus trap. No virtualization — long histories + streaming `commit()` re-renders whole list.
