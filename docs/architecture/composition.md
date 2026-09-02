# Architecture — Composition

Greeneek keeps the plug-in composition model exactly as designed: every
capability is a plugin on the shared context, composed at boot from ordered
layers. We do not fork the loop — we mount beside it.

## Boot order

| Layer | Source | Notes |
| --- | --- | --- |
| 1 · Profile bundle | `greeneek.profile` rows in `packages/{base,adapters,tools,telemetry,billing,audit,gateway,marketplace}` | Bundle rows: providers, tools, telemetry, plans, audit, gateway, marketplace |
| 2 · Profile patch | `<profile>/cordis.patch.yml` | Replace a row by id, or insert |
| 3 · Home patch | `~/.greeneek/cordis.patch.yml` | Applies to every profile on the machine |
| 4 · CLI overlay | `--overlay` | Final word, per launch |

Implementation: `packages/core/src/harness.ts` (`Harness.patch`), applied by
`packages/base/src/bundle.ts` (`buildBundle`).

## Seams

| Seam | File | What mounts |
| --- | --- | --- |
| `ctx.llm` | `packages/adapters` | echo, openai, anthropic, ollama — one `stream()` vocabulary |
| Tool registry | `packages/core/src/tools.ts` | scoped tools, guarded pipeline, approval policy |
| System prompt | `packages/core/src/prompt.ts` | priority-ordered sections |
| Telemetry | `packages/core/src/telemetry.ts` | sinks, spans, cost ledger, alerts |
| Session events | `packages/core/src/session.ts` | durable JSONL + in-process projection |
| Audit | `packages/audit` | append-only hash chain over session events |
| Billing | `packages/billing` | token meters, tier gates, Stripe webhooks |
| Gateway | `packages/gateway` | rate limits, API keys, signing |
| Marketplace | `packages/marketplace` | registry manifests → profile patch rows |

## Baseline dump

The frozen composition baseline for this release was generated with:

```bash
pnpm greeneek --profile web --dump-config > docs/architecture/dump-config.web.json
```

The file is archived in this directory and regenerated on release. Any row in
that dump can be replaced/disabled by a patch without touching source — that
is the reversible product cut.
