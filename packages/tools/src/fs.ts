import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import type { HarnessTool, ToolContext } from "@greeneek/core";

function safePath(ctx: ToolContext, p: string): string {
  const root = resolve(ctx.workingDir);
  const target = resolve(root, p);
  const rel = relative(root, target);
  if (rel.startsWith("..") || rel.startsWith("/")) {
    throw new Error(`Path escapes the workspace sandbox: ${p}`);
  }
  return target;
}

export function registerFsTools(registry: { register(t: HarnessTool): void }): void {
  registry.register({
    definition: {
      name: "fs.read_file",
      description: "Read a file inside the workspace sandbox.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
    },
    async execute(args, ctx) {
      const path = safePath(ctx, String(args.path ?? ""));
      const content = await readFile(path, "utf8");
      return content.length > 60_000 ? content.slice(0, 60_000) + "\n…(truncated)" : content;
    },
  });

  registry.register({
    definition: {
      name: "fs.write_file",
      description: "Write a file inside the workspace sandbox (creates directories).",
      parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] },
    },
    async execute(args, ctx) {
      const path = safePath(ctx, String(args.path ?? ""));
      await mkdir(resolve(path, ".."), { recursive: true });
      await writeFile(path, String(args.content ?? ""), "utf8");
      return `Wrote ${path} (${String(args.content ?? "").length} bytes).`;
    },
  });

  registry.register({
    definition: {
      name: "fs.list_dir",
      description: "List entries of a directory inside the workspace sandbox.",
      parameters: { type: "object", properties: { path: { type: "string" } }, required: [] },
    },
    async execute(args, ctx) {
      const path = safePath(ctx, String(args.path ?? "."));
      const entries = await readdir(path, { withFileTypes: true });
      return entries.map((e) => `${e.isDirectory() ? "d" : "f"}  ${e.name}`).sort().join("\n") || "(empty)";
    },
  });

  void join;
}
