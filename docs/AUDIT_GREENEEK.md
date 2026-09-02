# AUDIT — Greeneek Forensic Deep Dive
> Generated: 2026-09-02 | Branch: main | Commit pinned: `4e84901` (FORK.md) | Audited under: Node 20 / pnpm 9.15.4

---

## 1. Project Meta

### 1.A — File Tree (depth 4, hidden included)

```
Greeneek/
├── package.json                 # workspaces: packages/*, apps/*, type: commonjs
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json           # ES2022/cjs, composite, strict
├── tsconfig.build.json          # references all packages + apps
├── vitest.config.ts             # include: packages/*/tests, apps/*/tests
├── vitest.smoke.config.ts
├── oxlint.json / lefthook.yml / .editorconfig / .npmrc / .gitignore
├── .env.example
├── BRAND_GUIDELINES.md / FORK.md / CHANGELOG.md / SECURITY.md / THIRD_PARTY_NOTICES.md
├── docker-compose.yml / Dockerfile
├── greeneek.icon.md / greeneek_datauri.txt
├── .github/workflows/ci.yml
├── .git/                        # pinned fork, main only
├── apps/
│   ├── cli/src/index.ts         # web | run | --dump-config
│   ├── headless/src/index.ts    # runBatch (mode/model/input/out)
│   └── acp/src/index.ts         # ACP bridge
├── packages/
│   ├── base/src/{settings,storage,paths,credentials,logger,bundle,plugin}.ts
│   ├── base/src/plugins/        # mirror of repo-root plugins/
│   ├── core/src/{types,harness,session,agent,prompt,tools,trace,mode,runtime}.ts
│   ├── adapters/src/{openai,openrouter,anthropic,ollama,echo,provider,sse,errors,index}.ts
│   ├── tools/src/{index,fs,web,shell}.ts
│   ├── telemetry/src/{store,sinks,index}.ts
│   ├── server/src/{app,index}.ts
│   ├── web/src/{App.tsx (1328 LOC), main.tsx, styles.css (453 LOC), locales/{en,es}}
│   ├── web/{vite.config.ts, tsconfig.json, index.html, public/assets}
│   ├── brand / billing / gateway / marketplace / audit / sdk
│   └── adapters/tests/providers.test.ts
├── plugins/                     # 12 built-ins + _template (plain JS index at root)
│   ├── provider-{echo,openai,openrouter,anthropic,ollama}/manifest.json
│   ├── mode-{chat,agent,plan,dry-run,replay}/manifest.json
│   ├── tool-basic/manifest.json
│   └── tracer-local/manifest.json
├── plugins/index.js             # builtins array (JS, mirrored in base/dist/plugins)
└── docs/{ARCHITECTURE,SETTINGS,PLUGINS,MODES,TRACING,TESTING,ACCEPTANCE,FIX_LOG}
```

### 1.B — Stack (exact versions from package.json / lockfile)

| Slot | Value | File |
|------|-------|------|
| **Package manager** | `pnpm@9.15.4` (engines node>=20) | `package.json:26` `pnpm-workspace.yaml` |
| **Framework** | Vite 6.0.7 + React 18.3.1 + TypeScript 5.7.2 — **no Next.js/Nuxt** | `packages/web/package.json:12` `vite.config.ts:1` |
| **UI library** | **No shadcn/Radix/Tailwind**. Custom CSS in `packages/web/src/styles.css` (Material-inspired tokens: `--surface`, `--primary`, `--secondary #067a52/#34d399`, `--error`). No Tailwind config. | `styles.css:1` |
| **State management** | **No Zustand/Redux/Jotai**. `useState` + `localStorage` + server `Bundle.settings` via `PATCH /api/settings`. Active session in `App.tsx` `useState` + `sessionRef`. No global store. | `packages/web/src/App.tsx:114-283` |
| **Routing** | None. Single-page chat; Settings/Traces/Plugins as `Sheet` modals inside `App.tsx`. `react-dom` only. | `App.tsx:124` `Browser` not used |
| **DB / Storage** | `~/.greeneek/config.json` (versioned `schemaVersion:2`) + `~/.greeneek/credentials.json` + `~/.greeneek/traces/*.jsonl` + browser `localStorage` keys `gk.*`. No IndexedDB/Dexie/SQLite/Prisma. | `packages/base/src/storage.ts:24` `packages/telemetry/src/store.ts:9` |
| **HTTP** | Native `fetch` (Node 20 + browser). No axios. | `adapters/src/*.ts` |
| **Streaming** | `fetch` ReadableStream + custom `parseSSE` (`packages/adapters/src/sse.ts:9`) yielding `data:` lines, tolerant of `: OPENROUTER PROCESSING` and `[DONE]`. Anthropic has bespoke SSE loop. | `sse.ts:9` `openai.ts:72` `anthropic.ts:70` |
| **Path aliases** | No `@/*` alias. Uses workspace imports `@greeneek/*` (pnpm workspaces). | `tsconfig.base.json:5` |
| **Build / Dev** | `tsc -b tsconfig.build.json && vite build` · dev `tsx apps/cli/src/index.ts web --port 3080` · prod `node apps/cli/dist/index.js web` · vite proxy `/api→127.0.0.1:3080` · ports 3080 (server) / 5173 (vite) | `package.json:12` `packages/web/vite.config.ts:10` |
| **Env** | `.env.example` seeds via `packages/base/src/settings.ts:115 settingsFromEnv()` — the **only** `process.env` reader (except `tools/shell.ts:28` for shell env passthrough and `plugin.ts:192` `secrets.get→process.env`). `DEFAULT_SETTINGS` includes `OLLAMA_BASE_URL=http://127.0.0.1:11434/v1`. | `settings.ts:115` |

---

## 2. Provider / Model Implementation (exact traces)

### 2.A — Where model list lives

| Question | Answer | File:LINE |
|----------|--------|-----------|
| How is model list defined? | **Remote-fetched, not hardcoded as primary catalog**. `OpenRouterAdapter.listModels → GET /v1/models` (public, no key) + 24h file cache `~/.greeneek/cache/openrouter-models.json` + provider-specific fallbacks. `OpenAICompatibleAdapter.listModels → GET /v1/models` or `OPENAI_FALLBACK_MODELS` 3 entries. GUI merges via `GET /api/models`. | `adapters/src/openrouter.ts:119-210` `adapters/src/openai.ts:45-67` `server/src/app.ts:99-214` |
| Fallback catalogs | `FALLBACK_MODELS` (5 entries including `meta-llama/llama-3.1-8b-instruct:free`) and `OPENAI_FALLBACK_MODELS` (3 entries). | `openrouter.ts:28` `openai.ts:14` |

### 2.B — Provider Definition

| Provider | Adapter class | Base URL default | Key required | Enabled toggle |
|----------|---------------|------------------|--------------|----------------|
| `echo` | `EchoAdapter` | — (offline) | no | `greeneek.provider.echo` (default true) |
| `openai` | `OpenAICompatibleAdapter` | `https://api.openai.com/v1` | yes (`OPENAI_API_KEY`) | `greeneek.provider.openai` (false) |
| `openrouter` | `OpenRouterAdapter` | `https://openrouter.ai/api/v1` | yes (`OPENROUTER_API_KEY`, `sk-or-` warning) + sends `HTTP-Referer`/`X-Title` | `greeneek.provider.openrouter` (false) |
| `anthropic` | `AnthropicAdapter` | `https://api.anthropic.com/v1` | yes (`ANTHROPIC_API_KEY`, `x-api-key`) | `greeneek.provider.anthropic` (false) |
| `ollama` | `OllamaAdapter extends OpenAICompatibleAdapter` | `http://127.0.0.1:11434/v1` | **no** (but currently routes via OpenAI-compatible path, key not used) | `greeneek.provider.ollama` (false) |

- Providers are **plugins**: `plugins/provider-*/manifest.json:1` + `plugins/index.js:1` + `packages/base/src/bundle.ts:40 buildBundle()` registers 5 provider plugins. toggled via `POST /api/plugins/:id/enable|disable` which patches `settings.plugins[pluginId].enabled`.
- No `deepseek` provider exists. No DeepSeek model IDs are hardcoded as default.

### 2.C — Full Request Flow (UI → hook → service → fetch)

```
packages/web/src/App.tsx:360 streamRun()  ──→ POST /api/sessions/:id/run {task, model, provider, mode}
      │  native fetch (App.tsx:395) reads Response.body via reader.read()
      │  SSE-like line protocol: "data: {type:'assistant/stream',...}\n" (server/src/app.ts:420 streamRun line framing)
      │
packages/server/src/app.ts:340 streamRun() ──→ AgentLoop / Runtime / Mode.run()
      │  picks adapter factory per request: createLoopAdapter(bundle, {model,provider,mode}) (app.ts:419)
      │  → createAdapter(harness,secrets) (adapters/src/index.ts:24) switch(provider)
      │  → adapter.stream(messages, {tools, signal})
      │
adapters/src/{openai,openrouter,anthropic,ollama,echo}.ts:stream()
      │  builds POST {model, messages, stream:true, tools?, usage:{include:true}}
      │  → fetch(`${baseUrl}/chat/completions` | `/messages` for Anthropic)
      │  with headers:
      │    openai/openrouter: Authorization: Bearer <key> (+ HTTP-Referer/X-Title for openrouter)
      │    anthropic: x-api-key
      │    ollama: Authorization: Bearer (empty string today — effectively unauthed localhost)
      │  reads res.body via parseSSE (sse.ts:9)
      │
core/src/agent.ts + core/src/mode.ts + core/src/trace.ts
      wrapper: Mode ctx.chat → adapter.stream → yields {type:'text'|'toolCalls'|'usage'}
      App.tsx consumes incremental deltas and final {usage, modelId, provider}
```

### 2.D — Streaming

| Aspect | Implementation |
|--------|----------------|
| `stream:true` | Sent in `body` for openai/openrouter/anthropic/ollama. Echo fakes word-by-word `setTimeout 6ms`. |
| SSE parser | `parseSSE(body, signal)` in `sse.ts:9` — splits on `\n`, skips `""`, `":"`, requires `data:`, skips `[DONE]`, yields payload JSON strings. Handles keep-alive `: OPENROUTER PROCESSING`. |
| Chunk parsing | `safeJsonParse` + `choice.delta.content` (openai/openrouter) vs Anthropic `content_block_delta / text_delta / tool_use` (anthropic.ts:90). `tool_calls` accumulated via `toolAcc Map`. |
| `usage` | `stream_options:{include_usage:true}` + `usage:{include:true}` requested; parsed from trailing `chunk.usage` and yielded as `{type:'usage', usage:{inputTokens, outputTokens}}`. |
| Abort | `AbortController` in `App.tsx:380` → passed as `signal` → `fetch(...,{signal})` + `signal?.aborted` throws ProviderError `unknown/aborted`. |

### 2.E — Base URL Configurability

- **Per-provider, global**: each provider in `Settings.providers.{openai,anthropic,ollama,openrouter}.baseUrl` (optional for openai/openrouter/anthropic, default for ollama). Env overrides `OLLAMA_BASE_URL`, `OPENAI_BASE_URL`, `OPENROUTER_BASE_URL` via `settingsFromEnv()`. UI can `PATCH /api/settings {providers:{openai:{baseUrl:...}}}` and `POST /api/settings/test` validates per-provider.
- **Not per-model**. Single `baseUrl` per provider. Custom endpoints go via OpenAI-compatible provider (no dedicated UI for arbitrary `http://localhost:1234/v1` beyond patching openai baseUrl today).
- **Normalisation**: `replace(/\/$/,'')` everywhere.

### 2.F — Auth Header Format

| Provider | Header | Source |
|----------|--------|--------|
| openai / ollama / openrouter | `Authorization: Bearer <key>` | `openai.ts:55` `openrouter.ts:103` |
| openrouter extra | `HTTP-Referer: https://greeneek.dev` + `X-Title: Greeneek` | `openrouter.ts:105` |
| anthropic | `x-api-key: <key>` + `anthropic-version: 2023-06-01` | `anthropic.ts:61` |
| ollama (local) | Bearer with empty string today (no key required; still sends `Authorization: Bearer `). | `ollama.ts:9` |
| Key normalisation | `trim + strip /^Bearer\\s+/i` via `normaliseKey()` in settings + adapters. | `settings.ts:205` `openai.ts:26` |

### 2.G — Default Model

- **Settings**: `DEFAULT_SETTINGS.defaults.provider = "echo"` and `defaults.modelId` undefined (no deepseek default). `FALLBACK_MODELS` / `OPENAI_FALLBACK_MODELS` default to `gpt-4o-mini` / `echo-1` but selection is user-driven via `App.tsx:145 conversationModel` persisted `localStorage gk.model.current` + `gk.model.<sessionId>`.
- Where set: `packages/base/src/settings.ts:71` `defaults.provider:"echo"` · `packages/adapters/src/echo.ts:10 model="echo-1"` · `packages/web/src/App.tsx:145` `useState(localStorage gk.model.current)` · server fallback `harness.dump().find type llm.adapter` (bundle.ts).

---

## 3. DeepSeek Coupling Detection (mandatory grep -ri)

**Command**: `grep -r -i -n "deepseek" --include="*.ts" --include="*.js" --include="*.json" --include="*.md"` over `packages/ apps/ plugins/` and root (excluding `LICENSE`, `THIRD_PARTY_NOTICES.md`, `pnpm-lock.yaml` per `brand-sweep`).

| File | Line(s) | Snippet | Coupling Type | Action Required |
|------|---------|---------|---------------|-----------------|
| `CHANGELOG.md` | 20 | `- Initial fork from deepseek-ai/deepseek-harness dsh 0.1.2-alpha.4.` | CONFIG | KEEP (attribution in changelog only) |
| `FORK.md` | 7 | `Upstream project \| DeepSeek-Harness (github.com/deepseek-ai/deepseek-harness)` | CONFIG | KEEP (fork provenance) |
| `docs/ACCEPTANCE.md` | 39,68 | `Ctrl+M deepseek deepseek/deepseek-chat → trace` (manual test suggestion) | PROMPT | REMOVE — example uses non-existent DeepSeek provider; generalize to openrouter/openai |
| `docs/TEST_REPORT.md` | 41 | Same as above | PROMPT | REMOVE |
| `docs/TESTING.md` | 38 | `scripts/brand-sweep.sh rg -i "deepseek\|dsh" outside LICENSE… must be 0` | CONFIG | KEEP |
| `packages/base/src/settings.ts` | 55,202,231 | `provider: string // mock \| exa \| perplexity \| deepseek` + `for(k of [DEEPSEEK_API_KEY…])` | CONFIG (web-search provider enum + legacy env key) | GENERALIZE — rename provider value `deepseek` → `custom` or keep but decouple display; remove DEEPSEEK_API_KEY coupling (treat as generic search key or drop) |
| `packages/tools/src/web.ts` | 22,33 | `WEB_SEARCH_PROVIDER (mock, exa, perplexity, deepseek)` | UI_LABEL | GENERALIZE — rename `deepseek` search provider to `generic` or hide; no vendor branding |
| `packages/base/dist/**` | 153,188 | compiled `DEEPSEEK_API_KEY` passthrough | (build artifact of above) | Auto-fixed when source generalised |
| `packages/web/dist/assets/*` | — | built string `deepseek` in model search hint `placeholder: "… try 'deepseek'"` (from App.tsx current copy? check) | UI_LABEL | REMOVE — make placeholder vendor-neutral |
| `packages/web/src/App.tsx` | (built) | `Search models … try 'deepseek'` placeholder | UI_LABEL | GENERALIZE to `try 'llama'` / remove vendor hint |

**Verdict**: Code has **no hard DeepSeek provider, model ID, icon, color, or routing bias**. The remaining coupling is purely historical strings in docs + `WEB_SEARCH_PROVIDER='deepseek'` enum value + compiled artifacts. `brand-sweep.sh` would already flag `deepseek` outside fork docs — project is effectively decoupled, pending the small renames above. No scattered `if(provider==='deepseek')`.

**No matches for**: `deepseek-chat`, `deepseek-reasoner`, `deepseek-v3`, `deepseek-r1`, `deepseek-coder` in `packages/` / `apps/` source.

---

## 4. Current Architecture (for TARGET ARCHITECTURE diff)

```
packages/base/src/settings.ts  (Settings schemaVersion:2, DEFAULT_SETTINGS)
        ↓
packages/base/src/bundle.ts    (buildBundle: profile bundles → patches → plugins → Harness rows)
        ↓
packages/base/src/plugin.ts    (PluginRegistry: providers, tools, modes, tracers)
plugins/index.js  ────────────── (12 built-ins registered via PluginRegistry)
        ↓
packages/core/*    (Harness, AgentLoop, Mode, Runtime, Trace)
packages/adapters  (Provider seam: Echo/OpenAI/Anthropic/Ollama/OpenRouter + ProviderError taxonomy)
packages/server    (App.handle: /api/meta /api/models /api/settings* /api/sessions /api/traces /api/plugins)
packages/web       (App.tsx 1328 LOC single-file SPA + styles.css 453 LOC + vite proxy)

Gaps vs TARGET ARCHITECTURE (spec §4):
- No src/config/providers.registry.ts SSP-T — providers defined across settings.ts + adapters + plugins.
- No src/types/provider.types.ts typed PAL (Model/ProviderConfig capabilities are ad-hoc: ModelInfo vs Settings.providers shape).
- No BaseChatProvider abstract class / IChatProvider PAL — adapters implement ModelAdapter (core/types.ts:45) not PAL (§4.2.1/4.2.2 spec).
- No src/providers/openai-compatible.provider.ts — Ollama reuses OpenAICompatibleAdapter but is not a generic openai-compatible discovery layer.
- No src/services/{chat,model-discovery,stream-parser,provider-manager}.service.ts — discovery/health are embedded in adapters + server /api/models.
- No stores/ (Zustand) — state is local useState + localStorage.
- No src/lib/storage/secure-storage.ts — keys are plain settings.providers.*.apiKey persisted to ~/.greeneek/config.json.
- No reasoningContent / vision / file-upload contracts.
- UI: single App.tsx (1328 LOC) not decomposed into components/chat|sidebar|settings|model-selector.
- No Tailwind/shadcn — custom CSS (ok to keep or migrate per product decision).
```

---

## 5. Audited Feature Inventory (Greeneek current → used for FEATURE_PARITY.md)

| Area | Status | Evidence |
|------|--------|----------|
| Chat single-turn | Y | `App.tsx:360 streamRun` + `POST /api/sessions/:id/run` |
| Multi-turn per session | Y (partial) | Sessions list `activeSessions Map` but no sidebar history/persistence across reloads beyond `sessionRef` in memory |
| Threads / rename / delete / archive / pin | N | Not implemented (sessions are ephemeral, `gk.model.<sid>` persists only model choice) |
| Auto-title generation | N | Not implemented |
| Model selector | Partial | `App.tsx:540 panel` model picker: fetched `GET /api/models`, grouped by provider, Favorites/Recent (localStorage), search, FREE/tool tags, refresh. Missing: Local vs Cloud grouping, badges vision/reasoning, availability dots, BYOK status |
| Provider selector | Partial | Implicit via `createAdapter(harness,secrets)` + model prefix. No explicit provider grouping or enabled/disabled UI beyond `POST /api/plugins/:id/enable` |
| Streaming token-by-token | Y | `parseSSE` + `reader.read()` with incremental `setItems` deltas |
| Stop generation | N (UI) | AbortController exists server-side; UI has no Stop button wired |
| Regenerate | Partial | `Regenerate with…` button → re-opens picker (no direct retry with same prompt) |
| Edit user message & resubmit | N | No edit UI |
| Copy message / code block | N | Render is inline `renderInline` + `terminal pre` without copy buttons |
| Delete message | N | Not implemented |
| Markdown rendering | Partial | `Markdown` + `renderInline` only handles `` `code` `` and fenced ``` blocks; no lists/tables/headings/links/image parsing |
| Code syntax highlighting | N | `terminal pre` no highlight (no Shiki/highlight.js) |
| LaTeX / Math | N | Not implemented |
| Reasoning / Thinking collapsible | N | No `reasoningContent` field on `Item`/API; stream yields only `text`/`toolCalls`/`usage` |
| System prompt (global + per-thread) | Partial | Global `defaults.systemPrompt` via `PATCH /api/settings`; no per-thread override UI |
| Presets / Templates | N | Not implemented |
| Temperature | Y | `PATCH /api/settings {defaults:{temperature}}` (0-2 slider in Advanced) |
| Top-P / Max Tokens | Partial | `maxTokens` exists on Settings but no Top-P field; temperature only |
| Vision / image upload | N | No file input, clipboard paste, drag-drop, or `image_url` mapping |
| File upload (PDF/DOCX/TXT/CSV) | N | Only settings Import uses `<input type=file>` (JSON only); no chat attachments |
| RAG / file context | N | Not implemented |
| Web search | Partial | `packages/tools/src/web.ts` `web.search` tool + `WEB_SEARCH_PROVIDER` mock/exa/perplexity/deepseek (not UI-toggleable) |
| Tools / function calling | Y | `toolCalls` accum+yield in adapters, rendered in App.tsx as `tool` Item; `ToolRegistry` (calc, fs, shell, web, current_time) |
| Canvas / Artifacts | N | Not implemented |
| Voice input (STT) | Partial | `SpeechRecognitionLike` `SpeechCtor` + `🎙 listening` button (Web Speech API), no TTS |
| Timestamps | N | Not shown |
| Token usage | Y | `usage` yielded → `App.tsx` `meta-line` usageLabel + `model · tokens · latency` |
| Settings modal (tabbed) | Partial | 10-tab sheet (providers, plugins, defaults, tracing, advanced, data, diagnostics, billing, marketplace, audit, about). No dedicated API Keys tab, no grouping Local/BYOK, no per-provider Show/Hide/Test UX consistency |
| Appearance / theme | N (removed intentionally) | Theme was deleted per FIX_LOG #8; follows OS (`data-theme` dark via `styles.css:47`) but no light/dark/system toggle UI |
| Responsive / mobile sidebar drawer | N | No breakpoint `768px` drawer; panels are centered sheets |
| Empty state / welcome | Partial | Basic `composerPlaceholder` + `planMode` chip; no local-model-first onboarding |
| Error states (actionable) | Partial | `ProviderError.kind` mapped (auth/credits/rate_limit/…) but UI shows raw toast, not per-kind recovery (fix key / start Ollama) |
| Toast / notifications | Y | Simple `notify` bridge (in App.tsx) |
| Loading / skeletons | Partial | `streaming` spinner only; no skeletons for models/traces |
| Chat scroll / scroll-to-bottom | Partial | `useRef` scroll container but no sticky bottom button or auto-scroll pin |
| Sidebar collapsible/resizable | N | Not implemented |
| Search chats | N | Not implemented |
| Export / Import chats | N | Settings has `GET /api/settings/export|import` (settings only), not chats |
| Model capabilities badges | Partial | `FREE`, `tools`, `contextLength k`; missing `VISION` / `REASONING` / `LOCAL` |
| Connection status | Partial | `qt` error is shown inline (`qt — Open Settings → Providers`) but no green/red dot, no `GET /health` badge |
| Retry on failure | Partial | Retried via UI Regenerate only; no exponential backoff |
| Keyboard shortcuts | Partial | `Ctrl+M` (model picker), `Enter` send / `Shift+Enter` newline, no `Ctrl+N` new chat, no `Esc` to stop |
| Persistence | Partial | `~/.greeneek` JSON files on server + `localStorage gk.*` on client; no IndexedDB; chats ephemeral |
| Build / CI | Y | `ci.yml` + `vitest` coverage 70/85 + `brand-sweep.sh` + `gitleaks` |
