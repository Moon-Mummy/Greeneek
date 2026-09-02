import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Run, TraceSpan, TraceStore } from "@greeneek/core";

export class LocalTraceStore implements TraceStore {
  private dir: string;
  private runs: Map<string, Run> = new Map();
  private spans: Map<string, TraceSpan[]> = new Map();
  private retentionDays: number;
  private maxSizeMB: number;

  constructor(
    dir?: string,
    opts: { retentionDays?: number; maxSizeMB?: number } = {},
  ) {
    this.dir = dir ?? join(homedir(), ".greeneek", "traces");
    this.retentionDays = opts.retentionDays ?? 30;
    this.maxSizeMB = opts.maxSizeMB ?? 100;
    mkdirSync(this.dir, { recursive: true });
    this.loadAll();
    this.sweep();
  }

  appendRun(run: Run): void {
    // Redaction is done in Runtime; store as-is
    this.runs.set(run.runId, run);
    this.appendJsonl("runs", run);
  }

  appendSpan(span: TraceSpan): void {
    const list = this.spans.get(span.runId) ?? [];
    list.push(span);
    this.spans.set(span.runId, list);
    this.appendJsonl("spans", span);
  }

  queryRuns(filter: { conversationId?: string; modelId?: string; status?: string; limit?: number } = {}): Run[] {
    let out = [...this.runs.values()];
    if (filter.conversationId) out = out.filter((r) => r.conversationId === filter.conversationId);
    if (filter.modelId) out = out.filter((r) => r.modelId === filter.modelId);
    if (filter.status) out = out.filter((r) => r.status === filter.status);
    out.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
    if (filter.limit) out = out.slice(0, filter.limit);
    return out;
  }

  querySpans(runId: string): TraceSpan[] {
    return this.spans.get(runId) ?? [];
  }

  exportJson(): string {
    return JSON.stringify({ runs: [...this.runs.values()], spans: [...this.spans.entries()].flatMap(([, spans]) => spans) }, null, 2);
  }

  clear(): void {
    this.runs.clear();
    this.spans.clear();
    // Remove files
    for (const f of readdirSync(this.dir)) {
      if (f.endsWith(".jsonl")) {
        try {
          unlinkSync(join(this.dir, f));
        } catch {
          // ignore
        }
      }
    }
  }

  private appendJsonl(kind: string, obj: unknown): void {
    const day = new Date().toISOString().slice(0, 10);
    const file = join(this.dir, `${day}.${kind}.jsonl`);
    try {
      mkdirSync(this.dir, { recursive: true });
      appendFileSync(file, JSON.stringify(obj) + "\n", "utf8");
    } catch (e) {
      console.warn(`[greeneek:trace-store] append ${kind} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    this.sweep();
  }

  private loadAll(): void {
    if (!existsSync(this.dir)) return;
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith(".jsonl")) continue;
      const file = join(this.dir, f);
      try {
        const content = readFileSync(file, "utf8");
        for (const line of content.split("\n")) {
          if (!line.trim()) continue;
          try {
            const obj = JSON.parse(line);
            if (f.includes(".runs.")) {
              const run = obj as Run;
              if (run.runId) this.runs.set(run.runId, run);
            } else if (f.includes(".spans.")) {
              const span = obj as TraceSpan;
              if (span.runId) {
                const list = this.spans.get(span.runId) ?? [];
                list.push(span);
                this.spans.set(span.runId, list);
              }
            }
          } catch {
            // skip malformed
          }
        }
      } catch {
        // ignore
      }
    }
  }

  private sweep(): void {
    // Retention by days: delete files older than retentionDays
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith(".jsonl")) continue;
      const file = join(this.dir, f);
      try {
        const stat = statSync(file);
        if (stat.mtimeMs < cutoff) {
          unlinkSync(file);
          console.log(`[greeneek:trace-store] swept old trace file ${f}`);
        }
      } catch {
        // ignore
      }
    }
    // Size cap: if total size > maxSizeMB, delete oldest files first
    let total = 0;
    const files = readdirSync(this.dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const file = join(this.dir, f);
        try {
          const s = statSync(file);
          total += s.size;
          return { file, mtime: s.mtimeMs, size: s.size };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as Array<{ file: string; mtime: number; size: number }>;
    files.sort((a, b) => a.mtime - b.mtime);
    const maxBytes = this.maxSizeMB * 1024 * 1024;
    for (const f of files) {
      if (total <= maxBytes) break;
      try {
        unlinkSync(f.file);
        total -= f.size;
        console.log(`[greeneek:trace-store] swept trace file for size cap ${f.file}`);
      } catch {
        // ignore
      }
    }
  }
}
