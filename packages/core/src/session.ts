import { EventEmitter } from "node:events";
import { mkdirSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { HOME_DIR_NAME } from "@greeneek/brand";
import type { SessionEvent } from "./types";

/**
 * Durable session log.
 *
 * Every session writes an append-only JSONL file under ~/.greeneek/sessions
 * and emits the same events in-process for projections (Web UI, audit store,
 * eval replay).
 */
export class SessionLog extends EventEmitter {
  readonly sessionId: string = randomUUID();
  readonly dir: string;
  private file: string;
  private opened = false;

  constructor(customDir?: string) {
    super();
    this.dir = customDir ?? join(homedir(), HOME_DIR_NAME, "sessions");
    this.file = join(this.dir, `${this.sessionId}.jsonl`);
  }

  append(event: SessionEvent): void {
    if (!this.opened) {
      mkdirSync(this.dir, { recursive: true });
      this.opened = true;
    }
    appendFileSync(this.file, `${JSON.stringify(event)}\n`, "utf8");
    this.emit("event", event);
  }

  emitEvent(type: SessionEvent["type"], data: unknown): SessionEvent {
    const event: SessionEvent = {
      type,
      ts: Date.now(),
      sessionId: this.sessionId,
      data,
    };
    this.append(event);
    return event;
  }

  path(): string {
    return this.file;
  }

  static resumeDir(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return require("node:fs")
      .readdirSync(dir)
      .filter((f: string) => f.endsWith(".jsonl"))
      .sort()
      .reverse();
  }
}
