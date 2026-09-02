import type { Plugin } from "@greeneek/base/plugin";
import manifest from "./manifest.json";
import { MODES } from "@greeneek/core";
export const modeDryRun: Plugin = {
  manifest: manifest as unknown as Plugin["manifest"],
  async init(ctx) {
    const m = MODES.find((x: any) => x.id === "dry-run");
    if (m) ctx.registry.registerMode({ id: m.id, label: m.label, description: m.description, capabilities: m.capabilities });
  },
};
export default modeDryRun;
