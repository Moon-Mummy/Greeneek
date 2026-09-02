import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditStore } from "../src";

describe("audit store", () => {
  it("hash-chains entries and detects tampering", () => {
    const dir = mkdtempSync(join(tmpdir(), "gk-audit-"));
    const store = new AuditStore(dir);
    store.record("session/start", "s/1", { task: "x" });
    store.record("tool/end", "s/1", { name: "calc" });
    const entries = store.query();
    expect(entries).toHaveLength(2);
    expect(entries[1].prevHash).toBe(entries[0].hash);
    expect(() => store.replayEntries()).not.toThrow();

    // Tamper and verify integrity failure on next read.
    const { appendFileSync } = require("node:fs") as typeof import("node:fs");
    store.record("session/end", "s/1", {});
    const lines = store.export("jsonl").split("\n").filter(Boolean);
    const tampered = JSON.parse(lines[1]);
    tampered.action = "HACKED";
    // Overwrite the line directly to simulate tampering.
    const fs = require("node:fs") as typeof import("node:fs");
    fs.writeFileSync(store.path(), fs.readFileSync(store.path(), "utf8").replace(lines[1], JSON.stringify(tampered)));
    expect(() => new AuditStore(dir).query()).toThrow(/integrity|tampered/);
    void appendFileSync;
  });
});
