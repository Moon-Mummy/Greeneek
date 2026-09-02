# Testing Strategy (§20)

## Pyramid
- **Unit (§20.1):** response norm, stream parse, caps, token budget, cost, redaction, path, perms, patch, migration, import/export, error norm, arg validation. Run: `pnpm test` (vitest). Current 45/45.
- **Provider contract (§20.2):** mocked/recorded `auth fail / list / stream / non-stream / tool(+multi) / malformed / cancel / rate / overflow / usage / unsupported` per adapter. Live tests gated `env` creds.
- **Integration (§20.3):** `add provider+test → discover → stream → stop → switch → local → open workspace → attach → read → approve/deny → patch accept/reject → undo → MCP → export/import → restore → migration`. Missing — to add in Milestones 4–7.
- **E2E (§20.4):** 15 workflows (first-run Ollama, BYOK, chat, repo Q, propose+reject hunk, run tests, cancel, auth error, local disappears, restart, offline, secret leak, keyboard, small-screen). None yet — Milestone 1 adds Playwright `pnpm e2e`.
- **Security (§20.5):** traversal, symlink, Markdown XSS, shell meta, secret output, MCP malformed, huge output, schema attack, URL allow, workspace escape. `tools/fs.test` + future `security.test`.
- **Visual/a11y (§20.6):** screenshots light/dark, empty/loading/error, viewports, `axe` scans, keyboard/contrast. Not yet.

## Gates
`pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build` → `pnpm audit` (high block). CI matrix: Node 20 + 22.

## Current
`lint` 1 warn, `typecheck` pass, `test` 13 files 45 pass, `build` 65 modules, `audit` 5 vulns (vitest/vite to fix).

## To add
`vitest smoke` already (`apps/headless`); add `pnpm test:contracts`, `pnpm e2e` with `VITEST_LIVE=1` guard.
