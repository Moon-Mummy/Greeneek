# PLAN — Greeneek → Generic AI Chat Harness (Local-First, Provider-Agnostic)

> Depends on: `docs/AUDIT_GREENEEK.md` + `docs/FEATURE_PARITY.md`. Build strictly phase-by-phase, commits per phase, `git push` never automatic.

## Ground rules (from your spec)

- Provider-Agnostic PAL is the spine — every cloud/local provider equal, DeepSeek as optional BYOK adapter, never default.
- Local-first: Ollama/LM Studio/vLLM/OpenAI-compatible are `isLocal:true`, `apiKeyRequired:false`, shown first in every picker.
- BYOK: per-provider keys, `SecureStore` abstraction, local-only, never sent to our backend.
- No vendor branding lock-in, no `if(provider==='deepseek')`.
- Type-safe, streaming-first (AsyncIterable), error taxonomy `ProviderErrorKind`, accessibility AA.

## Phased execution

### Phase A — PAL & Registry foundations (P0, no UI yet)
**Refs**: spec §4.1-4.4, §5, §8.
- `src/types/provider.types.ts` — `ProviderType`, `ModelCapability`, `Model`, `ProviderConfig` (exact spec §4.2.1).
- `src/providers/base.provider.ts` — `BaseChatProvider` + `ChatCompletionParams/Chunk`.
- `src/providers/openai-compatible.provider.ts` — OpenAI-compatible workhorse (normalise baseURL, `/v1/models` + Ollama `/api/tags` fallback, SSE/NDJSON line buffering, auth only if `apiKeyRequired`, vision `image_url` vs `images:[]`, reasoning `reasoning_content/thought/thinking`, tools `tool_calls` accum).
- `src/providers/ollama.provider.ts` — native `/api/chat` variant (optional, preferred for thinking/images), falls back to openai-compatible.
- Dedicated adapters `anthropic|openai|openrouter|deepseek` thin over base; `echo` unchanged.
- `src/config/providers.registry.ts` — SSOT default 10 rows (ollama, lmstudio, vllm, localai, custom, openrouter, deepseek BYOK, openai, anthropic, google); `isLocal`+`apiKeyRequired` rules; registry merging `default + userOverrides(providers{baseUrl,enabled})`.
- `services/model-discovery.service.ts` + `services/stream-parser.service.ts` + `services/provider-manager.service.ts` + `services/chat.service.ts` (unified orchestration, AbortController, error normalisation).
- `lib/storage/secure-storage.ts` — `SecureStore` interface + web impl (AES-GCM passphrase or plain+warning; OS keychain note for Electron/Tauri scope).
- Types `src/types/chat.types.ts` + `src/types/settings.types.ts` strict (spec §8.1).

**Done when**: `pnpm typecheck` + `pnpm test` green; `GET /api/models` & `POST /api/settings/test` go through PAL; `brand-sweep.sh` 0.

### Phase B — State & Persistence
- Choose Zustand (keep consistent — currently no store, but spec §8.2 recommends it). **Decision needed**: confirm Zustand vs Context.
- `stores/chat.store.ts` (`threads`, `activeThreadId`, `isGenerating`, `abortController`, actions spec §8.2.1).
- `stores/settings.store.ts` (DEFAULT_SETTINGS with `activeProviderId:'ollama'`, migration `schemaVersion:3`) + `stores/provider.store.ts`.
- Persistence: versioned keys `greeneek.chat.v3` etc. → IndexedDB (Dexie) if messages/images exceed 5MB, else localStorage. Migrations.

### Phase C — BYOK Security UI (§5.3, §10.2)
- `components/settings/api-keys-settings.tsx` grouped Local (read-only badge) / Cloud (input + Show/Hide + Test + Clear + Verified/Invalid badge + lastTested).
- Encryption toggle + amber warning banner + Danger Zone `Clear All` modal. Never log keys, mask `****`, redact in trace.

### Phase D — Chat Core UX (Parity rows 1-16)
- Layout shell `components/sidebar/` + `components/chat/` + `components/model-selector/` decomposition of `App.tsx` (1328 LOC).
- Threads CRUD (new/rename/delete/pin/archive/search) + auto-title + multi-turn persisted.
- Stop / Regenerate / Edit+Resubmit / Copy / Delete.
- Markdown GFM + code highlight + LaTeX (behind flag) + timestamps + token usage split.
- Reasoning collapsible `reasoning-block.tsx` (streaming auto-expand).
- Vision upload + file attachments (chips, previews) + tool timeline.

### Phase E — Design System & A11y (§7)
- Tokens in `styles.css` via CSS variables + Tailwind? **Decision needed**: keep custom `Technical Precision System` (deep-slate/forest emerald) or migrate to Tailwind v3/v4 + shadcn.
- Shell: sidebar resizable 240-360 (persist), <768 drawer, sticky composer, focus rings, `aria-live` for streaming, contrast 4.5:1, reduced-motion.

### Phase F — Polish & Parity tail (§9-10)
- Presets, Top-P/MaxTokens, web-search toggle + citations, export/import chats, capabilities badges override, connection dots, retry/backoff, keyboard shortcuts (`Ctrl+N`, `Esc`, `Ctrl+M`), skeletons, error recovery pages, empty-state local onboarding.

## Design choices to confirm before Phase A code

1. **UI framework**: keep existing custom CSS (lighter, matches audit) or adopt Tailwind + shadcn (heavier, more consistent per spec §7.2)? Recommendation: keep custom tokens (already material-like) but extract to `globals.css` variables; add Tailwind only if you want rapid shadcn components.
2. **State lib**: Zustand (spec recommendation) — OK? Alternative Jotai/Context would fragment stores.
3. **Persistence**: Dexie IndexedDB for threads/images (recommended for >5MB chats) vs localStorage-only (simpler, hits limit). Recommend Dexie.
4. **Encryption default**: prompt for passphrase on first key save vs opt-in toggle with warning. Recommend opt-in + warning (spec §5.2 fallback).
5. **Ollama native vs OpenAI-compatible**: ship both (native preferred, compatible fallback) — OK?

## Verification per phase
- `pnpm build && pnpm test && pnpm smoke` + `scripts/brand-sweep.sh` (deepseek 0) + manual `GET /api/models?refresh=1` + `POST /api/settings/test` per provider (401 vs success) + local Ollama `http://localhost:11434/v1/models` health.

## Risks
- Breaking `packages/base/src/settings.ts` shape — mitigate with `schemaVersion` migrations.
- `App.tsx` monolith split — keep `packages/web/src/App.tsx` re-exporting until Phase D fully lands to avoid dead main branch.
- Key security — never echo keys in `/api/meta` or traces (reuse `redactSecrets` in logger).

---
Next action: confirm choices 1-5; on green light, start Phase A branch `feat/pal-registry`.
