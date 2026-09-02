import type { Plugin } from "../../plugin";
import manifest from "./manifest.json";
import { MODES } from "@greeneek/core";
export const modeAgent: Plugin = {
  manifest: manifest as unknown as Plugin["manifest"],
  async init(ctx) {
    const m = MODES.find((x: any) => x.id === "agent");
    if (m) ctx.registry.registerMode({ id: m.id, label: m.label, description: m.description, capabilities: m.capabilities });
  },
};
export default modeAgent;
