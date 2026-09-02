import { buildBundle } from "@greeneek/base";
import { AgentLoop } from "@greeneek/core";
import { createAdapter } from "@greeneek/adapters";

/**
 * ACP-style editor integration server (Agent Client Protocol surface).
 *
 * Accepts JSON-RPC over stdio with initialize / session/prompt methods —
 * the minimal protocol a Claude Code-compatible editor client expects. The
 * agent loop lives behind the same base bundle as every other profile.
 */
export class AcpServer {
  constructor(private bundle = buildBundle({ profile: "acp" })) {}

  async handle(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case "initialize":
        return { protocolVersion: 1, capabilities: { prompt: true }, name: "Greeneek", version: "0.1.0" };
      case "session/prompt": {
        const task = String(params.prompt ?? params.task ?? "");
        let output = "";
        const loop = new AgentLoop({
          adapter: createAdapter(this.bundle.harness, this.bundle.secrets),
          registry: this.bundle.registry,
          prompt: this.bundle.prompt,
          telemetry: this.bundle.telemetry,
          sessionId: this.bundle.sessionLog.sessionId,
          secrets: this.bundle.secrets,
          onEvent: (e) => {
            if (e.type === "assistant/stream") output += (e.data as { delta: string }).delta;
          },
        });
        await loop.run(task);
        return { response: output };
      }
      default:
        return { error: `unknown method: ${method}` };
    }
  }
}

if (require.main === module) {
  const server = new AcpServer();
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line) as { id?: number; method: string; params?: Record<string, unknown> };
        void server.handle(msg.method, msg.params ?? {}).then((result) => {
          process.stdout.write(`${JSON.stringify({ id: msg.id, result })}\n`);
        });
      } catch {
        process.stdout.write(`${JSON.stringify({ error: "bad request" })}\n`);
      }
    }
  });
}
