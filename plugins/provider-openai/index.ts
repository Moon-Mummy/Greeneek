import type { Plugin } from "@greeneek/base/plugin";
import manifest from "./manifest.json";
export const providerOpenAI: Plugin = {
  manifest: manifest as unknown as Plugin["manifest"],
  async init(ctx) {
    ctx.registry.registerProvider({
      id: "openai",
      label: "OpenAI",
      create: () => {
        const { OpenAICompatibleAdapter } = require("@greeneek/adapters") as typeof import("@greeneek/adapters");
        return new OpenAICompatibleAdapter({ apiKey: ctx.secrets.get("OPENAI_API_KEY") });
      },
    });
    ctx.logger.info("openai provider registered");
  },
};
export default providerOpenAI;
