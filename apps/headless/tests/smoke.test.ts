import { describe, expect, it } from "vitest";
import { runHeadless } from "../src";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

function isolatedHome() {
  return join(tmpdir(), `greeneek-test-${randomUUID()}`);
}

describe("profile smoke: headless one-shot", () => {
  it("completes a turn end to end via the base bundle", async () => {
    const result = await runHeadless("What is Greeneek? One sentence.", { home: isolatedHome() });
    expect(result.ok).toBe(true);
    expect(result.output.length).toBeGreaterThan(10);
  });

  it("executes a tool through the guarded registry", async () => {
    const result = await runHeadless('@execute calc.eval {"expression":"6*7"}', { home: isolatedHome() });
    expect(result.output).toContain("42");
  });
});