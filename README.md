<p align="center">
  <img src="packages/brand/assets/logo-mark.png" width="88" height="88" alt="Greeneek logo" />
</p>

<h1 align="center">Greeneek</h1>

<p align="center"><strong>The surgeon's toolkit for AI agents. Everything is a plugin.</strong></p>

<p align="center">
  <a href="https://github.com/Moon-Mummy/Greeneek/actions"><img src="https://img.shields.io/badge/CI-passing-067a52" alt="CI"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-067a52" alt="MIT"></a>
  <a href="./FORK.md"><img src="https://img.shields.io/badge/fork-pinned-34d399" alt="Pinned fork"></a>
</p>

---

Greeneek is an independent, MIT-licensed agent harness for AI evaluation,
agent orchestration, and real-time data streaming. It boots from ordered
**profile bundles** and **config-row patches** — every capability is mounted
beside, never inside, the loop, so anything can be disabled with a patch
instead of a revert.

- **Composition**: `profile bundles → profile patch → home patch → CLI
  overlay`; inspect with `greeneek --profile web --dump-config`.
- **Composition**: 7 phases shipped — `Phase 1` typed settings + `Phase 2` OpenRouter + `Phase 3` Settings overhaul + `Phase 4` model/mode picker in chat + `Phase 5` plugin kernel + `Phase 6` every run traceable + `Phase 7` runtime modes.
- **Providers**: `echo` (offline) + `openai` + `openrouter` (`sk-or-` + `HTTP-Referer`/`X-Title` + `/auth/key` + `/models` cache) + `anthropic` + `ollama` — `GET /api/models` live list, `POST /api/settings/test` per `ProviderError.kind`.
- **Settings**: single `packages/base/src/settings.ts:16` versioned `schemaVersion:2`, field-level `PATCH /api/settings`, masked `****` + `Reveal`/`Clear`/`Test connection`, live without restart, `GET /api/settings/export|import|reset`.
- **Chat**: model chip `Ctrl+M` `/model` + mode chip `chat/agent/plan/dry-run/replay` `packages/core/src/mode.ts:41`, per-conversation `modelId/modeId` + `Switched to …` system note, `model · tokens · latency` + **View trace**.
- **Plugins**: `packages/base/src/plugin.ts:1` 12 built-ins `plugins/provider-*/manifest.json:1`, `GET /api/plugins` + `POST /api/plugins/:id/enable|disable` `packages/server/src/app.ts:215`.
- **Tracing**: `packages/core/src/trace.ts:70` `Runtime` + `packages/telemetry/src/store.ts:9` `LocalTraceStore` JSONL `~/.greeneek/traces`, `GET /api/traces` table + **View trace** waterfall `packages/web/src/App.tsx:852` + `docs/TRACING.md:1`.
- **Runs anywhere**: Web UI, headless `greeneek run --mode/--model/--input/--out` `apps/headless/src/index.ts:12`, TypeScript SDK, ACP, Docker.

> **⚠ Developer preview** — the base is pinned to a fixed upstream commit
> (`4e84901…`). Breaking changes upstream are expected; we rebase monthly,
> never continuously. See [FORK.md](./FORK.md) and [SECURITY.md](./SECURITY.md).

## Quick start

```bash
# Prerequisites: Node.js 20+, pnpm 9+
git clone https://github.com/Moon-Mummy/Greeneek.git
cd Greeneek
pnpm install
pnpm build
pnpm greeneek web                 # → http://127.0.0.1:3080
```

Try in the Web UI:

```
@execute calc.eval {"expression":"(2+3)*7"}
@execute fs.write_file {"path":"demo.txt","content":"hello from Greeneek"}
@execute web.search {"query":"agent harness"}
```

Set `GREENEK_MODEL_PROVIDER=openai|anthropic|ollama` (plus the matching API
key in Settings → Providers) to route through real models. Without a key the
deterministic **Echo** provider keeps the whole loop live.

### Profiles

| Profile | Surface |
| --- | --- |
| `web` | Full Web UI + gateway + billing + marketplace |
| `headless` | No server; one task from CI/cron |
| `sdk` | JSON-RPC-style client |
| `acp` | Agent Client Protocol for editor integrations |

```bash
pnpm greeneek --profile web --dump-config      # inspect composition
pnpm greeneek run "explain the plugin model"   # one-shot turn
docker compose up --build                      # one-command deploy
```

## Tests

```bash
pnpm test        # unit
pnpm smoke       # profile smoke
scripts/brand-sweep.sh   # no upstream identity outside LICENSE/notices
```

## License & attribution

MIT. The upstream MIT grant and third-party notices are preserved — see
[LICENSE](./LICENSE) and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
Greeneek is not affiliated with the upstream project.

## Maintainer

Greeneek Labs · https://greeneek.dev · support@greeneek.dev
