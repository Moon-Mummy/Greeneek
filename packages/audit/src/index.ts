import type { Harness } from "@greeneek/core";
import { AuditStore } from "./store";

export { AuditStore };

/** Audit seam wiring: a projection of SessionEvents into the append-only store. */
export function registerAuditRows(harness: Harness): void {
  harness
    .add({ id: "audit.store", type: "audit.store", enabled: true })
    .add({ id: "audit.retention", type: "audit.retention", options: { months: 12 } });
}

export function attachAuditProjection(store: AuditStore, emit: (event: Parameters<typeof store.record>[0], ...rest: unknown[]) => void): void {
  // Placeholder for event → audit projection wiring; the server attaches a
  // SessionEvent listener that records "session.start", "tool.execute", etc.
  void store;
  void emit;
}
