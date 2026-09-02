import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { buildBundle, type BundleOptions } from "@greeneek/base";
import { App } from "./app";

export { App };
export { buildBundle };

export interface ServeOptions extends BundleOptions {
  port?: number;
  webDist?: string;
}

/** Boot the Greeneek web server. Binds 0.0.0.0 for container/preview use. */
export async function serve(options: ServeOptions): Promise<{ server: import("node:http").Server; port: number }> {
  const bundle = buildBundle(options);
  const app = new App(bundle, options.webDist ?? join(process.cwd(), "packages", "web", "dist"));
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void app.handle(req, res);
  });
  // Port resolved via CLI flag → Settings (PORT env) → 3080, centralised in settings.ts
  const port = options.port ?? bundle.settings.server.port ?? 3080;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", () => resolve());
  });
  return { server, port };
}
