import { mkdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import type { SessionEvent, TelemetrySink } from "@greeneek/core";

/** Quiet console sink — one line per event, prefixed with the brand. */
export class ConsoleSink implements TelemetrySink {
  constructor(private silent = process.env.GREENEK_VERBOSE !== "1") {}

  emit(event: SessionEvent): void {
    if (this.silent) return;
    const brief = JSON.stringify(event.data)?.slice(0, 160);
    console.log(`[greeneek:${event.type}] ${brief}`);
  }
}

/** OpenTelemetry-compatible exporter (OTLP/JSON lines; a gateway can ship it). */
export class OTelJsonlSink implements TelemetrySink {
  constructor(private file?: string) {}

  emit(event: SessionEvent): void {
    if (!this.file) return;
    mkdirSync(join(this.file, ".."), { recursive: true });
    appendFileSync(
      this.file,
      `${JSON.stringify({
        resourceSpans: [
          {
            resource: { attributes: [{ key: "service.name", value: { stringValue: "greeneek" } }] },
            scopeSpans: [
              {
                scope: { name: "greeneek.telemetry" },
                spans: [
                  {
                    name: event.type,
                    timeUnixNano: BigInt(event.ts) * 1000000n,
                    attributes: Object.entries(structured(event.data)).map(([k, v]) => ({
                      key: k,
                      value: { stringValue: String(v) },
                    })),
                  },
                ],
              },
            ],
          },
        ],
      })}\n`,
      "utf8",
    );
  }
}

function structured(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object") return data as Record<string, unknown>;
  return { value: data };
}
