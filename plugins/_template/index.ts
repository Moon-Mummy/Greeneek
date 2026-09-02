import type { Plugin } from "@greeneek/base/plugin";
import manifest from "./manifest.json";

export const templatePlugin: Plugin = {
  manifest: manifest as unknown as Plugin["manifest"],
  async init(ctx) {
    ctx.registry.registerTool({
      name: "hello_world",
      description: "Hello world tool from template",
      parameters: { type: "object", properties: { name: { type: "string" } } },
      async execute(args) {
        const greeting = (ctx.settings.get("greeting") as string | undefined) ?? "Hello";
        return `${greeting}, ${String(args.name ?? "world")}!`;
      },
    });
    ctx.registry.registerMiddleware({
      onRunStart(run) {
        ctx.logger.info(`template saw run start ${JSON.stringify(run).slice(0,80)}`);
      },
    });
    ctx.logger.info("template plugin registered");
  },
  async dispose() {
    // cleanup
  },
};
export default templatePlugin;
