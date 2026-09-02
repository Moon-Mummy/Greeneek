import type { SessionEvent, TelemetrySink } from "@greeneek/core";

export interface PlanTier {
  id: string;
  name: string;
  monthlyLimitUsd: number;
  monthlyTokens: number;
  maxConcurrentSessions: number;
}

export const TIERS: Record<string, PlanTier> = {
  free: { id: "free", name: "Free", monthlyLimitUsd: 0, monthlyTokens: 100_000, maxConcurrentSessions: 1 },
  pro: { id: "pro", name: "Pro", monthlyLimitUsd: 20, monthlyTokens: 5_000_000, maxConcurrentSessions: 5 },
  team: { id: "team", name: "Team", monthlyLimitUsd: 150, monthlyTokens: 50_000_000, maxConcurrentSessions: 25 },
  enterprise: { id: "enterprise", name: "Enterprise", monthlyLimitUsd: Number.MAX_SAFE_INTEGER, monthlyTokens: Number.MAX_SAFE_INTEGER, maxConcurrentSessions: Number.MAX_SAFE_INTEGER },
};

/**
 * Usage metering (feature 02).
 *
 * Meters tokens at agent/request, converts to cost at the model price map,
 * and enforces plan-tier limits pre-execution. `usage` is the single source
 * the Stripe invoice projection reads.
 */
export class UsageMeter {
  private used = { tokens: 0, usd: 0, requests: 0 };
  readonly tier: PlanTier;

  constructor(tierId = process.env.GREENEK_PLAN ?? "free") {
    this.tier = TIERS[tierId] ?? TIERS.free;
  }

  record(inputTokens: number, outputTokens: number, costUsd: number): { tokens: number; usd: number; requests: number } {
    this.used.tokens += inputTokens + outputTokens;
    this.used.usd += costUsd;
    this.used.requests += 1;
    return { ...this.used };
  }

  /** Pre-execution entitlement check at the request seam. */
  canRun(): { ok: boolean; reason?: string } {
    // A $0 tier budget means "no paid spend allowed" (token cap governs);
    // a positive budget gates on dollars spent.
    if (this.tier.monthlyLimitUsd > 0 && this.used.usd >= this.tier.monthlyLimitUsd) {
      return { ok: false, reason: `Monthly spend limit reached ($${this.tier.monthlyLimitUsd} on ${this.tier.name}).` };
    }
    if (this.used.tokens >= this.tier.monthlyTokens) {
      return { ok: false, reason: `Monthly token allowance reached (${this.tier.monthlyTokens.toLocaleString()} on ${this.tier.name}).` };
    }
    return { ok: true };
  }

  summary(): typeof this.used {
    return { ...this.used };
  }
}

export class MeteringSink implements TelemetrySink {
  constructor(private meter: UsageMeter) {}

  emit(event: SessionEvent): void {
    if (event.type === "assistant/message") {
      const data = event.data as { usage?: { inputTokens: number; outputTokens: number }; cost?: number };
      if (data?.usage) this.meter.record(data.usage.inputTokens, data.usage.outputTokens, data.cost ?? 0);
    }
  }
}
