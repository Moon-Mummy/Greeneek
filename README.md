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
- **13 new capabilities** in this release: extra model providers, billing &
  metering, plugin marketplace, observability, one-command Docker deploy,
  CI/CD hardening, i18n, enterprise SSO/SCIM, compliance audit log, user
  theming, eval harness, API gateway & rate limits, voice I/O.
- **Runs anywhere**: Web UI, headless runner, TypeScript SDK, ACP editor
  server, and Docker.

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
