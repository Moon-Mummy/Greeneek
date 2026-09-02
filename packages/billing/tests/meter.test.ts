import { describe, expect, it } from "vitest";
import { UsageMeter } from "../src";

describe("usage meter", () => {
  it("free tier enforces token allowance, not a $0 dollar cap", () => {
    const meter = new UsageMeter("free");
    expect(meter.canRun().ok).toBe(true);
    meter.record(60_000, 40_000, 0);
    expect(meter.canRun().ok).toBe(false);
    expect(meter.canRun().reason).toContain("token allowance");
  });

  it("pro tier enforces spend limit", () => {
    const meter = new UsageMeter("pro");
    meter.record(1, 1, 19.5);
    expect(meter.canRun().ok).toBe(true);
    meter.record(1, 1, 0.6);
    expect(meter.canRun().ok).toBe(false);
    expect(meter.canRun().reason).toContain("spend limit");
  });
});
