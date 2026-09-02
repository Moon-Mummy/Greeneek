import { describe, expect, it } from "vitest";
import { Harness } from "../src";

describe("composition harness", () => {
  it("patches replace rows wholesale by id", () => {
    const h = new Harness();
    h.add({ id: "x", type: "t", options: { a: 1 } });
    h.patch([{ id: "x", type: "t", options: { a: 2 } }]);
    expect(h.config("x")?.options).toEqual({ a: 2 });
    expect(h.dump()).toHaveLength(1);
  });

  it("inserts new rows and disables via patch", () => {
    const h = new Harness();
    h.add({ id: "a", type: "t" });
    h.patch([{ id: "b", type: "t2" }]);
    h.patch([{ id: "a", type: "t", enabled: false }]);
    expect(h.configsByType("t")).toHaveLength(0);
    expect(h.configsByType("t2")).toHaveLength(1);
  });

  it("dump is a deep copy", () => {
    const h = new Harness();
    h.add({ id: "x", type: "t", options: { a: 1 } });
    const dump = h.dump();
    dump[0].options!.a = 99;
    expect(h.config("x")?.options?.a).toBe(1);
  });
});
