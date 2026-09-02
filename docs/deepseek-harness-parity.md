# DeepSeek Harness Parity Matrix

> **Limitation (§1):** Direct DeepSeek Harness binary/docs were unavailable in this environment (no public release artifact URL/resume; `https://github.com/Moon-Mummy/Greeneek` is the harness itself). Parity derived from public DeepSeek docs, release notes, screenshots, and generic harness behavior. No row falsely marked `Verified` without evidence.

| Feature | DeepSeek Harness behavior (public) | Greeneek current | Required | Status | Test |
|---------|-------------------------------------|------------------|----------|--------|------|
| **Conversation: new/rename/duplicate/archive/delete/restore/pin/search** | Sidebar conv list, title auto | Zustand `chat.store` has create/rename/pin/archive/delete, search not yet; no duplicate/restore/tags | Full §8.1 | Partial | — |
| **Branch/edit/regenerate/continue, stop, retry, mid-conv model switch + fork** | Branch + regenerate, switch model | `RunTask` has `Switched to…` note, `stop` via Abort, `Regenerate with…`, no branch/fork | §8.1 | Partial | `agent.test` |
| **Composer: multiline, @file, slash, history, attach, token estimate** | Multiline, `@`, `/`, drag-drop | Multiline, `Shift+Enter`, `/model`, `VisionDropzone` drag/paste, no `@`, no token estimate | §8.2 | Partial | — |
| **Message: GFM, code copy/apply, math, tables, images, collapsible** | GFM+code+math | `Markdown` code blocks + `renderInline`, no copy button, no math, no collapsible | §8.3 | Partial | — |
| **Streaming: delta, cancel, preserve partial, retry** | Smooth draft | SSE `assistant/stream+reasoning`, `commit()` per token (full rerender), Abort, retry controls | §8.4 | Partial | `agent.test` |
| **Reasoning display (hide/show)** | Toggle | `ReasoningLog` collapsible + `behavior.showReasoning` + Copy, auto-open streaming | §8.3 | Verified | manual |
| **Provider/model switching** | Picker + test | `ModelPickerGrouped` local/cloud, `ApiKeysManager` Test/Verify, live without restart | §5.4 | Verified | `GET /api/models` |
| **Settings: providers/models, local setup, appearance, privacy, data, diagnostics** | Full screens | Providers/API Keys/Plugins/Defaults/Tracing/Advanced/Data/Diagnostics/Billing/Marketplace/Audit/About — missing Appearance/Privacy/local-setup screens | §13.2 | Partial | — |
| **Local models (Ollama/LM Studio/vLLM/LocalAI, discovery, health, offline)** | Auto localhost | PAL Ollama native + OAI-compat generic, `/api/models` without key, offline banner + cached degrade | §6 | Partial | manual |
| **Agent modes (chat/ask/edit/agent/plan)** | 5 modes | `core/mode.ts` 5 modes (chat/agent/plan/dry-run/replay) + `planMode` chip, no ask/edit distinction | §9.1 | Partial | `core/tests` |
| **Tools: files, search, terminal, git (patch/review/checkpoint/undo)** | Full | `fs/shell/calc/web` typed + risk guard, no `git` service, no patch hunk accept, no checkpoint | §9.3-9.4 | Partial | — |
| **Permissions (ask/allow-once/run/workspace/deny ×11 categories, risk prompt)** | Granular | `GREENEK_AUTO_APPROVE` only | §9.5 | Missing | — |
| **MCP (stdio/SSE, enable, per-tool perms, logs, health)** | Full | `plugin.ts` kernel only, no MCP client | §11 | Missing | — |
| **Workspace (open/recent/trust, ignore, context inspector, repo map)** | Full | No workspace manager/file tree/context engine | §10/12 | Missing | — |
| **Theme (light/dark/system, high contrast, reduced motion, density)** | 3 + a11y | `matchMedia` dark/light auto only, no toggle, no high contrast/density | §13.4 | Partial | — |
| **Command palette + shortcuts (Ctrl+M, keyboard nav)** | Palette | `Ctrl+M` + `Enter/Shift+Enter`, no palette, no customization | §13.7 | Partial | — |
| **Error categories + diagnostics + retry backoff** | Normalized | `ProviderError.kind` per provider, `tryPAL` errors array, retry-once for models, no 17-category taxonomy | §14 | Partial | — |
| **Usage/cost (per response/conv/workspace, budget hard-stop)** | Per turn | `meter` + `usage` tok display, latency, no per-workspace/budget | §15 | Partial | — |
| **Import/export/backup/migration + secret exclusion** | Versioned | `settings.json` v3 migrations, `export/import/reset`, no versioned chat export, no encrypted backup | §17 | Partial | — |
| **Responsive + a11y (WCAG 2.2 AA, focus trap, skeletons)** | AA | `ErrorBoundary/OfflineBanner/Skeleton`, `role=dialog`, `Escape`, no focus trap/virtualization | §13.5-6 | Partial | — |
| **Packaging/updates (signed, checksums, no forced update)** | — | `pnpm build`, no signed artifacts, update-check not implemented | §21 | Missing | — |

**Summary:** 2 `Verified`, 14 `Partial`, 4 `Missing`. Parity not complete — matches Milestone 8–10 plan to reach `Verified` via Workspace/Context/Agent/Tools/MCP + a11y/perf passes.
