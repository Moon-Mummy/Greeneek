import { randomUUID } from "node:crypto";
import type {
  ApprovalRequest,
  Message,
  ModelAdapter,
  SessionEvent,
  ToolCall,
  ToolResult,
  Usage,
} from "./types";
import { ToolRegistry } from "./tools";
import { PromptAssembly } from "./prompt";
import { TelemetrySeam } from "./telemetry";

export interface AgentLoopOptions {
  adapter: ModelAdapter;
  registry: ToolRegistry;
  prompt: PromptAssembly;
  telemetry: TelemetrySeam;
  sessionId: string;
  maxSteps?: number;
  approval?: (req: ApprovalRequest) => Promise<boolean>;
  onEvent?: (event: SessionEvent) => void;
  workingDir?: string;
  secrets?: Record<string, string | undefined>;
}

/**
 * The agent loop.
 *
 * Driver: user message → adapter stream → tool executions with approval →
 * turn/end in the session log. The loop is mounted beside, never inside,
 * individual capabilities: providers, tools, telemetry and accounting are all
 * seam visitors.
 */
export class AgentLoop {
  readonly id = randomUUID();
  private conversation: Message[] = [];
  private opts: AgentLoopOptions;

  constructor(options: AgentLoopOptions) {
    this.opts = options;
    this.opts.registry.onBeforeExecute(async (req) => {
      if (req.requireApproval && this.opts.approval) return this.opts.approval(req);
      // Default policy: read-only tools auto-approve; shell/execute surfaces
      // stay gated unless GREENEK_AUTO_APPROVE=1 is explicitly set.
      if (!req.requireApproval) return true;
      return this.opts.secrets?.["GREENEK_AUTO_APPROVE"] === "1";
    });
  }

  private emit(type: SessionEvent["type"], data: unknown): SessionEvent {
    const event: SessionEvent = { type, ts: Date.now(), sessionId: this.opts.sessionId, data };
    this.opts.telemetry.emit(type, this.opts.sessionId, data);
    try {
      this.opts.onEvent?.(event);
    } catch {
      // Projections must never break the loop.
    }
    return event;
  }

  async run(task: string): Promise<void> {
    const maxSteps = this.opts.maxSteps ?? 12;
    const tools = this.opts.registry.list();
    const systemPrompt: Message = { id: randomUUID(), role: "system", content: this.opts.prompt.render() };

    this.emit("session/start", { agent: this.id, task, tools: tools.map((t) => t.name) });
    this.emit("turn/start", { turn: 1, task });
    this.conversation.push({ id: randomUUID(), role: "user", content: task });

    let steps = 0;
    let totalUsage: Usage = { inputTokens: 0, outputTokens: 0 };

    while (steps < maxSteps) {
      steps += 1;
      const span = this.opts.telemetry.span("llm.stream", { step: steps, provider: this.opts.adapter.provider });
      let text = "";
      let calls: ToolCall[] = [];
      let usage: Usage = { inputTokens: 0, outputTokens: 0 };

      try {
        const stream = this.opts.adapter.stream([systemPrompt, ...this.conversation], { tools });
        for await (const event of stream) {
          if (event.type === "text") {
            text += event.delta;
            this.emit("assistant/stream", { turn: steps, delta: event.delta });
          } else if (event.type === "toolCalls") {
            calls = event.calls;
          } else if (event.type === "usage") {
            usage = event.usage;
          }
        }
      } finally {
        span.end();
      }

      totalUsage.inputTokens += usage.inputTokens;
      totalUsage.outputTokens += usage.outputTokens;

      const assistantMsg: Message = { id: randomUUID(), role: "assistant", content: text || undefined, toolCalls: calls.length ? calls : undefined };
      this.conversation.push(assistantMsg);
      this.emit("assistant/message", { turn: steps, content: text, toolCalls: calls.length ? calls : undefined, usage });

      if (!calls.length) break; // final answer

      for (const call of calls) {
        const result = await this.runTool(call);
        this.conversation.push({
          id: randomUUID(),
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: result.output,
        });
      }

      // A turn boundary after each model+tool wave keeps the session log
      // projectionable (turn/end) while the step loop continues.
      this.emit("turn/end", { turn: steps, steps, totalUsage });
    }

    const cost = this.cost(totalUsage);
    this.emit("turn/end", { turn: steps, steps, totalUsage, cost, finished: true });
    this.emit("session/end", { task, steps, totalUsage, cost });
  }

  private async runTool(call: ToolCall): Promise<ToolResult> {
    const start = Date.now();
    this.emit("tool/start", { callId: call.id, name: call.name, arguments: call.arguments });
    const toolSpan = this.opts.telemetry.span("tool.execute", { tool: call.name });
    const res = await this.opts.registry.execute(
      call.id,
      call.name,
      call.arguments,
      {
        secrets: this.opts.secrets ?? {},
        workingDir: this.opts.workingDir ?? process.cwd(),
        log: (m) => this.emit("metadata", { kind: "tool.log", tool: call.name, message: m }),
      },
    );
    toolSpan.end();
    const result: ToolResult = {
      callId: call.id,
      name: call.name,
      ok: res.ok,
      output: res.output,
      durationMs: Date.now() - start,
    };
    this.emit("tool/end", result);
    return result;
  }

  private cost(usage: Usage): number {
    const p = this.opts.adapter.pricing;
    return (usage.inputTokens / 1_000_000) * p.inputPerMToken + (usage.outputTokens / 1_000_000) * p.outputPerMToken;
  }
}
