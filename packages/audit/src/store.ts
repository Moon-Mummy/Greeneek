import { createHash } from "node:crypto";
import { mkdirSync, appendFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { HOME_DIR_NAME } from "@greeneek/brand";

export interface AuditEntry {
  seq: number;
  ts: number;
  actor: string;
  action: string;
  resource: string;
  detail: Record<string, unknown>;
  prevHash: string;
  hash: string;
}

/**
 * Append-only, hash-chained compliance audit store (feature 10).
 *
 * Entries are appended to a separate store (default ~/.greeneek/audit), each
 * chained to its predecessor's hash — tamper-evidence without a server. The
 * store exposes query + export, and every entry is hash-verified on read.
 */
export class AuditStore {
  private seq = 0;
  private prevHash = "genesis";
  private file: string;

  constructor(customDir?: string) {
    const dir = customDir ?? join(homedir(), HOME_DIR_NAME, "audit");
    this.file = join(dir, "audit.jsonl");
    if (existsSync(this.file)) {
      const { seq, prevHash } = this.replay();
      this.seq = seq;
      this.prevHash = prevHash;
    } else {
      mkdirSync(dir, { recursive: true });
    }
  }

  private replay(): { seq: number; prevHash: string } {
    let seq = 0;
    let prevHash = "genesis";
    for (const parsed of this.lines()) {
      if (parsed.prevHash !== prevHash) throw new Error("Audit chain integrity failure.");
      if (hashEntry(parsed) !== parsed.hash) throw new Error("Audit entry tampered.");
      seq = parsed.seq;
      prevHash = parsed.hash;
    }
    return { seq, prevHash };
  }

  private lines(): AuditEntry[] {
    const raw = readFileSync(this.file, "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as AuditEntry);
  }

  record(action: string, resource: string, detail: Record<string, unknown> = {}, actor = "system"): AuditEntry {
    this.seq += 1;
    const entry: AuditEntry = {
      seq: this.seq,
      ts: Date.now(),
      actor,
      action,
      resource,
      detail,
      prevHash: this.prevHash,
      hash: "",
    };
    entry.hash = hashEntry(entry);
    this.prevHash = entry.hash;
    appendFileSync(this.file, `${JSON.stringify(entry)}\n`, "utf8");
    return entry;
  }

  query(filter?: { action?: string; actor?: string; since?: number; limit?: number }): AuditEntry[] {
    let entries = this.replayEntries();
    if (filter?.action) entries = entries.filter((e) => e.action === filter.action);
    if (filter?.actor) entries = entries.filter((e) => e.actor === filter.actor);
    if (filter?.since) entries = entries.filter((e) => e.ts >= filter.since!);
    if (filter?.limit) entries = entries.slice(-filter.limit);
    return entries;
  }

  replayEntries(): AuditEntry[] {
    let prev = "genesis";
    const out: AuditEntry[] = [];
    for (const e of this.lines()) {
      if (e.prevHash !== prev) throw new Error("Audit chain integrity failure.");
      if (hashEntry(e) !== e.hash) throw new Error("Audit entry tampered.");
      prev = e.hash;
      out.push(e);
    }
    return out;
  }

  export(format: "jsonl" | "csv"): string {
    const entries = this.replayEntries();
    if (format === "csv") {
      const header = "seq,ts,actor,action,resource,hash";
      const rows = entries.map((e) => `${e.seq},${e.ts},${e.actor},${e.action},${JSON.stringify(e.resource)},${e.hash}`);
      return [header, ...rows].join("\n");
    }
    return entries.map((e) => JSON.stringify(e)).join("\n");
  }

  path(): string {
    return this.file;
  }

  static list(customDir?: string): string[] {
    const dir = customDir ?? join(homedir(), HOME_DIR_NAME, "audit");
    if (!existsSync(dir)) return [];
    return readdirSync(dir);
  }
}

function hashEntry(entry: Omit<AuditEntry, "hash">): string {
  return createHash("sha256").update(JSON.stringify({ ...entry, hash: "" })).digest("hex");
}
