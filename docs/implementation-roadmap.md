# Implementation Roadmap

> Phases are small, build+test after each — never leave TODO/placeholder (spec §1.8).

## Done (A–E)
- **A PAL spine** `dc6176e` — `registry`, OAI+Ollama, `SecureStore`, sweep.
- **B stores+schema v3** `b2dba90` — `zustand`+`dexie`, `settings` v3 deepseek+behavior.
- **C BYOK+picker** `99b57e5` — `ApiKeysManager`, `ModelPickerGrouped`.
- **D reasoning+vision** `e0aae5c` — `ReasoningLog`, `VisionDropzone`, `core` reasoning/images, SSE.
- **E hardening+OCR** `3a223a9` — `tesseract` dynamic fallback, `ErrorBoundary/OfflineBanner/Skeleton`, retry.

## Next (maps to spec §23 Milestones 1–10)
| Milestone | Scope | Gate |
|-----------|-------|------|
| **1 Stabilization** | Fix `vitest/vite` audit (bump to `vitest≥3.2.6`, `vite≥6.4.3` already), remove dead UI (`tracesOpen` panel hardens), add baseline E2E smoke | `pnpm build/typecheck/lint/test/audit` green |
| **2 Provider Independence (close)** | Fill 20-provider matrix (§5.1) via OAI preset reuse; add `test connection` for Ollama/Generic; doc `custom-providers.md` | `docs/provider-support.md` 20 rows Verified |
| **3 Local Models (close)** | Detect `11434/1234/8000`, download guidance (no silent DL), health checks, context overrides | Offline E2E `local model disappears mid-stream` |
| **4 Conversation Foundation (close)** | Dexie persistence + search/tags, branch/fork, token estimate, GFM copy/apply + math | Branch/regenerate tests |
| **5 Workspace+Context** | File tree, `AGENTS.md` precedence, token budgeting, truncation warnings, inspector | Context engine tests |
| **6 Agent+Tools** | `git` service + patch hunk accept/undo checkpoint, permission engine 6×11, limits | §20.3 integration tests |
| **7 MCP** | stdio/SSE manager, per-tool perms, logs redacted, health | MCP security tests |
| **8 UI Redesign** | Tokens, resizable panels, settings redesign, responsive drawers, command palette, all loading/empty/error/offline states, a11y WCAG 2.2 AA | `axe` + screenshot tests |
| **9 Security+Reliability** | Threat-model fixes (traversal/symlink/Markdown/CSP/SSRF/limits), secret redaction tests, migration recovery, perf virtualization | §20.5 pass, no secret in logs/exports |
| **10 Parity+Release** | Re-run parity matrix to all `Verified`, clean-install + upgrade, `FINAL_REPORT` 15 items, artifacts + checksums | Definition of Done §24 all true |

Current `parity.md`: 2 Verified → target 20+ Verified. Next commit is **Milestone 1** audit fix + E2E harness.
