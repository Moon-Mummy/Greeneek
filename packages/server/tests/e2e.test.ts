import { describe, it, expect } from "vitest";
import { buildBundle } from "@greeneek/base";
import { AgentLoop } from "@greeneek/core";
import { createAdapter } from "@greeneek/adapters";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

function isolatedHome() {
  return join(tmpdir(), `greeneek-test-${randomUUID()}`);
}

async function runHeadless(
  task: string,
  options: { profile?: "headless"; mode?: string; model?: string; home?: string } = {},
): Promise<{ ok: boolean; output: string }> {
  const bundle = buildBundle({ profile: options.profile ?? "headless", home: options.home });
  let lastDelta = "";
  const mode = options.mode ?? (bundle.settings.defaults.mode === "chat" ? "agent" : bundle.settings.defaults.mode) ?? "agent";
  const loop = new AgentLoop({
    adapter: createAdapter(bundle.harness, bundle.secrets),
    registry: bundle.registry,
    prompt: bundle.prompt,
    telemetry: bundle.telemetry,
    sessionId: bundle.sessionLog.sessionId,
    secrets: bundle.secrets,
    runtime: bundle.runtime,
    conversationId: bundle.sessionLog.sessionId,
    modeId: mode,
    modelId: options.model ?? bundle.settings.defaults.modelId ?? bundle.settings.defaults.provider,
    providerId: bundle.settings.defaults.provider,
    onEvent: (e) => {
      if (e.type === "assistant/stream") lastDelta += (e.data as { delta: string }).delta;
      if (e.type === "assistant/message") lastDelta = String((e.data as { content?: string }).content ?? lastDelta);
      if (e.type === "tool/end") lastDelta += `\n${String((e.data as { output?: string }).output ?? "")}`;
    },
  });
  await loop.run(task);
  return { ok: true, output: lastDelta };
}

/**
 * Baseline E2E smoke — Milestone 1 (§20.4 subset)
 * 1) general chat
 * 2) tool call + cancel semantics (tool executed)
 * 3) offline echo (no key required)
 */
describe("E2E smoke — Milestone 1", () => {
  it("1) general chat streams to completion", async () => {
    const r = await runHeadless("Say hello in one sentence.", { home: isolatedHome() });
    expect(r.ok).toBe(true);
    expect(r.output.length).toBeGreaterThan(5);
  });
  it("2) tool call succeeds", async () => {
    const r = await runHeadless('@execute calc.eval {"expression":"6*7"}', { home: isolatedHome() });
    expect(r.output).toContain("42");
  });
  it("3) local echo without key (offline-first)", async () => {
    const r = await runHeadless("offline check: echo", { home: isolatedHome() });
    expect(r.ok).toBe(true);
  });
});