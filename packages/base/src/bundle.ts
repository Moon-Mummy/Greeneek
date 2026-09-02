import {
  Harness,
  ToolRegistry,
  PromptAssembly,
  TelemetrySeam,
  SessionLog,
  type ProfilePatchRow,
} from "@greeneek/core";
import { createAdapter } from "@greeneek/adapters";
import { registerBuiltinTools } from "@greeneek/tools";
import { registerTelemetryRows, ConsoleSink, OTelJsonlSink, CostLedger, AlertEngine } from "@greeneek/telemetry";
import { registerBillingRows, UsageMeter, MeteringSink } from "@greeneek/billing";
import { registerAuditRows, AuditStore } from "@greeneek/audit";
import { registerGatewayRows, RateLimitTable, RequestSigner } from "@greeneek/gateway";
import { registerMarketplaceRows } from "@greeneek/marketplace";
import { join } from "node:path";
import { homePaths } from "./paths";
import { loadCredentials } from "./credentials";
import { loadPatchFile } from "./patches";
import { getLogger } from "./logger";
import { loadSettings, secretsFromSettings, type Settings } from "./settings";
import { PluginRegistry } from "./plugin";
// @ts-ignore — plugins live at repo root for the spec's file tree
const { builtins } = require("../../../plugins/index.js") as { builtins: import("./plugin").Plugin[] };
import { Runtime } from "@greeneek/core";
import { LocalTraceStore } from "@greeneek/telemetry";

export type ProfileName = "web" | "headless" | "sdk" | "acp";

export interface BundleOptions {
  profile: ProfileName;
  overlay?: ProfilePatchRow[];
  home?: string;
  sessionLog?: SessionLog;
  approval?: (req: any) => Promise<boolean>;
}

export interface Bundle {
  harness: Harness;
  registry: ToolRegistry;
  prompt: PromptAssembly;
  telemetry: TelemetrySeam;
  secrets: Record<string, string | undefined>;
  settings: Settings;
  sessionLog: SessionLog;
  meter: UsageMeter;
  audit: AuditStore;
  rateLimits: RateLimitTable;
  signer: RequestSigner;
  paths: ReturnType<typeof homePaths>;
  pluginRegistry: PluginRegistry;
  traceStore: LocalTraceStore;
  runtime: Runtime;
  dumpConfig(): ProfilePatchRow[];
}

/**
 * The Greeneek base bundle: boot order = profile bundles → profile patch →
 * home patch → CLI overlay, exactly the composition model the architecture
 * documents. Capabilities are mounted as rows so any of them can be disabled
 * with a patch instead of a revert.
 */
export function buildBundle(options: BundleOptions): Bundle {
  const paths = homePaths(options.home);
  const settings = loadSettings(paths.config);
  const fileCreds = loadCredentials(paths.credentials);
  const secrets = secretsFromSettings(settings, fileCreds);
  const logger = getLogger("greeneek:bundle");
  logger.debug(`bundle building profile=${options.profile}`, { home: paths.home });
  const harness = new Harness();
  const registry = new ToolRegistry();
  const pluginRegistry = new PluginRegistry(harness, registry);
  // Every capability is a plugin — built-ins are registered here and init'd via the same path as third-party.
  // This is the single way to add a provider/tool/mode (Phase 5).
  for (const p of builtins) pluginRegistry.register(p);
  // Init plugins synchronously for boot (isolation via try/catch inside registry)
  // We use the sync path to keep buildBundle sync for existing callers.
  try {
    for (const raw of (pluginRegistry as unknown as { plugins: Map<string, unknown> }).plugins.values()) {
      const ent = raw as unknown as { plugin: { manifest: { kinds: string[]; id: string }; init: (ctx: unknown) => unknown }; status: string; error?: string };
      const shouldEnable = (settings.plugins as Record<string, { enabled: boolean }> | undefined)?.[ent.plugin.manifest.id]?.enabled;
      const enabled = shouldEnable !== undefined ? shouldEnable : !ent.plugin.manifest.id.startsWith("user.");
      if (!enabled) {
        (ent as unknown as { status: string }).status = "disabled";
        continue;
      }
      try {
        const ctx = (pluginRegistry as unknown as { createContext: (p: unknown, s: unknown) => unknown }).createContext(ent.plugin, settings as unknown as Record<string, unknown>);
        const res = ent.plugin.init(ctx as never);
        if (res && typeof (res as Promise<unknown>).then === "function") {
          (res as Promise<void>).then(
            () => ((ent as unknown as { status: string }).status = "active"),
            (e) => {
              (ent as unknown as { status: string }).status = "errored";
              (ent as unknown as { error: string }).error = e instanceof Error ? e.message : String(e);
            },
          );
          (ent as unknown as { status: string }).status = "active";
        } else {
          (ent as unknown as { status: string }).status = "active";
        }
      } catch (e) {
        (ent as unknown as { status: string }).status = "errored";
        (ent as unknown as { error: string }).error = e instanceof Error ? e.message : String(e);
      }
    }
  } catch {
    // plugin init must never crash boot
  }

  // ---- Layer 1: profile bundles (ordered) — legacy seams kept for billing/audit/gateway/marketplace
  // Provider rows are now via plugins/*, not here.
  registerTelemetryRows(harness);
  registerBillingRows(harness);
  registerAuditRows(harness);
  registerGatewayRows(harness);
  registerMarketplaceRows(harness);

  harness
    .add({ id: "profile", type: "profile", options: { name: options.profile } })
    .add({ id: "core.loop", type: "core.loop", options: { maxSteps: 12 } })
    .add({ id: "core.tools", type: "core.tools", options: { approvalPolicy: "auto" } })
    .add({ id: "core.session", type: "core.session", options: { durable: true } })
    .add({ id: "core.system-prompt", type: "core.system-prompt", options: { sections: true } });

  // Profile flavor: web is the full surface; headless/sdk/acp are lean.
  if (options.profile !== "web") {
    harness.patch([
      { id: "billing.plans", type: "billing.plan", enabled: false },
      { id: "billing.meter", type: "billing.meter", enabled: false },
      { id: "gateway.ratelimit", type: "gateway.ratelimit", enabled: false },
      { id: "gateway.keys", type: "gateway.keys", enabled: false },
      { id: "marketplace.registry", type: "marketplace.registry", enabled: false },
    ]);
  }
  if (options.profile === "acp") {
    harness.patch([{ id: "telemetry.otlp", type: "telemetry.otlp", enabled: false }]);
  }

  // ---- Layer 2: profile patch (<profile>/cordis.patch.yml) -----------
  // ---- Layer 3: home patch (~/.greeneek/cordis.patch.yml) ------------
  const homePatch = loadPatchFile(paths.patch);
  harness.patch(homePatch);

  // ---- Layer 4: CLI overlay ------------------------------------------
  if (options.overlay?.length) harness.patch(options.overlay);

  // ---- Instantiate seams from composed rows ---------------------------
  // registry already created for plugin init; now add built-in tools (will be deduped via plugin tool-basic as well)
  registerBuiltinTools(registry);
  registry.setPolicy((harness.config("core.tools")?.options?.approvalPolicy as any) ?? "auto");

  const prompt = new PromptAssembly();
  prompt.add({
    name: "Identity & policy",
    priority: 0,
    content:
      "You are Greeneek, a precise agent harness for AI evaluation, agent orchestration and real-time data streaming. Be concise, technical and honest. Never claim a tool ran unless its result is in context.",
  });
  prompt.add({
    name: "Tool discipline",
    priority: 10,
    content: "Prefer read-only tools. Shell execution is approval-gated. Truncate long outputs before continuing.",
  });
  prompt.add({
    name: "Available tools",
    priority: 20,
    content: registry.list().map((t) => `- ${t.name}: ${t.description}`).join("\n"),
  });

  const telemetry = new TelemetrySeam();
  const cost = new CostLedger();
  const alert = new AlertEngine({
    failureRateThreshold: 0.2,
    windowMs: 60_000,
    minSamples: 5,
    onAlert: (a) => telemetry.emit("metadata", "alerts", { kind: "alert", ...a }),
  });
  // Structured logger replaces direct console.* in sinks; verbosity is unified via Settings
  const verboseFromSettings = settings.advanced.logLevel === "debug";
  const consoleSinkSilent = settings.advanced.logLevel === "error" ? true : !verboseFromSettings;
  telemetry.subscribe(new ConsoleSink(consoleSinkSilent));
  const otel = (settings.tracing.exportPath || (harness.config("telemetry.otlp")?.options?.exportPath as string | undefined))?.trim();
  if (otel) telemetry.subscribe(new OTelJsonlSink(otel));
  telemetry.subscribe(cost);
  telemetry.subscribe(alert);

  const meter = new UsageMeter(settings.billing.plan);
  telemetry.subscribe(new MeteringSink(meter));

  const sessionLog = options.sessionLog ?? new SessionLog(paths.sessions);

  const audit = new AuditStore(paths.audit);
  telemetry.subscribe({
    emit(e) {
      if (["session/start", "tool/start", "tool/end", "session/end"].includes(e.type)) {
        audit.record(e.type, `session/${e.sessionId}`, { data: e.data });
      }
    },
  });

  const traceStore = new LocalTraceStore(join(paths.home, "traces"), {
    retentionDays: settings.tracing.retentionDays,
    maxSizeMB: settings.tracing.maxSizeMB,
  });
  const runtime = new Runtime(traceStore, {
    tracing: settings.tracing as unknown as { enabled: boolean; storePrompts: boolean; redactPatterns: string[]; retentionDays: number; maxSizeMB: number; otlpEndpoint?: string; exportPath?: string },
    advanced: settings.advanced,
  });

  const rateLimits = new RateLimitTable(
    (harness.config("gateway.ratelimit")?.options as any) ?? { chat: { capacity: 60, refillPerSecond: 1 } },
  );
  const signer = new RequestSigner((secrets["GREENEK_GATEWAY_SECRET"] as string | undefined) ?? "dev-secret");

  // Apply settings-driven provider overrides to rows so createAdapter sees the live baseUrl/model.
  // This keeps the patch seam as the final word while allowing env/Settings to seed defaults.
  if (settings.providers.openai.baseUrl || settings.providers.openai.apiKey) {
    const cur = harness.dump().find((r) => r.id === "llm.openai")?.options as Record<string, unknown> | undefined;
    harness.patch([{ id: "llm.openai", type: "llm.adapter", enabled: settings.providers.openai.enabled || Boolean(settings.providers.openai.apiKey), options: { provider: "openai", model: (cur?.model as string) ?? "gpt-4o-mini", baseUrl: settings.providers.openai.baseUrl ?? (cur?.baseUrl as string) ?? "https://api.openai.com/v1" } }]);
  }
  if (settings.providers.openrouter?.baseUrl || settings.providers.openrouter?.apiKey) {
    const cur = harness.dump().find((r) => r.id === "llm.openrouter")?.options as Record<string, unknown> | undefined;
    harness.patch([{ id: "llm.openrouter", type: "llm.adapter", enabled: settings.providers.openrouter?.enabled ?? false, options: { provider: "openrouter", model: (cur?.model as string) ?? "openai/gpt-4o-mini", baseUrl: settings.providers.openrouter?.baseUrl ?? (cur?.baseUrl as string) ?? "https://openrouter.ai/api/v1" } }]);
  }
  if (settings.providers.anthropic.baseUrl) {
    const cur = harness.dump().find((r) => r.id === "llm.anthropic")?.options as Record<string, unknown> | undefined;
    harness.patch([{ id: "llm.anthropic", type: "llm.adapter", enabled: settings.providers.anthropic.enabled || Boolean(settings.providers.anthropic.apiKey), options: { provider: "anthropic", model: (cur?.model as string) ?? "claude-sonnet-4-5", baseUrl: settings.providers.anthropic.baseUrl ?? (cur?.baseUrl as string) ?? "https://api.anthropic.com/v1" } }]);
  }

  // Per-request adapter pattern: llm.active reflects current settings at bundle boot,
  // but the live adapter is created per run via createAdapter(harness, freshSecrets).
  // This keeps settings changes live without a restart.
  const bootAdapter = createAdapter(harness, secrets);
  harness.patch([
    {
      id: "llm.active",
      type: "llm.active",
      options: { provider: bootAdapter.provider, model: bootAdapter.model },
    },
  ]);

  return {
    harness,
    registry,
    prompt,
    telemetry,
    secrets,
    settings,
    sessionLog,
    meter,
    audit,
    rateLimits,
    signer,
    paths,
    pluginRegistry,
    traceStore,
    runtime,
    dumpConfig: () => harness.dump(),
  };
}
