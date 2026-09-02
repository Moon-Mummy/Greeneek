// @ts-nocheck
// @ts-ignore
import type { Plugin } from "../../plugin";
// @ts-ignore
import manifest from "./manifest.json";

export const providerOpenRouter: Plugin = {
  manifest: manifest as unknown as Plugin["manifest"],
  async init(ctx: any) {
    // Provider is registered via the bundle's createAdapter seam; this plugin
    // documents the capability and enforces permissions. The actual adapter
    // lives in @greeneek/adapters (OpenRouterAdapter) and is instantiated per-request.
    ctx.registry.registerProvider({
      id: "openrouter",
      label: "OpenRouter",
      create: () => {
        // Lazy import to avoid circular init
        const { OpenRouterAdapter } = require("@greeneek/adapters") as typeof import("@greeneek/adapters");
        const apiKey = ctx.secrets.get("OPENROUTER_API_KEY") ?? ctx.secrets.get("OPENAI_API_KEY");
        return new OpenRouterAdapter({ apiKey, baseUrl: "https://openrouter.ai/api/v1" });
      },
    });
    ctx.logger.info("openrouter provider registered");
  },
};
export default providerOpenRouter;
