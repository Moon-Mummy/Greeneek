import { buildBundle } from "@greeneek/base";
import { AgentLoop } from "@greeneek/core";
import { createAdapter } from "@greeneek/adapters";

/**
 * Headless one-shot runner: no server; run a single task from CI or cron.
 *
 *   node apps/headless/dist/index.js "task text"
 */
export async function runHeadless(task: string, options: { profile?: "headless" } = {}): Promise<{ ok: boolean; output: string }> {
  const bundle = buildBundle({ profile: options.profile ?? "headless" });
  let lastDelta = "";
  const loop = new AgentLoop({
    adapter: createAdapter(bundle.harness, bundle.secrets),
    registry: bundle.registry,
    prompt: bundle.prompt,
    telemetry: bundle.telemetry,
    sessionId: bundle.sessionLog.sessionId,
    secrets: bundle.secrets,
    onEvent: (e) => {
      if (e.type === "assistant/stream") lastDelta += (e.data as { delta: string }).delta;
    },
  });
  await loop.run(task);
  return { ok: true, output: lastDelta };
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
