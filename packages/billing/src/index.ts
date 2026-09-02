import type { Harness } from "@greeneek/core";
import { TIERS, UsageMeter, MeteringSink } from "./meter";
import { StripeWebhooks } from "./stripe";

export { TIERS, UsageMeter, MeteringSink, StripeWebhooks };

/** Billing rows: plans, meter, Stripe webhook config. Disable billing with one patch row. */
export function registerBillingRows(harness: Harness): void {
  harness
    .add({ id: "billing.plans", type: "billing.plan", options: { tiers: Object.keys(TIERS) } })
    .add({ id: "billing.meter", type: "billing.meter", enabled: true })
    .add({ id: "billing.stripe", type: "billing.stripe", options: { webhookSecretEnv: "STRIPE_WEBHOOK_SECRET", priceIds: {} }, enabled: false })
    .add({ id: "billing.grace", type: "billing.grace", options: { days: 7 } });
}
