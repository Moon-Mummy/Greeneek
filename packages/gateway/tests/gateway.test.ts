import { describe, expect, it } from "vitest";
import { RateLimitTable, ApiKeyStore, RequestSigner } from "../src";

describe("rate limiter", () => {
  it("allows then rejects on token exhaustion", () => {
    const rt = new RateLimitTable({ chat: { capacity: 2, refillPerSecond: 0.001 } });
    expect(rt.take("chat", "user1").allowed).toBe(true);
    expect(rt.take("chat", "user1").allowed).toBe(true);
    const third = rt.take("chat", "user1");
    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBeGreaterThan(0);
    expect(rt.take("chat", "user2").allowed).toBe(true);
  });
});

describe("api keys", () => {
  it("creates and verifies a key", () => {
    const store = new ApiKeyStore();
    const { record, secret } = store.create("ci", ["chat"]);
    expect(secret.startsWith("gk_")).toBe(true);
    const verified = store.verify(secret);
    expect(verified?.id).toBe(record.id);
    store.revoke(record.id);
    expect(store.verify(secret)).toBeNull();
  });
});

describe("request signing", () => {
  it("signs and verifies, rejects stale", () => {
    const signer = new RequestSigner("secret");
    const { timestamp, signature } = signer.sign("POST", "/api/sessions/s1/run", "{\"task\":\"x\"}");
    expect(signer.verify("POST", "/api/sessions/s1/run", "{\"task\":\"x\"}", timestamp, signature)).toBe(true);
    expect(signer.verify("POST", "/api/sessions/s1/run", "{\"task\":\"y\"}", timestamp, signature)).toBe(false);
    expect(signer.verify("POST", "/api/sessions/s1/run", "{\"task\":\"x\"}", "1", signature)).toBe(false);
  });
});
