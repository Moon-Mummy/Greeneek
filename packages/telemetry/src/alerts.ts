import type { SessionEvent, TelemetrySink } from "@greeneek/core";

/**
 * Failure-rate regression alerts (feature 05).
 *
 * Watches tool/end events in a rolling window; if the failure rate crosses
 * `failureRateThreshold` the alert fires with the offending tool and a span
 * window — the data a Grafana alert or webhook would consume.
 */
export class AlertEngine implements TelemetrySink {
  private failures: Array<{ ts: number; tool: string }> = [];
  private runs: Array<{ ts: number; tool: string; ok: boolean }> = [];
  private lastAlert: number | null = null;

  constructor(
    private options: {
      windowMs?: number;
      failureRateThreshold?: number; // 0..1
      minSamples?: number;
      cooldownMs?: number;
      onAlert?: (alert: { tool: string; rate: number; windowMs: number; samples: number }) => void;
    } = {},
  ) {}

  emit(event: SessionEvent): void {
    if (event.type !== "tool/end") return;
    const data = event.data as { name?: string; ok?: boolean; durationMs?: number; callId?: string };
    const now = event.ts;
    const windowMs = this.options.windowMs ?? 60_000;
    const minSamples = this.options.minSamples ?? 5;
    const threshold = this.options.failureRateThreshold ?? 0.2;

    this.runs.push({ ts: now, tool: data.name ?? "?", ok: !!data.ok });
    this.runs = this.runs.filter((r) => now - r.ts <= windowMs);

    const byTool = new Map<string, { total: number; failed: number }>();
    for (const r of this.runs) {
      const bucket = byTool.get(r.tool) ?? { total: 0, failed: 0 };
      bucket.total += 1;
      if (!r.ok) bucket.failed += 1;
      byTool.set(r.tool, bucket);
    }

    for (const [tool, b] of byTool) {
      const rate = b.failed / b.total;
      if (b.total >= minSamples && rate > threshold && (this.lastAlert === null || now - this.lastAlert > (this.options.cooldownMs ?? 300_000))) {
        this.lastAlert = now;
        const alert = { tool, rate, windowMs, samples: b.total };
        if (this.options.onAlert) this.options.onAlert(alert);
        else console.warn(`[greeneek:alert] failure-rate regression on "${tool}" (${(rate * 100).toFixed(0)}% of ${b.total} in ${windowMs / 1000}s)`);
      }
    }
    void this.failures;
  }
}
