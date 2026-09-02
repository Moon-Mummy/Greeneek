// @ts-nocheck
// @ts-ignore
import type { Plugin, ToolSpec } from "../../plugin";
// @ts-ignore
import manifest from "./manifest.json";

export const toolBasic: Plugin = {
  manifest: manifest as unknown as Plugin["manifest"],
  async init(ctx: any) {
    const tools: ToolSpec[] = [
      {
        name: "current_time",
        description: "Get current time",
        parameters: { type: "object", properties: {} },
        async execute() {
          return new Date().toISOString();
        },
      },
      {
        name: "calculator",
        description: "Evaluate expression",
        parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
        async execute(args) {
          const expr = String(args.expression ?? "");
          // Safe eval via Function (demo only)
          try {
            const val = Function(`"use strict"; return (${expr})`)();
            return String(val);
          } catch (e) {
            return `error: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      },
    ];
    for (const t of tools) ctx.registry.registerTool(t);
    ctx.registry.registerMiddleware({
      onBeforeToolCall(call) {
        const c = call as { name?: string };
        if (c.name === "calculator") return { allow: true };
        return { allow: true };
      },
    });
    ctx.logger.info("basic tools registered");
  },
};
export default toolBasic;
