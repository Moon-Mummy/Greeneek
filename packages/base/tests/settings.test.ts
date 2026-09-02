import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSettings, updateSettings, validateSettings } from "../src/settings";

describe("Settings overhaul — Phase 3", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "gk-settings-"));
  });

  it("round-trips every field via updateSettings/loadSettings", () => {
    const patch = {
      providers: { openai: { apiKey: "sk-test-openai", enabled: true, baseUrl: "https://api.openai.com/v1" } },
      defaults: { provider: "openai", mode: "agent", temperature: 0.9, maxTokens: 2048, systemPrompt: "test prompt" },
      tracing: { enabled: true, storePrompts: false, retentionDays: 7, maxSizeMB: 50, otlpEndpoint: "https://otel.example.com" },
      advanced: { requestTimeoutMs: 20000, streamIdleTimeoutMs: 90000, logLevel: "debug" as const },
      data: { storageLocation: "/tmp/foo" },
      billing: { plan: "pro" },
      search: { provider: "exa" },
    } as unknown as Record<string, unknown>;
    const updated = updateSettings(join(tmp, "config.json"), patch as unknown as import("../src/settings").Settings);
    expect(updated.providers.openai.apiKey).toBe("sk-test-openai");
    expect(updated.defaults.temperature).toBe(0.9);
    expect(updated.tracing.retentionDays).toBe(7);
    expect(updated.advanced.logLevel).toBe("debug");
    expect(updated.billing.plan).toBe("pro");

    const reloaded = loadSettings(join(tmp, "config.json"));
    expect(reloaded.providers.openai.apiKey).toBe("sk-test-openai");
    expect(reloaded.defaults.mode).toBe("agent");
  });

  it("partial update does not clobber others", () => {
    updateSettings(join(tmp, "config.json"), { defaults: { temperature: 1.2 } } as unknown as import("../src/settings").Settings);
    const s = loadSettings(join(tmp, "config.json"));
    expect(s.defaults.temperature).toBe(1.2);
    expect(s.defaults.provider).toBe("echo"); // default unchanged
    expect(s.billing.plan).toBe("free");
  });

  it("migration from v1 with theme key and untrimmed key → v2", () => {
    const { writeFileSync } = require("node:fs");
    const cfg = join(tmp, "config.json");
    writeFileSync(cfg, JSON.stringify({ schemaVersion: 1, data: { theme: "dark", providers: { openai: { apiKey: "  Bearer sk-abc123  ", enabled: false, baseUrl: "https://api.openai.com/v1" } } } }));
    const migrated = loadSettings(cfg);
    expect((migrated as Record<string, unknown>).theme).toBeUndefined();
    expect(migrated.providers.openai.apiKey).toBe("sk-abc123");
  });

  it("invalid import rejected — unknown keys dropped, bad values defaulted", () => {
    const bad = validateSettings({ defaults: { temperature: 99, provider: 123 as unknown as string }, unknownKey: "x", providers: { openai: { apiKey: 123 as unknown as string } } } as unknown as Record<string, unknown>);
    expect(bad.defaults.temperature).toBe(0.7); // default, since 99 out of range
    expect(bad.defaults.provider).toBe("echo"); // default, since 123 not string
    expect((bad as unknown as Record<string, unknown>).unknownKey).toBeUndefined();
  });

  it("hydrate before render: isSettingsHydrated is false before file exists, true after", async () => {
    const { isSettingsHydrated } = await import("../src/settings");
    const cfg = join(tmp, "config.json");
    expect(isSettingsHydrated(cfg)).toBe(false);
    updateSettings(cfg, { defaults: { temperature: 0.8 } } as unknown as import("../src/settings").Settings);
    expect(isSettingsHydrated(cfg)).toBe(true);
  });
});
