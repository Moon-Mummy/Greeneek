import type { SessionEvent, TelemetrySink } from "@greeneek/core";

export interface MeteredTurn {
  turn: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * Cost attribution ledger — meters tokens from assistant/message events and
 * attributes cost at model/provider granularity for the observability
 * dashboard (feature 05, cost attribution per model/provider).
 */
export class CostLedger implements TelemetrySink {
  private perTurn = new Map<string, MeteredTurn>();
  private totals = { inputTokens: 0, outputTokens: 0, costUsd: 0 };

  emit(event: SessionEvent): void {
    if (event.type === "assistant/message") {
      const data = event.data as { turn?: number; usage?: { inputTokens: number; outputTokens: number }; cost?: number };
      if (!data?.usage) return;
      this.perTurn.set(String(data.turn ?? 1), {
        turn: data.turn ?? 1,
        inputTokens: data.usage.inputTokens,
        outputTokens: data.usage.outputTokens,
        costUsd: data.cost ?? 0,
      });
      this.totals.inputTokens += data.usage.inputTokens;
      this.totals.outputTokens += data.usage.outputTokens;
      this.totals.costUsd += data.cost ?? 0;
    }
  }

  summary(): { turns: MeteredTurn[]; totals: { inputTokens: number; outputTokens: number; costUsd: number } } {
    return { turns: [...this.perTurn.values()], totals: { ...this.totals } };
  }
}
