import { getLogger } from "./logger";

export type PluginKind = "provider" | "tool" | "mode" | "tracer" | "storage" | "ui-panel" | "middleware";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  kinds: PluginKind[];
  permissions: Array<"network" | "filesystem" | "secrets" | "shell" | "conversations" | "settings">;
  configSchema?: Record<string, unknown>;
  minAppVersion?: string;
}

export interface Middleware {
  onRunStart?(run: unknown): void | Promise<void>;
  onBeforeModelRequest?(req: unknown): unknown | Promise<unknown>;
  onModelEvent?(ev: unknown, run: unknown): void;
  onBeforeToolCall?(call: unknown, run: unknown): { allow: boolean; reason?: string } | Promise<{ allow: boolean; reason?: string }>;
  onAfterToolCall?(call: unknown, result: unknown, run: unknown): void;
  onRunEnd?(run: unknown, outcome: unknown): void;
  onError?(err: unknown, run: unknown): void;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requireApproval?: boolean;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

export interface ToolContext {
  secrets: Record<string, string | undefined>;
  workingDir: string;
  log(message: string): void;
}

export interface ModeSpec {
  id: string;
  label: string;
  description: string;
  capabilities: { tools: boolean; multiStep: boolean; maxSteps?: number; sideEffects: "none" | "ask" | "allow" };
}

export interface PluginContext {
  settings: {
    get<T>(key: string): T | undefined;
    set(key: string, value: unknown): void;
  };
  secrets: { get(key: string): string | undefined };
  logger: ReturnType<typeof getLogger>;
  tracer: { span(name: string, attrs?: Record<string, unknown>): { end(): void } };
  harness?: import("@greeneek/core").Harness;
  toolRegistry?: import("@greeneek/core").ToolRegistry;
  registry: {
    registerProvider(p: { id: string; label: string; create(): unknown }): void;
    registerTool(t: ToolSpec): void;
    registerMode(m: ModeSpec): void;
    registerTracerExporter(e: unknown): void;
    registerPanel(p: unknown): void;
    registerMiddleware(m: Middleware): void;
  };
  events: {
    on(event: string, handler: (data: unknown) => void): () => void;
    emit(event: string, data: unknown): void;
  };
}

export interface Plugin {
  manifest: PluginManifest;
  init(ctx: PluginContext): Promise<void>;
  activate?(): Promise<void>;
  deactivate?(): Promise<void>;
  dispose?(): Promise<void>;
}

export type PluginStatus = "registered" | "active" | "disabled" | "errored";

export interface RegisteredPlugin {
  plugin: Plugin;
  status: PluginStatus;
  error?: string;
}

const logger = getLogger("greeneek:plugin");

export class PluginRegistry {
  private plugins = new Map<string, RegisteredPlugin>();
  private middlewares: Middleware[] = [];
  private providers: Array<{ id: string; label: string; create(): unknown }> = [];
  private tools: ToolSpec[] = [];
  private modes: ModeSpec[] = [];
  constructor(
    private harness?: import("@greeneek/core").Harness,
    private toolRegistry?: import("@greeneek/core").ToolRegistry,
  ) {}

  register(plugin: Plugin): void {
    if (this.plugins.has(plugin.manifest.id)) {
      logger.warn(`plugin ${plugin.manifest.id} already registered — skipping`);
      return;
    }
    // Version check
    if (plugin.manifest.minAppVersion) {
      const cur = "0.1.0"; // from BRAND.version
      if (compareVersions(cur, plugin.manifest.minAppVersion) < 0) {
        this.plugins.set(plugin.manifest.id, { plugin, status: "errored", error: `Requires app ${plugin.manifest.minAppVersion}, have ${cur}` });
        logger.warn(`plugin ${plugin.manifest.id} version mismatch`);
        return;
      }
    }
    this.plugins.set(plugin.manifest.id, { plugin, status: "registered" });
  }

  async initAll(settings: Record<string, unknown>): Promise<void> {
    // Dependency order: storage → tracer → providers → tools → modes → panels
    const order: Record<string, number> = { storage: 0, tracer: 1, provider: 2, tool: 3, mode: 4, "ui-panel": 5, middleware: 6 };
    const sorted = [...this.plugins.values()].sort((a, b) => {
      const ak = a.plugin.manifest.kinds[0] ?? "tool";
      const bk = b.plugin.manifest.kinds[0] ?? "tool";
      return (order[ak] ?? 99) - (order[bk] ?? 99);
    });
    for (const entry of sorted) {
      const isEnabled = (settings.plugins as Record<string, { enabled: boolean }> | undefined)?.[entry.plugin.manifest.id]?.enabled;
      // If not explicitly set, built-ins are enabled by default; user plugins require explicit enable
      const shouldEnable = isEnabled !== undefined ? isEnabled : !entry.plugin.manifest.id.startsWith("user.");
      if (!shouldEnable) {
        entry.status = "disabled";
        continue;
      }
      const ctx = this.createContext(entry.plugin, settings);
      try {
        await withTimeout(entry.plugin.init(ctx), 5000, `init ${entry.plugin.manifest.id}`);
        entry.status = "active";
        if (entry.plugin.activate) await withTimeout(entry.plugin.activate(), 5000, `activate ${entry.plugin.manifest.id}`);
      } catch (e) {
        entry.status = "errored";
        entry.error = e instanceof Error ? e.message : String(e);
        logger.warn(`plugin ${entry.plugin.manifest.id} init failed: ${entry.error}`);
      }
    }
  }

  async disable(id: string): Promise<void> {
    const entry = this.plugins.get(id);
    if (!entry) return;
    if (entry.status === "active" && entry.plugin.deactivate) {
      try {
        await withTimeout(entry.plugin.deactivate(), 5000, `deactivate ${id}`);
      } catch (e) {
        logger.warn(`deactivate ${id} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    entry.status = "disabled";
    // Remove its registrations (simplified: rebuild lists)
    this.rebuild();
  }

  async enable(id: string, settings: Record<string, unknown>): Promise<void> {
    const entry = this.plugins.get(id);
    if (!entry) return;
    const ctx = this.createContext(entry.plugin, settings);
    try {
      await withTimeout(entry.plugin.init(ctx), 5000, `init ${id}`);
      entry.status = "active";
      if (entry.plugin.activate) await withTimeout(entry.plugin.activate(), 5000, `activate ${id}`);
    } catch (e) {
      entry.status = "errored";
      entry.error = e instanceof Error ? e.message : String(e);
    }
    this.rebuild();
  }

  private rebuild() {
    // For demo, we don't actually remove providers/tools on disable — the bundle's
    // per-request createAdapter checks settings.plugins enabled flag.
    // This is where a full implementation would re-derive the provider list.
  }

  private createContext(plugin: Plugin, settings: Record<string, unknown>): PluginContext {
    const has = (perm: string) => plugin.manifest.permissions.includes(perm as never);
    return {
      settings: {
        get: (k) => (settings[k] as never),
        set: (k, v) => {
          (settings[k] as unknown) = v;
        },
      },
      secrets: {
        get: (k) => (has("secrets") ? process.env[k] : undefined),
      },
      logger: getLogger(`greeneek:plugin:${plugin.manifest.id}`),
      tracer: {
        span: (name, attrs) => {
          const s = { name, attrs: attrs ?? {}, end: () => {} };
          return s;
        },
      },
      harness: this.harness,
      toolRegistry: this.toolRegistry,
      registry: {
        registerProvider: (p) => {
          if (!has("network") && p.id.includes("openrouter")) {
            logger.warn(`plugin ${plugin.manifest.id} tried to register network provider without permission — blocked`);
            return;
          }
          this.providers.push(p);
          // Mirror to harness for createAdapter compatibility
          if (this.harness && !this.harness.config(`llm.${p.id}`)) {
            const modelMap: Record<string, string> = {
              openrouter: "openai/gpt-4o-mini",
              openai: "gpt-4o-mini",
              anthropic: "claude-sonnet-4-5",
              ollama: "qwen2.5-coder:7b",
              echo: "echo-1",
            };
            this.harness.add({ id: `llm.${p.id}`, type: "llm.adapter", enabled: true, options: { provider: p.id, model: modelMap[p.id] ?? p.id } });
          }
        },
        registerTool: (t) => {
          this.tools.push(t);
          if (this.toolRegistry) {
            try {
              this.toolRegistry.register({
                definition: { name: t.name, description: t.description, parameters: t.parameters, requireApproval: t.requireApproval },
                execute: (args, ctx) => t.execute(args, ctx as unknown as ToolContext),
              });
            } catch (e) {
              logger.warn(`tool ${t.name} registration failed: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        },
        registerMode: (m) => this.modes.push(m),
        registerTracerExporter: () => {},
        registerPanel: () => {},
        registerMiddleware: (m) => this.middlewares.push(m),
      },
      events: {
        on: () => () => {},
        emit: () => {},
      },
    };
  }

  list(): RegisteredPlugin[] {
    return [...this.plugins.values()];
  }

  getProviders(): Array<{ id: string; label: string; create(): unknown }> {
    return [...this.providers];
  }

  getTools(): ToolSpec[] {
    return [...this.tools];
  }

  getModes(): ModeSpec[] {
    return [...this.modes];
  }

  getMiddlewares(): Middleware[] {
    return [...this.middlewares];
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

async function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
  });
  try {
    const result = await Promise.race([p, timeout]);
    return result as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
