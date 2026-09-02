import { describe, it, expect } from "vitest";
import { PluginRegistry } from "../src/plugin";
import type { Plugin } from "../src/plugin";

describe("Plugin kernel — Phase 5", () => {
  it("loads all built-ins", async () => {
    const { builtins } = await import("../src/plugins/index");
    const reg = new PluginRegistry();
    builtins.forEach((p) => reg.register(p));
    await reg.initAll({});
    const list = reg.list();
    expect(list.length).toBe(builtins.length);
    // At least one provider should be active (echo)
    expect(list.some((p) => p.plugin.manifest.id === "greeneek.provider.echo" && p.status === "active")).toBe(true);
  });

  it("isolates a plugin whose init throws and reports error", async () => {
    const reg = new PluginRegistry();
    const bad: Plugin = {
      manifest: { id: "test.bad", name: "Bad", version: "0.1.0", description: "bad", kinds: ["tool"], permissions: [] },
      async init() {
        throw new Error("init failed");
      },
    };
    const good: Plugin = {
      manifest: { id: "test.good", name: "Good", version: "0.1.0", description: "good", kinds: ["tool"], permissions: [] },
      async init(ctx) {
        ctx.registry.registerTool({ name: "good_tool", description: "ok", parameters: {}, async execute() { return "ok"; } });
      },
    };
    reg.register(bad);
    reg.register(good);
    await reg.initAll({});
    const list = reg.list();
    const b = list.find((p) => p.plugin.manifest.id === "test.bad")!;
    const g = list.find((p) => p.plugin.manifest.id === "test.good")!;
    expect(b.status).toBe("errored");
    expect(b.error).toContain("init failed");
    expect(g.status).toBe("active");
    expect(reg.getTools().some((t) => t.name === "good_tool")).toBe(true);
  });

  it("plugin without network permission cannot register network provider", async () => {
    const reg = new PluginRegistry();
    const noNet: Plugin = {
      manifest: { id: "test.no-net", name: "NoNet", version: "0.1.0", description: "no net", kinds: ["provider"], permissions: [] },
      async init(ctx) {
        ctx.registry.registerProvider({ id: "openrouter", label: "OpenRouter", create: () => ({}) });
      },
    };
    reg.register(noNet);
    await reg.initAll({});
    // Should be blocked — no provider registered
    expect(reg.getProviders().length).toBe(0);
  });

  it("disable/enable at runtime works", async () => {
    const reg = new PluginRegistry();
    const p: Plugin = {
      manifest: { id: "test.toggle", name: "Toggle", version: "0.1.0", description: "toggle", kinds: ["tool"], permissions: [] },
      async init(ctx) {
        ctx.registry.registerTool({ name: "toggle_tool", description: "toggle", parameters: {}, async execute() { return "ok"; } });
      },
    };
    reg.register(p);
    await reg.initAll({});
    expect(reg.list().find((x) => x.plugin.manifest.id === "test.toggle")?.status).toBe("active");
    await reg.disable("test.toggle");
    expect(reg.list().find((x) => x.plugin.manifest.id === "test.toggle")?.status).toBe("disabled");
    await reg.enable("test.toggle", {});
    expect(reg.list().find((x) => x.plugin.manifest.id === "test.toggle")?.status).toBe("active");
  });

  it("middleware order is deterministic (storage → tracer → provider → tool → mode)", async () => {
    const reg = new PluginRegistry();
    const order: string[] = [];
    const mk = (id: string, kind: string): Plugin => ({
      manifest: { id, name: id, version: "0.1.0", description: id, kinds: [kind as never], permissions: [] },
      async init(ctx) {
        order.push(kind);
        // also register a middleware to check order later
        ctx.registry.registerMiddleware({ onRunStart: () => {} });
      },
    });
    // Register in reverse order to test sorting
    reg.register(mk("test.mode", "mode"));
    reg.register(mk("test.tool", "tool"));
    reg.register(mk("test.provider", "provider"));
    reg.register(mk("test.tracer", "tracer"));
    reg.register(mk("test.storage", "storage"));
    await reg.initAll({});
    expect(order).toEqual(["storage", "tracer", "provider", "tool", "mode"]);
  });
});
