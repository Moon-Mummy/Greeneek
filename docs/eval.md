# Eval & Benchmark Harness

## Corpus

Recorded sessions live in `~/.greeneek/sessions/*.jsonl` (append-only
SessionEvent log). Replay treats a session's `user` message as the task and
asserts the projection (tool names, turn count, final answer) against the
snapshot.

## Replay in CI

```bash
pnpm smoke            # headless smoke runner
gh workflow run nightly.yml   # nightly trend dashboard
```

The headless profile runs a real turn with the deterministic Echo provider,
so CI results are reproducible without API keys.

## Scoring rubric & thresholds

| Criterion | Default threshold |
| --- | --- |
| Turn completes within N steps | ≤ 12 |
| Tool success rate | ≥ 95% |
| No approval-policy violations | 0 |
| Cost per turn (echo) | $0 |

## Provider comparison matrix

Swap `GREENEK_MODEL_PROVIDER` between `echo`, `openai`, `anthropic`,
`ollama` and run the same corpus; the telemetry cost ledger emits
`assistant/message` events with usage so per-provider cost/latency can be
tabulated automatically.
