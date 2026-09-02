# Security Model

## Vault
- **Primary:** OS credential store — macOS Keychain, Windows Credential Manager, Linux Secret Service (`keytar` when available) via `adapters/secure-storage.ts` → `base/secretStore.ts`.
- **Fallback:** encrypted local vault (user passphrase, `libsodium`/`AES-GCM`), never plain `settings.json`/`localStorage`/`logs`.
- **Ops:** `saveCredential/loadCredentials/secretsFromSettings`, `updateSettings` atomically syncs `secrets`, `PATCH /api/settings` masks `****`, `export` excludes secrets unless `includeSecrets=1` + explicit approval, `Delete all secrets` → `POST /api/settings/reset`.

## Redaction
`server/app.ts:601 redactSettings` masks `apiKey→****`, `+hasKey`; `telemetry` + `audit` redact `Authorization`, `Bearer sk-or-`, `OPENAI_API_KEY` patterns; SSE `error` never leaks key; `pnpm test` screenshots redacted.

## Threats (§18)
| Threat | Mitigation (current) | Remaining |
|--------|----------------------|-----------|
| Path traversal/symlink escape | `tools/fs.ts` validates `path` ∈ workspace, rejects `..`, resolves realpath | Git `restore checkpoint` not yet |
| Shell injection | `shell.ts` classified risk, requires approval (`GREENEK_AUTO_APPROVE` gate) | Full 6×11 permission matrix missing |
| Prompt injection (file/MCP) | MCP output treated untrusted; tool descriptions not privileged | CSP + Markdown sanitization not yet |
| SSRF via tools | `web.ts` fetch allow/deny list + timeout | Not yet per-workspace |
| Large output DoS | `tool.execute` timeout + `MAX_BYTES` 4 MB image cap, `VisionDropzone` rejects >4 MB | Output-size limits for all tools not yet |
| Localhost exposure | Binds `127.0.0.1` default, no LAN unless `HOST=0.0.0.0` explicit | Needs docs + guard |

## Trust boundary
Workspace `trust/untrust` (§18 final) — untrusted starts read-only, stricter perms. Offline mode blocks `fetch` to `openai/openrouter/anthropic` (banner).

## Supply chain
`pnpm audit` — 5 vulns (vitest/vite) tracked to fix in Milestone 1; `FOR` `K.md` pins `4e84901`, rebase monthly.
