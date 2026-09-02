import { buildBundle } from "@greeneek/base";
import { AgentLoop } from "@greeneek/core";
import { createAdapter } from "@greeneek/adapters";

/**
 * Headless one-shot runner: no server; run a single task from CI or cron.
 *
 *   node apps/headless/dist/index.js "task text"
 */
export async function runHeadless(
  task: string,
  options: { profile?: "headless"; mode?: string; model?: string } = {},
): Promise<{ ok: boolean; output: string }> {
  const bundle = buildBundle({ profile: options.profile ?? "headless" });
  let lastDelta = "";
  // Headless defaults to agent so tool calls like calc.eval work in the smoke test
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

export async function runBatch(input: string, output: string, options: { mode?: string; model?: string } = {}): Promise<void> {
  const fs = await import("node:fs");
  const lines = fs.readFileSync(input, "utf8").split("\n").filter(Boolean);
  const out: unknown[] = [];
  for (const line of lines) {
    const obj = JSON.parse(line) as { task: string; model?: string; mode?: string };
    const res = await runHeadless(obj.task, { mode: obj.mode ?? options.mode, model: obj.model ?? options.model });
    out.push({ task: obj.task, output: res.output });
  }
  fs.writeFileSync(output, out.map((o) => JSON.stringify(o)).join("\n") + "\n", "utf8");
}

if (require.main === module) {
  const task = process.argv[2];
  if (!task) {
    console.error("usage: greeneek-headless \"task\"");
    process.exit(2);
  }
  runHeadless(task).then((r) => {
    console.log(r.output);
    process.exit(0);
  });
}
