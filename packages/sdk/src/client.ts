import type { SessionEvent } from "@greeneek/core";

export interface GreeneekClientOptions {
  endpoint: string;
  apiKey?: string;
}

/**
 * Greeneek TypeScript SDK — JSON-RPC-style clean client over the HTTP seam.
 * (feature surface for bundle/sdk-app: sessions, streamed turns, meta, dump.)
 */
export class GreeneekClient {
  constructor(private options: GreeneekClientOptions) {}

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}),
    };
  }

  async meta(): Promise<Record<string, unknown>> {
    return (await this.json("GET", "/api/meta")) as Record<string, unknown>;
  }

  async createSession(): Promise<{ id: string }> {
    return (await this.json("POST", "/api/sessions", {})) as { id: string };
  }

  async events(sessionId: string): Promise<SessionEvent[]> {
    const res = await this.json("GET", `/api/sessions/${sessionId}/events`);
    return (res as { events: SessionEvent[] }).events;
  }

  /** Stream a task; yields live session events until done. */
  async *runTask(sessionId: string, task: string): AsyncGenerator<SessionEvent> {
    const res = await fetch(`${this.options.endpoint}/api/sessions/${sessionId}/run`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ task }),
    });
    if (!res.ok || !res.body) throw new Error(`run failed: ${res.status} ${await res.text()}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const event = this.parseEvent(part);
        if (event) yield event;
      }
    }
  }

  async dumpConfig(): Promise<unknown> {
    return this.json("GET", "/api/config/dump");
  }

  async usage(): Promise<unknown> {
    return this.json("GET", "/api/usage");
  }

  private parseEvent(part: string): SessionEvent | null {
    const type = part.match(/^event: (.+)$/m)?.[1];
    const data = part.match(/^data: (.+)$/m)?.[1];
    if (!type || !data) return null;
    try {
      return JSON.parse(data) as SessionEvent;
    } catch {
      return null;
    }
  }

  private async json(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.options.endpoint}${path}`, {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${await res.text()}`);
    return res.json();
  }
}
