import { describe, expect, it } from "vitest";
import { compareSemver, satisfies } from "../src";

describe("semver", () => {
  it("compares", () => {
    expect(compareSemver("2.1.0", "2.0.9")).toBeGreaterThan(0);
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
  });
  it("satisfies ranges", () => {
    expect(satisfies("1.2.3", "^1.2.0")).toBe(true);
    expect(satisfies("2.0.0", "^1.2.0")).toBe(false);
    expect(satisfies("1.9.0", "~1.8.0")).toBe(false);
    expect(satisfies("1.8.5", "~1.8.0")).toBe(true);
    expect(satisfies("3.0.0", ">=2.0.0")).toBe(true);
    expect(satisfies("1.0.0", "*")).toBe(true);
  });
});
