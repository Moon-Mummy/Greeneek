import { spawn } from "node:child_process";
import type { HarnessTool, ToolContext } from "@greeneek/core";

/**
 * Shell tool. RequireApproval=true: the guarded pipeline blocks it by default;
 * flip `GREENEK_AUTO_APPROVE=1` or wire an approval hook to allow it.
 */
export function registerShellTool(registry: { register(t: HarnessTool): void }): void {
  registry.register({
    definition: {
      name: "shell.run",
      description: "Run a shell command in the workspace sandbox. Approval-gated.",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      requireApproval: true,
    },
    async execute(args, ctx) {
      const command = String(args.command ?? "");
      const out = await runCommand(command, ctx);
      return out;
    },
  });
}

function runCommand(command: string, ctx: ToolContext): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("/bin/sh", ["-c", command], {
      cwd: ctx.workingDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    const cap = (buf: Buffer, target: "stdout" | "stderr") => {
      const piece = buf.toString("utf8");
      if (target === "stdout") stdout += piece;
      else stderr += piece;
      if (stdout.length > 200_000) stdout = stdout.slice(0, 200_000);
      if (stderr.length > 50_000) stderr = stderr.slice(0, 50_000);
    };
    child.stdout.on("data", (b: Buffer) => cap(b, "stdout"));
    child.stderr.on("data", (b: Buffer) => cap(b, "stderr"));
    child.on("error", reject);
    child.on("close", (code) => {
      const banner = `exit ${code ?? "?"}`;
      resolvePromise([banner, stdout.trim(), stderr.trim()].filter(Boolean).join("\n"));
    });
  });
}
