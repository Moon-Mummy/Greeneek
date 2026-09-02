import { describe, it, expect } from "vitest";
import { runHeadless } from "../apps/headless/src/index";

/**
 * Baseline E2E smoke — Milestone 1 (§20.4 subset)
 * 1) general chat
 * 2) tool call + cancel semantics (tool executed)
 * 3) offline echo (no key required)
 */
describe("E2E smoke — Milestone 1", () => {
  it("1) general chat streams to completion", async () => {
    const r = await runHeadless("Say hello in one sentence.");
    expect(r.ok).toBe(true);
    expect(r.output.length).toBeGreaterThan(5);
  });
  it("2) tool call succeeds", async () => {
    const r = await runHeadless('@execute calc.eval {"expression":"6*7"}');
    expect(r.output).toContain("42");
  });
  it("3) local echo without key (offline-first)", async () => {
    const r = await runHeadless("offline check: echo");
    expect(r.ok).toBe(true);
  });
});
