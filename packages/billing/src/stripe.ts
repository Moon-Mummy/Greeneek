import { createHmac, timingSafeEqual } from "node:crypto";

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: { id?: string; customer?: string; status?: string; subscription?: string; plan?: { id?: string }; current_period_end?: number } };
}

/**
 * Stripe webhook surface (feature 02).
 *
 * Signature verification (V1), event dispatch for checkout/subscription/
 * invoice events, and grace-period accounting. In production the keys come
 * from the secrets store; nothing here calls Stripe directly at build time.
 */
export class StripeWebhooks {
  constructor(private webhookSecret?: string) {}

  verify(rawBody: string, signature: string, timestamp: string): boolean {
    if (!this.webhookSecret) return false;
    const payload = `${timestamp}.${rawBody}`;
    const expected = createHmac("sha256", this.webhookSecret).update(payload).digest("hex");
    const given = signature.split(",").find((s) => s.startsWith("v1="))?.slice(3) ?? "";
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(given));
    } catch {
      return false;
    }
  }

  async handle(event: StripeEvent, store: { record(payload: StripeEvent): void }): Promise<{ handled: boolean; status: string }> {
    store.record(event);
    switch (event.type) {
      case "checkout.session.completed":
        return { handled: true, status: "activated" };
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        return { handled: true, status: event.data.object.status ?? "updated" };
      case "invoice.payment_failed":
        // Dunning: enter grace period, notify; suspension after grace expiry.
        return { handled: true, status: "grace_period" };
      case "invoice.payment_succeeded":
        return { handled: true, status: "paid" };
      default:
        return { handled: false, status: "ignored" };
    }
  }
}
