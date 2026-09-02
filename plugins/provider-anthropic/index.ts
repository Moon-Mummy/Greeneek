import type { Plugin } from "@greeneek/base/plugin";
import manifest from "./manifest.json";
export const providerAnthropic: Plugin = {
  manifest: manifest as unknown as Plugin["manifest"],
  async init(ctx) {
    ctx.registry.registerProvider({
      id: "anthropic",
      label: "Anthropic",
      create: () => {
        const { AnthropicAdapter } = require("@greeneek/adapters") as typeof import("@greeneek/adapters");
        return new AnthropicAdapter({ apiKey: ctx.secrets.get("ANTHROPIC_API_KEY") });
      },
    });
    ctx.logger.info("anthropic provider registered");
  },
};
export default providerAnthropic;
