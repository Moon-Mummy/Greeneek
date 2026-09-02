// @ts-nocheck
// @ts-ignore
import type { Plugin } from "../../plugin";
// @ts-ignore
import manifest from "./manifest.json";
export const modeChat: Plugin = {
  manifest: manifest as unknown as Plugin["manifest"],
  async init(ctx: any) {
    ctx.registry.registerMode({
      id: "chat",
      label: "Chat",
      description: "Single model call, no tools",
      capabilities: { tools: false, multiStep: false, sideEffects: "none" },
    });
    ctx.logger.info("chat mode registered");
  },
};
export default modeChat;
