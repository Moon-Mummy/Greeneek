import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Request signing for server clients (feature 12).
 *
 * HMAC-SHA256 over `method\npath\nbody\ntimestamp` with a per-key secret.
 * The gateway rejects stale timestamps (default 5 min) and verifies the
 * signature before dispatching.
 */
export class RequestSigner {
  constructor(private secret: string, private maxSkewMs = 300_000) {}

  sign(method: string, path: string, body: string): { timestamp: string; signature: string } {
    const timestamp = String(Date.now());
    const signature = this.compute(method, path, body, timestamp);
    return { timestamp, signature };
  }

  verify(method: string, path: string, body: string, timestamp: string, signature: string): boolean {
    if (Math.abs(Date.now() - Number(timestamp)) > this.maxSkewMs) return false;
    const expected = this.compute(method, path, body, timestamp);
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  private compute(method: string, path: string, body: string, timestamp: string): string {
    return createHmac("sha256", this.secret).update(`${method}\n${path}\n${body}\n${timestamp}`).digest("hex");
  }
}
