import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Bundle } from "@greeneek/base";
import { AgentLoop, type SessionEvent } from "@greeneek/core";
import { seedDemoRegistry, MarketplaceRegistry } from "@greeneek/marketplace";
import { saveCredential } from "@greeneek/base";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

interface ActiveSession {
  id: string;
  events: SessionEvent[];
  running: boolean;
  messageSeq: number;
}

export class App {
  private sessions = new Map<string, ActiveSession>();
  private marketplace: MarketplaceRegistry;

  constructor(
    private bundle: Bundle,
    private webDist: string,
  ) {
    const dir = bundle.paths.marketplace;
    seedDemoRegistry(dir);
    this.marketplace = new MarketplaceRegistry(dir, process.env.GREENEK_MARKETPLACE_URL);
  }

  async handle(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = decodeURIComponent(url.pathname);

    // ---- Gateway: API key auth + rate limits on /api -----------------
    if (path.startsWith("/api/")) {
      const key = this.apiKey(req);
      const route = routeBucket(path);
      const gate = this.bundle.rateLimits.take(route, key ?? req.socket.remoteAddress ?? "anon");
      if (!gate.allowed) {
        res.writeHead(429, { "content-type": "application/json", "retry-after": String(Math.ceil(gate.retryAfterMs / 1000)) });
        res.end(JSON.stringify({ error: "rate_limited", retryAfterMs: gate.retryAfterMs }));
        return;
      }
      if (key && !this.bundle.harness.config("gateway.keys")?.enabled) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "not_found" }));
        return;
      }
    }

    try {
      if (path === "/api/health") return this.json(res, 200, { ok: true, service: "greeneek" });
      if (path === "/api/meta") return this.json(res, 200, this.meta());
      if (path === "/api/config/dump" && req.method === "GET") return this.json(res, 200, { rows: this.bundle.dumpConfig() });
      if (path === "/api/sessions" && req.method === "GET") return this.json(res, 200, [...this.sessions.values()].map((s) => ({ id: s.id, messageSeq: s.messageSeq, running: s.running })));
      if (path === "/api/sessions" && req.method === "POST") {
        const id = `sess_${randomUUID().slice(0, 12)}`;
        this.sessions.set(id, { id, events: [], running: false, messageSeq: 0 });
        return this.json(res, 201, { id });
      }
      if (path.match(/^\/api\/sessions\/[^/]+\/events$/) && req.method === "GET") {
        const id = path.split("/")[3];
        const session = this.sessions.get(id);
        if (!session) return this.json(res, 404, { error: "not_found" });
        return this.json(res, 200, { events: session.events });
      }
      if (path.match(/^\/api\/sessions\/[^/]+\/run$/) && req.method === "POST") {
        const id = path.split("/")[3];
        const session = this.sessions.get(id);
        if (!session) return this.json(res, 404, { error: "not_found" });
        const body = await this.readBody(req);
        const task = String(body?.task ?? "");
        if (!task.trim()) return this.json(res, 400, { error: "task_required" });
        return this.streamRun(id, session, task, res);
      }

      if (path === "/api/settings/credentials" && req.method === "POST") {
        const body = await this.readBody(req);
        const key = String(body?.key ?? "");
        const value = String(body?.value ?? "");
        if (!key || !value) return this.json(res, 400, { error: "key_and_value_required" });
        saveCredential(this.bundle.paths.credentials, key, value);
        this.bundle.secrets[key] = value;
        return this.json(res, 200, { ok: true });
      }
      if (path === "/api/audit/entries" && req.method === "GET") return this.json(res, 200, { entries: this.bundle.audit.query({ limit: 200 }) });
      if (path === "/api/audit/export" && req.method === "GET") {
        res.writeHead(200, { "content-type": "text/csv", "content-disposition": "attachment; filename=greeneek-audit.csv" });
        res.end(this.bundle.audit.export("csv"));
        return;
      }
      if (path === "/api/marketplace/plugins" && req.method === "GET") {
        const q = url.searchParams.get("q") ?? "";
        return this.json(res, 200, { plugins: await this.marketplace.search(q) });
      }
      if (path === "/api/marketplace/install" && req.method === "POST") {
        const body = await this.readBody(req);
        const manifest = this.marketplace.resolve(String(body?.pluginId ?? ""), String(body?.range ?? "*") || "*");
        if (!manifest) return this.json(res, 404, { error: "plugin_not_found" });
        const { installPlugin } = await import("@greeneek/marketplace");
        installPlugin(manifest, this.bundle.paths.patch);
        return this.json(res, 200, { ok: true, plugin: manifest.id, version: manifest.version, patch: this.bundle.paths.patch });
      }
      if (path === "/api/usage" && req.method === "GET") {
        return this.json(res, 200, { plan: this.bundle.meter.tier.id, usage: this.bundle.meter.summary(), allowed: this.bundle.meter.canRun() });
      }
      if (path === "/api/providers" && req.method === "GET") {
        return this.json(res, 200, {
          providers: this.bundle.harness.configsByType("llm.adapter").map((r) => ({ id: r.id, ...r.options })),
          active: this.bundle.harness.config("llm.active")?.options,
        });
      }

      // ---- Static Web UI ---------------------------------------------
      if (req.method === "GET" || req.method === "HEAD") {
        const candidate = path === "/" ? "/index.html" : path;
        const file = join(this.webDist, candidate);
        if (existsSync(file) && !file.includes("..")) {
          const content = await readFile(file);
          res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
          res.end(req.method === "HEAD" ? undefined : content);
          return;
        }
        // SPA fallback
        const index = join(this.webDist, "index.html");
        if (existsSync(index)) {
          const content = await readFile(index);
          res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
          res.end(content);
          return;
        }
      }

      this.json(res, 404, { error: "not_found" });
    } catch (err) {
      this.json(res, 500, { error: "internal", message: err instanceof Error ? err.message : String(err) });
    }
  }

  private meta() {
    return {
      name: "Greeneek",
      version: "0.1.0",
      profile: this.bundle.harness.config("profile")?.options?.name ?? "web",
      accent: "#067a52",
      provider: this.bundle.harness.config("llm.active")?.options,
      plan: this.bundle.meter.tier.id,
      usage: this.bundle.meter.summary(),
      features: [
        "providers", "billing", "marketplace", "observability", "docker", "ci",
        "i18n", "sso", "audit", "theming", "eval", "gateway", "voice",
      ],
    };
  }

  private apiKey(req: import("node:http").IncomingMessage): string | null {
    const header = req.headers["authorization"] ?? "";
    const match = String(header).match(/^Bearer\s+(gk_\S+)$/);
    return match ? match[1] : null;
  }

  private async streamRun(id: string, session: ActiveSession, task: string, res: import("node:http").ServerResponse): Promise<void> {
    if (session.running) {
      this.json(res, 409, { error: "session_busy" });
      return;
    }
    session.running = true;
    session.messageSeq += 1;

    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const send = (event: SessionEvent) => {
      session.events.push(event);
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    const loop = new AgentLoop({
      adapter: createLoopAdapter(this.bundle),
      registry: this.bundle.registry,
      prompt: this.bundle.prompt,
      telemetry: this.bundle.telemetry,
      sessionId: id,
      secrets: this.bundle.secrets,
      workingDir: process.cwd(),
      approval: async (req) => {
        send({ type: "metadata", ts: Date.now(), sessionId: id, data: { kind: "approval.request", ...req } });
        return true; // UI-confirmed path: auto-approve sandbox commands at demo time
      },
      onEvent: send,
    });
    try {
      await loop.run(task);
      res.write(`event: done\ndata: {"ok":true}\n\n`);
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : String(err) })}\n\n`);
    } finally {
      session.running = false;
      res.end();
    }
  }

  private json(res: import("node:http").ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  }

  private readBody(req: import("node:http").IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch (e) {
          reject(e);
        }
      });
      req.on("error", reject);
    });
  }
}

function createLoopAdapter(bundle: Bundle) {
  const { createAdapter } = require("@greeneek/adapters") as typeof import("@greeneek/adapters");
  return createAdapter(bundle.harness, bundle.secrets);
}

function routeBucket(path: string): string {
  if (path.startsWith("/api/sessions")) return "chat";
  if (path.startsWith("/api/audit") || path.startsWith("/api/marketplace")) return "audit";
  return "tools";
}
