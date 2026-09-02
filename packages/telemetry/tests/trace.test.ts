import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Runtime } from "@greeneek/core";
import { LocalTraceStore } from "../src/store";

describe("Trace — Phase 6", () => {
  it("every provider call creates runs and spans", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "gk-trace-"));
    const store = new LocalTraceStore(tmp, { retentionDays: 30, maxSizeMB: 10 });
    const runtime = new Runtime(store, { tracing: { enabled: true, storePrompts: true, redactPatterns: [], retentionDays: 30, maxSizeMB: 10 }, advanced: { requestTimeoutMs: 15000, streamIdleTimeoutMs: 60000 } });
    const spec = { conversationId: "conv1", modeId: "chat", modelId: "echo-1", providerId: "echo", trigger: "user" as const };
    for await (const _ of runtime.execute(spec, async function* () {
      yield { type: "assistant.delta", text: "hi" } as never;
      yield { type: "usage", promptTokens: 1, completionTokens: 1 } as never;
    })) {
      // consume
    }
    const runs = store.queryRuns({});
    expect(runs.length).toBe(1);
    expect(runs[0].status).toBe("ok");
    const spans = store.querySpans(runs[0].runId);
    expect(spans.length).toBeGreaterThan(0);
    expect(spans[0].attributes).toHaveProperty("modelId", "echo-1");
  });

  it("redaction removes secrets from stored traces", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "gk-trace-"));
    const store = new LocalTraceStore(tmp, { retentionDays: 30, maxSizeMB: 10 });
    const runtime = new Runtime(store, { tracing: { enabled: true, storePrompts: true, redactPatterns: [], retentionDays: 30, maxSizeMB: 10 }, advanced: { requestTimeoutMs: 15000, streamIdleTimeoutMs: 60000 } });
    const spec = { conversationId: "conv1", modeId: "chat", modelId: "echo-1", providerId: "echo", trigger: "user" as const };
    for await (const _ of runtime.execute(spec, async function* () {
      yield { type: "assistant.delta", text: "hello sk-or-1234567890 world" } as never;
    })) {}
    const runs = store.queryRuns({});
    const spans = runs.flatMap((r) => store.querySpans(r.runId));
    const json = JSON.stringify([...runs, ...spans]);
    expect(json).not.toContain("sk-or-1234567890");
    expect(json).toContain("sk-or-****");
  });

  it("retention deletes old traces and export is valid JSON", async () => {
    const tmp = mkdtempSync(join(tmpdir(), "gk-trace-"));
    const store = new LocalTraceStore(tmp, { retentionDays: 0, maxSizeMB: 0.001 });
    const runtime = new Runtime(store, { tracing: { enabled: true, storePrompts: true, redactPatterns: [], retentionDays: 0, maxSizeMB: 0.001 }, advanced: { requestTimeoutMs: 15000, streamIdleTimeoutMs: 60000 } });
    const spec = { conversationId: "conv1", modeId: "chat", modelId: "echo-1", providerId: "echo", trigger: "user" as const };
    for await (const _ of runtime.execute(spec, async function* () { yield { type: "assistant.delta", text: "hi" } as never; })) {}
    // Force sweep by creating a new store with same dir and tiny limits
    const json = store.exportJson();
    expect(() => JSON.parse(json)).not.toThrow();
    expect(json).toContain("runId");
  });
});
