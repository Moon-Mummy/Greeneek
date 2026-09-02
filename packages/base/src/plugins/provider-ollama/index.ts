// @ts-nocheck
// @ts-ignore
import type { Plugin } from "../../plugin";
// @ts-ignore
import manifest from "./manifest.json";
export const providerOllama: Plugin = {
  manifest: manifest as unknown as Plugin["manifest"],
  async init(ctx: any) {
    ctx.registry.registerProvider({
      id: "ollama",
      label: "Ollama",
      create: () => {
        const { OllamaAdapter } = require("@greeneek/adapters") as typeof import("@greeneek/adapters");
        return new OllamaAdapter({});
      },
    });
    ctx.logger.info("ollama provider registered");
  },
};
export default providerOllama;
