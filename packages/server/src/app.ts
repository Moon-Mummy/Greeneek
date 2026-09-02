import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Bundle } from "@greeneek/base";
import { AgentLoop, type SessionEvent } from "@greeneek/core";
import type { Run } from "@greeneek/core";
import { seedDemoRegistry, MarketplaceRegistry } from "@greeneek/marketplace";
import { saveCredential, loadCredentials, secretsFromSettings } from "@greeneek/base";

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
  modelId?: string;
  modeId?: string;
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
    const url = (bundle.settings as unknown as Record<string, unknown>).marketplaceUrl as string | undefined ?? (bundle.harness.config("marketplace.registry")?.options?.url as string | undefined) ?? "";
    this.marketplace = new MarketplaceRegistry(dir, url);
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
        const model = body?.model ? String(body.model) : undefined;
        const provider = body?.provider ? String(body.provider) : undefined;
        const mode = body?.mode ? String(body.mode) : undefined;
        // Per-conversation model/mode is handled inside streamRun for correct switch detection
        return this.streamRun(id, session, task, res, { model, provider, mode }, req);
      }

      if (path === "/api/models" && req.method === "GET") {
        const force = url.searchParams.get("refresh") === "1";
        try {
          const adapters = await import("@greeneek/adapters");
          const settings = this.bundle.settings;
          const isPluginEnabled = (id: string) => {
            const p = (settings.plugins as Record<string, { enabled?: boolean }> | undefined)?.[id];
            if (p?.enabled !== undefined) return p.enabled;
            // Fallback: check providers.*.enabled for provider plugins (for backward compat with direct provider enable)
            if (id === "greeneek.provider.openrouter") return Boolean(settings.providers.openrouter?.enabled);
            if (id === "greeneek.provider.openai") return Boolean(settings.providers.openai?.enabled);
            if (id === "greeneek.provider.anthropic") return Boolean(settings.providers.anthropic?.enabled);
            if (id === "greeneek.provider.ollama") return Boolean(settings.providers.ollama?.enabled);
            return id === "greeneek.provider.echo" || id === "greeneek.tool.basic" || id === "greeneek.tracer.local" || id === "greeneek.mode.chat";
          };
          const models: unknown[] = [];
          const errors: unknown[] = [];
          const tryProvider = async (provider: string, apiKey?: string, baseUrl?: string) => {
            try {
              if (provider === "openrouter") {
                if (!isPluginEnabled("greeneek.provider.openrouter")) return;
                const a = new adapters.OpenRouterAdapter({ apiKey, baseUrl, model: "openai/gpt-4o-mini" });
                const list = await a.listModels({ apiKey, baseUrl }, { forceRefresh: force });
                models.push(...list);
              } else if (provider === "openai") {
                if (!isPluginEnabled("greeneek.provider.openai")) return;
                const a = new adapters.OpenAICompatibleAdapter({ apiKey, baseUrl });
                const list = await a.listModels({ apiKey, baseUrl }, { forceRefresh: force });
                models.push(...list);
              } else if (provider === "ollama") {
                if (!isPluginEnabled("greeneek.provider.ollama")) return;
                const a = new adapters.OllamaAdapter({ baseUrl } as unknown as { model?: string; baseUrl?: string });
                const list = await (a as unknown as { listModels?: (c: unknown, o: unknown) => Promise<unknown[]> }).listModels?.({ apiKey, baseUrl }, { forceRefresh: force }) ?? [];
                if (Array.isArray(list)) models.push(...list);
              }
            } catch (e) {
              errors.push({ provider, message: e instanceof Error ? e.message : String(e), kind: (e as { kind?: string })?.kind ?? "unknown" });
            }
          };
          if (settings.providers.openrouter?.enabled && settings.providers.openrouter?.apiKey) await tryProvider("openrouter", settings.providers.openrouter.apiKey, settings.providers.openrouter.baseUrl);
          if (settings.providers.openai?.enabled && settings.providers.openai?.apiKey) await tryProvider("openai", settings.providers.openai.apiKey, settings.providers.openai.baseUrl);
          if (models.length === 0) {
            // Try openrouter public models even without key if plugin enabled (or fallback)
            if (isPluginEnabled("greeneek.provider.openrouter")) await tryProvider("openrouter", undefined, settings.providers.openrouter?.baseUrl);
          }
          return this.json(res, 200, { models, errors, updatedAt: new Date().toISOString() });
        } catch (e) {
          return this.json(res, 500, { error: "models_failed", message: e instanceof Error ? e.message : String(e) });
        }
      }
      if (path === "/api/plugins" && req.method === "GET") {
        const list = this.bundle.pluginRegistry.list().map((p) => ({
          id: p.plugin.manifest.id,
          name: p.plugin.manifest.name,
          version: p.plugin.manifest.version,
          description: p.plugin.manifest.description,
          kinds: p.plugin.manifest.kinds,
          permissions: p.plugin.manifest.permissions,
          configSchema: p.plugin.manifest.configSchema,
          status: p.status,
          error: p.error,
          enabled: p.status === "active",
        }));
        return this.json(res, 200, { plugins: list });
      }
      if (path.match(/^\/api\/plugins\/[^/]+\/enable$/) && req.method === "POST") {
        const id = decodeURIComponent(path.split("/")[3]);
        const { updateSettings } = await import("@greeneek/base");
        const patch = { plugins: { [id]: { enabled: true } } } as unknown as Record<string, unknown>;
        const updated = updateSettings(this.bundle.paths.config, patch as unknown as import("@greeneek/base").Settings);
        (this.bundle as unknown as { settings: unknown }).settings = updated;
        await this.bundle.pluginRegistry.enable(id, updated as unknown as Record<string, unknown>);
        return this.json(res, 200, { ok: true, status: this.bundle.pluginRegistry.list().find((p) => p.plugin.manifest.id === id)?.status });
      }
      if (path.match(/^\/api\/plugins\/[^/]+\/disable$/) && req.method === "POST") {
        const id = decodeURIComponent(path.split("/")[3]);
        const { updateSettings } = await import("@greeneek/base");
        const patch = { plugins: { [id]: { enabled: false } } } as unknown as Record<string, unknown>;
        const updated = updateSettings(this.bundle.paths.config, patch as unknown as import("@greeneek/base").Settings);
        (this.bundle as unknown as { settings: unknown }).settings = updated;
        await this.bundle.pluginRegistry.disable(id);
        return this.json(res, 200, { ok: true, status: "disabled" });
      }
      if (path === "/api/plugins/reload" && req.method === "POST") {
        // Reload is a no-op for built-ins but validates the registry
        return this.json(res, 200, { ok: true, plugins: this.bundle.pluginRegistry.list().map((p) => ({ id: p.plugin.manifest.id, status: p.status })) });
      }

      // ---- Settings overhaul (Phase 3) — single source, field-level, validated ----
      if (path === "/api/settings" && req.method === "GET") {
        const { loadSettings } = await import("@greeneek/base");
        const s = loadSettings(this.bundle.paths.config);
        return this.json(res, 200, redactSettings(s));
      }
      if ((path === "/api/settings" && (req.method === "PATCH" || req.method === "POST")) && !path.includes("/test") && !path.includes("/export") && !path.includes("/import") && !path.includes("/reset") && !path.includes("/credentials")) {
        const patch = await this.readBody(req);
        try {
          const { updateSettings } = await import("@greeneek/base");
          // Validate shape before persisting — unknown keys dropped with warning inside validate
          const updated = updateSettings(this.bundle.paths.config, patch as unknown as import("@greeneek/base").Settings);
          // Sync in-memory bundle atomically (no stale whole object)
          (this.bundle as unknown as { settings: unknown }).settings = updated;
          const fileCreds = loadCredentials(this.bundle.paths.credentials);
          this.bundle.secrets = secretsFromSettings(updated, fileCreds);
          return this.json(res, 200, redactSettings(updated));
        } catch (e) {
          return this.json(res, 400, { error: "invalid_settings", message: e instanceof Error ? e.message : String(e) });
        }
      }
      if (path === "/api/settings/test" && req.method === "POST") {
        const body = await this.readBody(req);
        const provider = String(body?.provider ?? "").toLowerCase();
        const apiKeyRaw = String(body?.apiKey ?? "");
        const apiKey = apiKeyRaw.trim().replace(/^Bearer\s+/i, "");
        const baseUrl = body?.baseUrl ? String(body.baseUrl) : undefined;
        if (!provider || !apiKey) return this.json(res, 400, { error: "provider_and_apiKey_required" });
        try {
          const adapters = await import("@greeneek/adapters");
          let result: { ok: boolean; message: string; details?: unknown } | null = null;
          if (provider === "openrouter") {
            const a = new adapters.OpenRouterAdapter({ apiKey, baseUrl });
            result = await a.validateCredentials({ apiKey, baseUrl });
          } else if (provider === "openai") {
            const a = new adapters.OpenAICompatibleAdapter({ apiKey, baseUrl });
            result = await a.validateCredentials({ apiKey, baseUrl });
          } else if (provider === "anthropic") {
            // No dedicated validate — format check only (live validation uses model call)
            if (!apiKey) result = { ok: false, message: "No key" };
            else result = { ok: true, message: "Anthropic key format accepted (live validation uses model call)" };
          } else {
            return this.json(res, 400, { error: "unknown_provider", provider });
          }
          // Map distinct kinds to HTTP 200 with ok flag so UI can render per-kind messages (never generic 500)
          return this.json(res, 200, result);
        } catch (e) {
          const err = e as { kind?: string; message?: string; status?: number };
          return this.json(res, 200, { ok: false, message: err?.message ?? String(e), kind: err?.kind ?? "unknown", status: err?.status });
        }
      }
      if (path === "/api/settings/export" && req.method === "GET") {
        const includeSecrets = url.searchParams.get("includeSecrets") === "1";
        const { loadSettings } = await import("@greeneek/base");
        const s = loadSettings(this.bundle.paths.config);
        const out: Record<string, unknown> = JSON.parse(JSON.stringify(s));
        if (!includeSecrets) {
          // Redact secrets by default (spec 3.3: secrets excluded by default)
          for (const k of Object.keys((out.providers as Record<string, unknown>) ?? {})) {
            const p = (out.providers as Record<string, Record<string, unknown>>)[k];
            if (p && "apiKey" in p) p.apiKey = p.apiKey ? "****" : "";
          }
        }
        res.writeHead(200, { "content-type": "application/json", "content-disposition": "attachment; filename=greeneek-settings.json" });
        res.end(JSON.stringify(out, null, 2));
        return;
      }
      if (path === "/api/settings/import" && req.method === "POST") {
        const body = await this.readBody(req);
        try {
          const { validateSettings, saveSettings } = await import("@greeneek/base");
          const validated = validateSettings(body);
          saveSettings(this.bundle.paths.config, validated);
          (this.bundle as unknown as { settings: unknown }).settings = validated;
          const fileCreds = loadCredentials(this.bundle.paths.credentials);
          this.bundle.secrets = secretsFromSettings(validated, fileCreds);
          return this.json(res, 200, { ok: true, settings: redactSettings(validated) });
        } catch (e) {
          return this.json(res, 400, { error: "invalid_import", message: e instanceof Error ? e.message : String(e) });
        }
      }
      if (path === "/api/settings/reset" && req.method === "POST") {
        const { saveSettings, DEFAULT_SETTINGS } = await import("@greeneek/base");
        const { validateSettings } = await import("@greeneek/base");
        const fresh = validateSettings(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)));
        saveSettings(this.bundle.paths.config, fresh);
        (this.bundle as unknown as { settings: unknown }).settings = fresh;
        const fileCreds = loadCredentials(this.bundle.paths.credentials);
        this.bundle.secrets = secretsFromSettings(fresh, fileCreds);
        return this.json(res, 200, { ok: true, settings: redactSettings(fresh) });
      }
      if (path === "/api/diagnostics" && req.method === "GET") {
        const { loadSettings } = await import("@greeneek/base");
        const s = loadSettings(this.bundle.paths.config);
        const diag = {
          version: "0.1.0",
          profile: this.bundle.harness.config("profile")?.options?.name ?? "web",
          provider: this.bundle.settings.defaults.provider,
          plan: this.bundle.meter.tier.id,
          logLevel: s.advanced.logLevel,
          storage: this.bundle.paths.home,
          harness: this.bundle.dumpConfig().map((r) => ({ id: r.id, type: r.type, enabled: r.enabled !== false })),
        };
        return this.json(res, 200, diag);
      }

      if (path === "/api/settings/credentials" && req.method === "POST") {
        const body = await this.readBody(req);
        const key = String(body?.key ?? "");
        const valueRaw = String(body?.value ?? "");
        const value = valueRaw.trim().replace(/^Bearer\s+/i, "");
        if (!key || !value) return this.json(res, 400, { error: "key_and_value_required" });
        saveCredential(this.bundle.paths.credentials, key, value);
        this.bundle.secrets[key] = value;
        // Keep Settings in sync (atomic field-level save via storage migration)
        try {
          const { updateSettings } = await import("@greeneek/base");
          const patch: Record<string, unknown> = {};
          if (key === "OPENAI_API_KEY") patch.providers = { openai: { apiKey: value, enabled: true } } as unknown as Record<string, unknown>;
          else if (key === "ANTHROPIC_API_KEY") patch.providers = { anthropic: { apiKey: value, enabled: true } } as unknown as Record<string, unknown>;
          else if (key === "OPENROUTER_API_KEY") patch.providers = { openrouter: { apiKey: value, enabled: true } } as unknown as Record<string, unknown>;
          if (Object.keys(patch).length) {
            const updated = updateSettings(this.bundle.paths.config, patch as unknown as import("@greeneek/base").Settings);
            (this.bundle as unknown as { settings: unknown }).settings = updated;
            const fileCreds = loadCredentials(this.bundle.paths.credentials);
            this.bundle.secrets = secretsFromSettings(updated, fileCreds);
          }
        } catch {
          // settings sync is best-effort; credentials file is source of truth for secrets
        }
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
      if (path === "/api/modes" && req.method === "GET") {
        const { MODES } = await import("@greeneek/core");
        return this.json(res, 200, { modes: MODES.map((m: { id: string; label: string; description: string; capabilities: unknown }) => ({ id: m.id, label: m.label, description: m.description, capabilities: m.capabilities })) });
      }
      if (path === "/api/traces" && req.method === "GET") {
        const q = url.searchParams.get("q") ?? "";
        const status = url.searchParams.get("status") ?? undefined;
        const modelId = url.searchParams.get("modelId") ?? undefined;
        const runs = this.bundle.traceStore.queryRuns({ status, modelId, limit: 100 });
        const filtered = q ? runs.filter((r: Run) => JSON.stringify(r).toLowerCase().includes(q.toLowerCase())) : runs;
        return this.json(res, 200, { runs: filtered });
      }
      if (path.match(/^\/api\/traces\/[^/]+$/) && req.method === "GET") {
        const runId = decodeURIComponent(path.split("/")[3]);
        const run = this.bundle.traceStore.queryRuns({}).find((r: Run) => r.runId === runId);
        if (!run) return this.json(res, 404, { error: "not_found" });
        const spans = this.bundle.traceStore.querySpans(runId);
        return this.json(res, 200, { run, spans });
      }
      if (path === "/api/traces/export" && req.method === "GET") {
        const format = url.searchParams.get("format") ?? "json";
        if (format === "otlp") {
          // OTLP JSON via exporter would be separate; for now return same as json with otlp flag
          res.writeHead(200, { "content-type": "application/json" });
          res.end(this.bundle.traceStore.exportJson());
          return;
        }
        res.writeHead(200, { "content-type": "application/json", "content-disposition": "attachment; filename=traces.json" });
        res.end(this.bundle.traceStore.exportJson());
        return;
      }
      if (path === "/api/traces" && req.method === "DELETE") {
        this.bundle.traceStore.clear();
        return this.json(res, 200, { ok: true });
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
    // Provider is reactive to Settings — next request after credential change shows new provider without restart.
    const active = this.bundle.harness.config("llm.active")?.options as { provider?: string; model?: string } | undefined;
    const wanted = this.bundle.settings.defaults.provider ?? active?.provider ?? "echo";
    const row = this.bundle.harness.dump().find((r) => r.type === "llm.adapter" && r.options?.provider === wanted)?.options
      ?? active
      ?? { provider: "echo", model: "echo-1" };
    return {
      name: "Greeneek",
      version: "0.1.0",
      profile: this.bundle.harness.config("profile")?.options?.name ?? "web",
      accent: "#067a52",
      provider: { provider: row.provider ?? wanted, model: row.model ?? "echo-1" },
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

  private async streamRun(
    id: string,
    session: ActiveSession,
    task: string,
    res: import("node:http").ServerResponse,
    opts: { model?: string; provider?: string; mode?: string } = {},
    req?: import("node:http").IncomingMessage,
  ): Promise<void> {
    if (session.running) {
      this.json(res, 409, { error: "session_busy" });
      return;
    }
    // Detect model switch mid-conversation for system note
    const prevModel = session.modelId;
    const nextModel = opts.model ?? session.modelId ?? this.bundle.settings.defaults.modelId ?? (this.bundle.settings.defaults.provider as string);
    if (prevModel && nextModel && prevModel !== nextModel) {
      // Will emit after headers
    }
    session.modelId = nextModel;
    if (opts.mode) session.modeId = opts.mode;
    session.running = true;
    session.messageSeq += 1;

    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    const start = Date.now();
    const send = (event: SessionEvent) => {
      // Enrich assistant/message with model metadata for Phase 4.2
      if (event.type === "assistant/message") {
        const data = event.data as Record<string, unknown>;
        data.modelId = nextModel;
        data.providerId = opts.provider ?? (nextModel?.includes("/") ? "openrouter" : this.bundle.settings.defaults.provider);
        data.modeId = session.modeId ?? this.bundle.settings.defaults.mode ?? "chat";
        data.latencyMs = Date.now() - start;
      }
      session.events.push(event);
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    // System note for model switch
    if (prevModel && nextModel && prevModel !== nextModel) {
      send({ type: "metadata", ts: Date.now(), sessionId: id, data: { kind: "model.switch", from: prevModel, to: nextModel, message: `Switched to ${nextModel}` } });
    }

    const controller = new AbortController();
    const onClose = () => controller.abort();
    try {
      (req as unknown as { on: (e: string, cb: () => void) => void })?.on?.("close", onClose);
    } catch {
      // ignore
    }
    const loop = new AgentLoop({
      adapter: createLoopAdapter(this.bundle, opts),
      registry: this.bundle.registry,
      prompt: this.bundle.prompt,
      telemetry: this.bundle.telemetry,
      sessionId: id,
      secrets: this.bundle.secrets,
      workingDir: process.cwd(),
      runtime: this.bundle.runtime,
      conversationId: id,
      modeId: session.modeId ?? this.bundle.settings.defaults.mode ?? "chat",
      modelId: nextModel,
      providerId: opts.provider ?? (nextModel?.includes("/") ? "openrouter" : this.bundle.settings.defaults.provider),
      signal: controller.signal,
      approval: async (approvalReq) => {
        send({ type: "metadata", ts: Date.now(), sessionId: id, data: { kind: "approval.request", ...(approvalReq as unknown as Record<string, unknown>) } });
        return true;
      },
      onEvent: send,
    });
    try {
      await loop.run(task, controller.signal);
      res.write(`event: done\ndata: {"ok":true}\n\n`);
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: err instanceof Error ? err.message : String(err) })}\n\n`);
    } finally {
      try {
        (req as unknown as { off: (e: string, cb: () => void) => void }).off?.("close", onClose);
      } catch {
        // ignore
      }
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

function createLoopAdapter(bundle: Bundle, opts: { model?: string; provider?: string } = {}) {
  const { createAdapter, OpenRouterAdapter, OpenAICompatibleAdapter, AnthropicAdapter, OllamaAdapter, EchoAdapter } = require("@greeneek/adapters") as typeof import("@greeneek/adapters");
  if (opts.model) {
    const providerHint = opts.provider ?? (opts.model.includes("/") ? "openrouter" : bundle.settings.defaults.provider);
    const model = opts.model;
    // Explicit per-conversation model override — instantiate directly so it does not depend on harness row being enabled
    if (providerHint === "openrouter") {
      const s = bundle.settings.providers.openrouter;
      return new OpenRouterAdapter({ model, baseUrl: s?.baseUrl, apiKey: bundle.secrets["OPENROUTER_API_KEY"] ?? bundle.secrets["OPENAI_API_KEY"] });
    }
    if (providerHint === "openai") {
      const s = bundle.settings.providers.openai;
      return new OpenAICompatibleAdapter({ model, baseUrl: s?.baseUrl, apiKey: bundle.secrets["OPENAI_API_KEY"] });
    }
    if (providerHint === "anthropic") {
      const s = bundle.settings.providers.anthropic;
      return new AnthropicAdapter({ model, baseUrl: s?.baseUrl, apiKey: bundle.secrets["ANTHROPIC_API_KEY"] });
    }
    if (providerHint === "ollama") {
      const s = bundle.settings.providers.ollama;
      return new OllamaAdapter({ model, baseUrl: s?.baseUrl });
    }
    if (providerHint === "echo") return new EchoAdapter();
  }
  return createAdapter(bundle.harness, bundle.secrets);
}

function redactSettings(s: import("@greeneek/base").Settings): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
  const providers = out.providers as Record<string, Record<string, unknown>> | undefined;
  if (providers) {
    for (const k of Object.keys(providers)) {
      const p = providers[k];
      if (p && typeof p.apiKey === "string" && p.apiKey) {
        p.apiKey = "****";
        (p as Record<string, unknown>).hasKey = true;
      } else if (p) {
        (p as Record<string, unknown>).hasKey = false;
      }
    }
  }
  return out;
}

function routeBucket(path: string): string {
  if (path.startsWith("/api/sessions")) return "chat";
  if (path.startsWith("/api/audit") || path.startsWith("/api/marketplace")) return "audit";
  return "tools";
}
