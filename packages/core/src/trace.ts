import { randomUUID } from "node:crypto";

export interface Run {
  runId: string;
  traceId: string;
  conversationId?: string;
  messageId?: string;
  modeId: string;
  modelId: string;
  providerId: string;
  startedAt: string;
  endedAt?: string;
  status: "running" | "ok" | "error" | "cancelled";
  usage?: { promptTokens: number; completionTokens: number; costUsd?: number };
  latencyMs?: number;
  ttftMs?: number;
  error?: { kind: string; message: string };
  trigger: "user" | "regenerate" | "replay" | "background";
}

export interface TraceSpan {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  runId: string;
  kind: "run" | "llm.request" | "llm.stream" | "tool.call" | "plugin.hook" | "mode.step" | "storage" | "retry";
  name: string;
  startedAt: string;
  endedAt?: string;
  status: "ok" | "error" | "cancelled";
  attributes: Record<string, unknown>;
  events: Array<{ ts: string; name: string; attrs?: Record<string, unknown> }>;
}

export interface RunSpec {
  conversationId?: string;
  messageId?: string;
  modeId: string;
  modelId: string;
  providerId: string;
  trigger: Run["trigger"];
  metadata?: Record<string, unknown>;
}

export type RunEvent =
  | { type: "assistant.delta"; text: string }
  | { type: "assistant.done"; finishReason: string }
  | { type: "tool.request"; name: string; arguments: Record<string, unknown> }
  | { type: "tool.result"; name: string; output: string; durationMs: number }
  | { type: "usage"; promptTokens: number; completionTokens: number; costUsd?: number }
  | { type: "error"; kind: string; message: string };

function redactSecrets(input: string): string {
  return input.replace(/sk-or-[a-zA-Z0-9_-]+/g, "sk-or-****").replace(/sk-[a-zA-Z0-9]{20,}/g, "sk-****").replace(/Bearer\s+sk-[^\s"']+/gi, "Bearer sk-****");
}
function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (/api[_-]?key|secret|token/i.test(k) && typeof v === "string" && v) out[k] = "****";
    else if (v && typeof v === "object" && !Array.isArray(v)) out[k] = redactObject(v as Record<string, unknown>);
    else if (typeof v === "string") out[k] = redactSecrets(v);
    else out[k] = v;
  }
  return out;
}

/**
 * Runtime gateway — the ONLY way to call a provider.
 */
export class Runtime {
  constructor(
    private store: TraceStore,
    private settings: {
      tracing: { enabled: boolean; storePrompts: boolean; redactPatterns: string[]; retentionDays: number; maxSizeMB: number; otlpEndpoint?: string; exportPath?: string };
      advanced: { requestTimeoutMs: number; streamIdleTimeoutMs: number };
    },
  ) {}

  async *execute(
    spec: RunSpec,
    fn: (ctx: { runId: string; traceId: string; signal: AbortSignal }) => AsyncIterable<RunEvent>,
    signal?: AbortSignal,
  ): AsyncIterable<RunEvent> {
    if (!this.settings.tracing.enabled) {
      yield* fn({ runId: randomUUID(), traceId: randomUUID(), signal: signal ?? new AbortController().signal });
      return;
    }
    const runId = randomUUID();
    const traceId = randomUUID();
    const startedAt = new Date().toISOString();
    const run: Run = {
      runId,
      traceId,
      conversationId: spec.conversationId,
      messageId: spec.messageId,
      modeId: spec.modeId,
      modelId: spec.modelId,
      providerId: spec.providerId,
      startedAt,
      status: "running",
      trigger: spec.trigger,
    };
    const rootSpan: TraceSpan = {
      spanId: randomUUID(),
      traceId,
      runId,
      kind: "run",
      name: "run",
      startedAt,
      status: "ok",
      attributes: this.redact({ ...spec, runId, traceId }),
      events: [],
    };
    let ttft: number | undefined;
    const start = Date.now();
    let firstChunk = true;
    let usage: Run["usage"] | undefined;
    let error: Run["error"] | undefined;
    let status: Run["status"] = "ok";
    this.store.appendRun({ ...run });
    this.store.appendSpan({ ...rootSpan });
    const onAbort = () => {
      status = "cancelled";
      error = { kind: "cancelled", message: "aborted" };
    };
    signal?.addEventListener("abort", onAbort);
    try {
      for await (const ev of fn({ runId, traceId, signal: signal ?? new AbortController().signal })) {
        if (firstChunk) {
          ttft = Date.now() - start;
          firstChunk = false;
        }
        if (ev.type === "usage") usage = { promptTokens: ev.promptTokens, completionTokens: ev.completionTokens, costUsd: ev.costUsd };
        else if (ev.type === "error") {
          error = { kind: ev.kind, message: ev.message };
          status = "error";
        }
        rootSpan.events.push({ ts: new Date().toISOString(), name: ev.type, attrs: this.redact(ev as unknown as Record<string, unknown>) });
        yield ev;
        if (signal?.aborted) {
          status = "cancelled";
          break;
        }
      }
      if (signal?.aborted && status !== "error") {
        status = "cancelled";
        error = { kind: "cancelled", message: "aborted" };
      }
    } catch (e) {
      const err = e as Error & { kind?: string };
      status = "error";
      error = { kind: err.kind ?? "unknown", message: err.message ?? String(e) };
      rootSpan.status = "error";
      rootSpan.events.push({ ts: new Date().toISOString(), name: "error", attrs: this.redact({ message: error.message, kind: error.kind }) });
      yield { type: "error", kind: error.kind, message: error.message } as RunEvent;
    } finally {
      signal?.removeEventListener("abort", onAbort);
      const endedAt = new Date().toISOString();
      const latencyMs = Date.now() - start;
      const finalRun: Run = { ...run, endedAt, status, usage, latencyMs, ttftMs: ttft, error };
      const finalSpan: TraceSpan = { ...rootSpan, endedAt, status: status === "ok" ? "ok" : status === "cancelled" ? "cancelled" : "error", attributes: { ...rootSpan.attributes, latencyMs, ttftMs: ttft, status, usage, error } };
      this.store.appendRun(finalRun);
      this.store.appendSpan(finalSpan);
      if (this.settings.tracing.otlpEndpoint) {
        try {
          await this.exportOtlp(finalRun, finalSpan);
        } catch (e) {
          console.warn(`[greeneek:trace] otlp export failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
  }

  private redact(obj: Record<string, unknown>): Record<string, unknown> {
    const patterns = this.settings.tracing.redactPatterns ?? [];
    let out = redactObject(obj);
    for (const pat of patterns) {
      try {
        const re = new RegExp(pat, "gi");
        const str = JSON.stringify(out);
        const redacted = str.replace(re, "***");
        out = JSON.parse(redacted);
      } catch {}
    }
    if (!this.settings.tracing.storePrompts) {
      const str = JSON.stringify(out);
      const redacted = str.replace(/"(content|prompt|text)"\s*:\s*"([^"]{20,})"/g, (_m, k, v: string) => `"${k}":"hash:${v.length}:${v.slice(0, 8)}"`);
      try {
        out = JSON.parse(redacted);
      } catch {}
    }
    const json = JSON.stringify(out);
    const redacted = redactSecrets(json);
    try {
      return JSON.parse(redacted);
    } catch {
      return out;
    }
  }

  private async exportOtlp(run: Run, span: TraceSpan): Promise<void> {
    const endpoint = this.settings.tracing.otlpEndpoint;
    if (!endpoint) return;
    const body = {
      resourceSpans: [
        {
          resource: { attributes: [{ key: "service.name", value: { stringValue: "greeneek" } }] },
          scopeSpans: [
            {
              scope: { name: "greeneek.trace" },
              spans: [
                {
                  traceId: span.traceId.replace(/-/g, "").slice(0, 32).padEnd(32, "0"),
                  spanId: span.spanId.replace(/-/g, "").slice(0, 16).padEnd(16, "0"),
                  name: span.name,
                  kind: 1,
                  startTimeUnixNano: BigInt(new Date(span.startedAt).getTime()) * 1000000n,
                  endTimeUnixNano: BigInt(new Date(span.endedAt ?? span.startedAt).getTime()) * 1000000n,
                  attributes: [
                    { key: "gen_ai.system", value: { stringValue: run.providerId } },
                    { key: "gen_ai.request.model", value: { stringValue: run.modelId } },
                    { key: "gen_ai.usage.prompt_tokens", value: { intValue: run.usage?.promptTokens ?? 0 } },
                    { key: "gen_ai.usage.completion_tokens", value: { intValue: run.usage?.completionTokens ?? 0 } },
                  ],
                  status: { code: run.status === "ok" ? 1 : 2, message: run.error?.message ?? "" },
                },
              ],
            },
          ],
        },
      ],
    };
    const text = JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: text });
  }
}

export interface TraceStore {
  appendRun(run: Run): void;
  appendSpan(span: TraceSpan): void;
  queryRuns(filter: { conversationId?: string; modelId?: string; status?: string; limit?: number }): Run[];
  querySpans(runId: string): TraceSpan[];
  exportJson(): string;
  clear(): void;
}
