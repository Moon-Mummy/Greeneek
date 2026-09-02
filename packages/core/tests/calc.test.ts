import { describe, expect, it } from "vitest";
import { evaluate } from "../../tools/src";

describe("calc.eval", () => {
  it("evaluates arithmetic", () => {
    expect(evaluate("(2+3)*4")).toBe(20);
    expect(evaluate("10/4")).toBe(2.5);
    expect(evaluate("2^10")).toBe(1024);
    expect(evaluate("-5+3")).toBe(-2);
    expect(evaluate("pi")).toBeCloseTo(Math.PI, 5);
  });
});
