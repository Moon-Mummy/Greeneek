import type { Harness } from "@greeneek/core";
import { RateLimitTable, TokenBucket } from "./ratelimit";
import { ApiKeyStore } from "./keys";
import { RequestSigner } from "./signing";

export { RateLimitTable, TokenBucket, ApiKeyStore, RequestSigner };

/** Gateway rows: rate limits per route, key auth, signing, WAF-ish heuristics. */
export function registerGatewayRows(harness: Harness): void {
  harness
    .add({
      id: "gateway.ratelimit",
      type: "gateway.ratelimit",
      options: {
        chat: { capacity: 60, refillPerSecond: 1 },
        tools: { capacity: 240, refillPerSecond: 4 },
        audit: { capacity: 10, refillPerSecond: 0.2 },
      },
    })
    .add({ id: "gateway.keys", type: "gateway.keys", enabled: true })
    .add({ id: "gateway.signing", type: "gateway.signing", options: { maxSkewMs: 300000 }, enabled: true })
    .add({ id: "gateway.abuse", type: "gateway.abuse", options: { maxFailuresPerMinute: 30, blockMs: 600000 } });
}
