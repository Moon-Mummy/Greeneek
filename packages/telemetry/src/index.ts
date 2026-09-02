import type { Harness } from "@greeneek/core";
import { ConsoleSink, OTelJsonlSink } from "./sinks";
import { CostLedger } from "./cost";
import { AlertEngine } from "./alerts";

export { ConsoleSink, OTelJsonlSink, CostLedger, AlertEngine };

/**
 * Registers telemetry rows: sinks, OTel export, cost ledger, alerts.
 * Patching `telemetry.otlp.endpoint` or `telemetry.sink` is the documented
 * way to repoint analytics at Greeneek's own sink.
 */
export function registerTelemetryRows(harness: Harness): void {
  harness
    .add({ id: "telemetry.sink.console", type: "telemetry.sink", options: { verbose: false } })
    .add({ id: "telemetry.otlp", type: "telemetry.otlp", options: { endpoint: "", exportPath: process.env.GREENEK_OTEL_EXPORT_PATH ?? "" } })
    .add({ id: "telemetry.cost", type: "telemetry.cost", enabled: true })
    .add({ id: "telemetry.alerts", type: "telemetry.alerts", options: { failureRateThreshold: 0.2, windowMs: 60000, minSamples: 5 } })
    .add({ id: "telemetry.default", type: "telemetry.default", options: { enabled: true } });
}
