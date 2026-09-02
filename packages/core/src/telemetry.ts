import type { ProfilePatchRow, SessionEvent, SessionEventType } from "./types";

export interface TelemetrySink {
  emit(event: SessionEvent): void | Promise<void>;
}

export interface Span {
  name: string;
  start: number;
  attrs: Record<string, unknown>;
  end(): void;
}

/**
 * Telemetry capability seam.
 *
 * Base rows emit events here; providers (console, OpenTelemetry exporter,
 * cost ledger) subscribe as sinks. Repointing telemetry at your own sink is a
 * patch — no core edits.
 */
export class TelemetrySeam {
  private sinks = new Set<TelemetrySink>();

  subscribe(sink: TelemetrySink): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }

  emit(type: SessionEventType, sessionId: string, data: unknown): void {
    const event: SessionEvent = { type, ts: Date.now(), sessionId, data };
    for (const sink of this.sinks) {
      try {
        void sink.emit(event);
      } catch {
        // A telemetry sink must never break the loop.
      }
    }
  }

  /** Minimal in-process span — the seam an OTel exporter attaches to. */
  span(name: string, attrs: Record<string, unknown> = {}): Span {
    const start = Date.now();
    const durationMs = () => Date.now() - start;
    return {
      name,
      start,
      attrs,
      end: () => {
        this.emit("metadata", "span", { kind: "span", name, durationMs: durationMs(), attrs });
      },
    };
  }

  configure(row: ProfilePatchRow): void {
    if (row.options?.["sink"] === "none") {
      // Rows can be patched to disable every sink launched below.
      this.sinks.clear();
    }
  }
}
