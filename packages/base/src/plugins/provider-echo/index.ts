// @ts-nocheck
// @ts-ignore
import type { Plugin } from "../../plugin";
// @ts-ignore
import manifest from "./manifest.json";
export const providerEcho: Plugin = {
  manifest: manifest as unknown as Plugin["manifest"],
  async init(ctx: any) {
    ctx.registry.registerProvider({
      id: "echo",
      label: "Echo",
      create: () => {
        const { EchoAdapter } = require("@greeneek/adapters") as typeof import("@greeneek/adapters");
        return new EchoAdapter();
      },
    });
    ctx.logger.info("echo provider registered");
  },
};
export default providerEcho;
