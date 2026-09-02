// @ts-nocheck
// @ts-ignore
import type { Plugin } from "../../plugin";
// @ts-ignore
import manifest from "./manifest.json";
export const tracerLocal: Plugin = {
  manifest: manifest as unknown as Plugin["manifest"],
  async init(ctx: any) {
    ctx.registry.registerTracerExporter({ id: "local", type: "jsonl" });
    ctx.registry.registerMiddleware({
      onRunStart(run) {
        ctx.logger.debug(`run start ${JSON.stringify(run).slice(0,120)}`);
      },
      onRunEnd(run) {
        ctx.logger.debug(`run end ${JSON.stringify(run).slice(0,120)}`);
      },
    });
    ctx.logger.info("local tracer registered");
  },
};
export default tracerLocal;
