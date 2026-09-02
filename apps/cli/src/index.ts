#!/usr/bin/env node
import { buildBundle } from "@greeneek/base";
import { serve } from "@greeneek/server";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (name: string, fallback?: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

async function main(): Promise<void> {
  const profile = (flag("--profile") ?? "web") as "web" | "headless" | "sdk" | "acp";
  const port = Number(flag("--port", "3080"));

  if (args.includes("--dump-config") || args[0] === "dump-config") {
    const bundle = buildBundle({ profile });
    console.log(JSON.stringify({ profile, rows: bundle.dumpConfig() }, null, 2));
    return;
  }

  const command = args[0] && !args[0].startsWith("-") ? args[0] : "help";

  if (command === "web" || command === "serve") {
    const { server, port: bound } = await serve({
      profile,
      port,
      webDist: join(process.cwd(), "packages", "web", "dist"),
    });
    console.log(`Greeneek web UI listening on http://127.0.0.1:${bound} (profile=${profile})`);
    const shutdown = () => server.close(() => process.exit(0));
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return;
  }

  if (command === "run") {
    const mode = flag("--mode");
    const model = flag("--model");
    const input = flag("--input");
    const out = flag("--out");
    if (input && out) {
      const { runBatch } = await import("@greeneek/headless");
      await runBatch(input, out, { mode, model });
      console.log(`Batch done: ${input} → ${out}`);
      return;
    }
    const bundle = buildBundle({ profile });
    const { AgentLoop } = await import("@greeneek/core");
    const { createAdapter } = await import("@greeneek/adapters");
    const task = flag("--task") ?? args[1] ?? "Explain what Greeneek is in two sentences.";
    const loop = new AgentLoop({
      adapter: createAdapter(bundle.harness, bundle.secrets),
      registry: bundle.registry,
      prompt: bundle.prompt,
      telemetry: bundle.telemetry,
      sessionId: bundle.sessionLog.sessionId,
      secrets: bundle.secrets,
      runtime: bundle.runtime,
      conversationId: bundle.sessionLog.sessionId,
      modeId: mode ?? bundle.settings.defaults.mode ?? "chat",
      modelId: model ?? bundle.settings.defaults.modelId ?? bundle.settings.defaults.provider,
      providerId: bundle.settings.defaults.provider,
      onEvent: (e) => {
        if (e.type === "assistant/stream") process.stdout.write((e.data as { delta: string }).delta);
        if (e.type === "tool/end") {
          const d = e.data as { name: string; ok: boolean; durationMs: number };
          process.stdout.write(`\n[${d.name} ${d.ok ? "ok" : "fail"} ${d.durationMs}ms]\n`);
        }
      },
    });
    await loop.run(task);
    process.stdout.write("\n");
    return;
  }

  console.log(`greeneek — the surgeon's toolkit for AI agents

Usage:
  greeneek web [--port 3080] [--profile web]
  greeneek --profile web --dump-config
  greeneek run "task..." [--profile headless]
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
