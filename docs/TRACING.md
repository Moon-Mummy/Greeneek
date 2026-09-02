# Tracing — Every run is traceable

Every `llm.request`/`llm.stream`/`tool.call`/`plugin.hook`/`mode.step` — including failures, cancellations, and background — produces a `Run` + `TraceSpan` via the single `Runtime.execute` gateway.

## Model

- `Run` `packages/core/src/trace.ts:3` `runId/traceId/conversationId/messageId/modeId/modelId/providerId/startedAt/endedAt/status/usage/latencyMs/ttftMs/error/trigger`
- `TraceSpan` `trace.ts:21` `spanId/traceId/runId/kind/name/startedAt/endedAt/status/attributes/events`
- Required `llm.request` attrs: `model/params/provider request id/HTTP status/retry`, `llm.stream`: `chunk count/TTFT/bytes`, `tool.call`: `tool name/args/result/duration/approval`.

## Gateway

`Runtime.execute(run: RunSpec, fn, signal): AsyncIterable<RunEvent>` `trace.ts:79` — creates `Run`+`rootSpan`, appends `store.appendRun/Span`, wires `signal` abort → `cancelled`, `try/catch` → `error`, finalises `ok|error|cancelled` with `latency/ttft`, `otlpEndpoint` POST `gen_ai.*` `trace.ts:201` (failures never affect runs). Providers are not importable from UI (`oxlint` import boundary + `packages/core/tests/trace.test.ts` spy asserts span per call). `runId/traceId` propagated to provider `metadata` and logs.

## Store (`plugins/tracer-local`)

`packages/telemetry/src/store.ts:9` `LocalTraceStore` append-only `~/.greeneek/traces/YYYY-MM-DD.runs/spans.jsonl` `store.ts:71`, `Map` indexes `store.ts:38` `queryRuns(conversationId/modelId/status/limit)` + `querySpans(runId)` `store.ts:48`, `exportJson` `store.ts:52`, `clear`, `sweep` retention `retentionDays` + size `maxSizeMB` `store.ts:115` (background). Redaction before write: `Authorization`, `sk-or-`, `settings.tracing.redactPatterns`, `storePrompts:false` hashes `trace.ts:185`.

## UI (`plugins/panel-traces`)

- Under every assistant message: `model · tokens · cost · latency` + **View trace** `web/src/App.tsx:642` → side panel `App.tsx:900` waterfall `TraceSpan` bars, attributes, raw JSON, **Copy**.
- **Traces** page `App.tsx:852` `GET /api/traces` `server/src/app.ts:318` table `time/conversation/model/mode/status/tokens/cost/latency`, filters/search, **Open/Delete/Export JSON|OTLP/Replay** `server/src/app.ts:354` (replay opens Phase 7 `mode:replay` pre-filled).

## Exporter (`plugins/tracer-otlp`)

`Runtime.exportOtlp` `trace.ts:201` maps `Run/TraceSpan` to OTel `gen_ai.*` and POSTs OTLP/HTTP JSON to `settings.tracing.otlpEndpoint` `settings.ts:23`. Off by default.

## Tests

`packages/telemetry/tests/trace.test.ts:1` spy provider → span, `error/abort` finalises, `redact` removes `sk-or-`, `sweep` deletes, `exportJson` valid, UI shows failed run. `GET /api/traces` after `ok/cancelled/error` → 3 statuses, no `sk-or-` in stored JSON.
