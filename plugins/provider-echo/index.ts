import type { Plugin } from "@greeneek/base/plugin";
import manifest from "./manifest.json";
export const providerEcho: Plugin = {
  manifest: manifest as unknown as Plugin["manifest"],
  async init(ctx) {
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
