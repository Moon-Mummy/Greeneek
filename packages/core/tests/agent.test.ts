import { describe, expect, it } from "vitest";
import { AgentLoop, Harness, PromptAssembly, TelemetrySeam, ToolRegistry } from "../src";
import { EchoAdapter } from "../../adapters/src";
import { registerBuiltinTools } from "../../tools/src";

function setup() {
  const harness = new Harness();
  const registry = new ToolRegistry();
  registerBuiltinTools(registry);
  registry.setPolicy("auto");
  const prompt = new PromptAssembly();
  prompt.add({ name: "test", priority: 0, content: "You are Greeneek." });
  return { harness, registry, prompt, telemetry: new TelemetrySeam() };
}

describe("agent loop", () => {
  it("completes a plain turn and emits turn/end", async () => {
    const { registry, prompt, telemetry } = setup();
    const events: string[] = [];
    const loop = new AgentLoop({
      adapter: new EchoAdapter(),
      registry,
      prompt,
      telemetry,
      sessionId: "s1",
      onEvent: (e) => events.push(e.type),
    });
    await loop.run("hello");
    expect(events[0]).toBe("session/start");
    expect(events).toContain("assistant/stream");
    expect(events).toContain("assistant/message");
    expect(events.at(-1)).toBe("session/end");
  });

  it("executes a tool call and records tool/end", async () => {
    const { registry, prompt, telemetry } = setup();
    const events: { type: string; data: unknown }[] = [];
    const loop = new AgentLoop({
      adapter: new EchoAdapter(),
      registry,
      prompt,
      telemetry,
      sessionId: "s2",
      modeId: "agent",
      onEvent: (e) => events.push({ type: e.type, data: e.data }),
    });
    await loop.run('@execute calc.eval {"expression":"(2+3)*4"}');
    const toolEnd = events.find((e) => e.type === "tool/end");
    expect(toolEnd).toBeTruthy();
    expect((toolEnd!.data as { output: string }).output).toBe("20");
  });

  it("gates approval-required tools by default", async () => {
    const { registry, prompt, telemetry } = setup();
    // Constructing the loop registers the default approval hook on this registry.
    new AgentLoop({
      adapter: new EchoAdapter(),
      registry,
      prompt,
      telemetry,
      sessionId: "s3",
      secrets: {},
    });
    const res = await registry.execute("c1", "shell.run", { command: "echo hi" }, { secrets: {}, workingDir: process.cwd(), log: () => {} });
    expect(res.ok).toBe(false);
    expect(res.output).toContain("approval");
  });
});
