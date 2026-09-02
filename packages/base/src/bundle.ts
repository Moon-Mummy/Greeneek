import {
  Harness,
  ToolRegistry,
  PromptAssembly,
  TelemetrySeam,
  SessionLog,
  type ProfilePatchRow,
} from "@greeneek/core";
import { registerAdapterRows, createAdapter } from "@greeneek/adapters";
import { registerBuiltinTools } from "@greeneek/tools";
import { registerTelemetryRows, ConsoleSink, OTelJsonlSink, CostLedger, AlertEngine } from "@greeneek/telemetry";
import { registerBillingRows, UsageMeter, MeteringSink } from "@greeneek/billing";
import { registerAuditRows, AuditStore } from "@greeneek/audit";
import { registerGatewayRows, RateLimitTable, RequestSigner } from "@greeneek/gateway";
import { registerMarketplaceRows } from "@greeneek/marketplace";
import { homePaths } from "./paths";
import { loadCredentials } from "./credentials";
import { loadPatchFile } from "./patches";

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
  sessionLog: SessionLog;
  meter: UsageMeter;
  audit: AuditStore;
  rateLimits: RateLimitTable;
  signer: RequestSigner;
  paths: ReturnType<typeof homePaths>;
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
  const secrets = loadCredentials(paths.credentials);
  const harness = new Harness();

  // ---- Layer 1: profile bundles (ordered) ----------------------------
  registerAdapterRows(harness);
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
  const registry = new ToolRegistry();
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
  telemetry.subscribe(new ConsoleSink());
  const otel = harness.config("telemetry.otlp")?.options?.exportPath as string | undefined;
  if (otel) telemetry.subscribe(new OTelJsonlSink(otel));
  telemetry.subscribe(cost);
  telemetry.subscribe(alert);

  const meter = new UsageMeter();
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

  const rateLimits = new RateLimitTable(
    (harness.config("gateway.ratelimit")?.options as any) ?? { chat: { capacity: 60, refillPerSecond: 1 } },
  );
  const signer = new RequestSigner(secrets["GREENEK_GATEWAY_SECRET"] ?? "dev-secret");

  const adapter = createAdapter(harness, secrets);
  harness.patch([
    {
      id: "llm.active",
      type: "llm.active",
      options: { provider: adapter.provider, model: adapter.model },
    },
  ]);

  return {
    harness,
    registry,
    prompt,
    telemetry,
    secrets,
    sessionLog,
    meter,
    audit,
    rateLimits,
    signer,
    paths,
    dumpConfig: () => harness.dump(),
  };
}
