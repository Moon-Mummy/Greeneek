import { randomUUID } from "node:crypto";
import type {
  ApprovalRequest,
  Message,
  ModelAdapter,
  SessionEvent,
  ToolCall,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ToolDefinition,
  ToolResult,
  Usage,
} from "./types";
import { ToolRegistry } from "./tools";
import { PromptAssembly } from "./prompt";
import { TelemetrySeam } from "./telemetry";
import type { Runtime, RunSpec } from "./trace";

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
  runtime?: Runtime;
  conversationId?: string;
  modeId?: string;
  modelId?: string;
  providerId?: string;
  signal?: AbortSignal;
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

  async run(task: string, signalOrOpts?: AbortSignal | { images?: { dataUrl: string; mimeType: string; name?: string }[]; signal?: AbortSignal }, maybeSignal?: AbortSignal): Promise<void> {
    const images = (signalOrOpts && typeof signalOrOpts === 'object' && 'images' in (signalOrOpts as Record<string, unknown>)) ? (signalOrOpts as { images?: { dataUrl: string; mimeType: string; name?: string }[] }).images : undefined;
    const signal = (maybeSignal ?? ((signalOrOpts instanceof AbortSignal) ? signalOrOpts : (signalOrOpts as { signal?: AbortSignal } | undefined)?.signal)) as AbortSignal | undefined;
    const maxSteps = this.opts.maxSteps ?? 12;
    const tools = this.opts.registry.list();
    // Build system prompt via Mode if available, otherwise default
    const modeId = this.opts.modeId ?? "chat";
    let systemPromptContent = this.opts.prompt.render();
    try {
      const { MODES } = await import("./mode");
      const mode = MODES.find((m) => m.id === modeId);
      if (mode) systemPromptContent = mode.buildSystemPrompt({ mode, messages: this.conversation, tools, secrets: this.opts.secrets ?? {}, workingDir: this.opts.workingDir ?? process.cwd(), signal, chat: async function* () {}, callTool: async () => ({ ok: true, output: "", durationMs: 0 }), emit: () => {}, traceStore: null as unknown as never });
    } catch {
      // ignore
    }
    const systemPrompt: Message = { id: randomUUID(), role: "system", content: systemPromptContent };

    this.emit("session/start", { agent: this.id, task, tools: tools.map((t) => t.name), mode: modeId });
    this.emit("turn/start", { turn: 1, task });
    this.conversation.push({ id: randomUUID(), role: "user", content: task, ...(images?.length ? { images } : {}) } as unknown as Message);

    let steps = 0;
    let totalUsage: Usage = { inputTokens: 0, outputTokens: 0 };

    while (steps < maxSteps) {
      steps += 1;
      let text = "";
      let reasoning = "";
      let calls: ToolCall[] = [];
      let usage: Usage = { inputTokens: 0, outputTokens: 0 };

      if (this.opts.runtime) {
        // Traced gateway — the ONLY way to call a provider (Phase 6.2)
        const spec: RunSpec = {
          conversationId: this.opts.conversationId ?? this.opts.sessionId,
          modeId: this.opts.modeId ?? "chat",
          modelId: this.opts.modelId ?? this.opts.adapter.model,
          providerId: this.opts.providerId ?? this.opts.adapter.provider,
          trigger: "user",
        };
        const span = this.opts.telemetry.span("llm.stream", { step: steps, provider: spec.providerId, runId: spec.conversationId });
        try {
          const adapter = this.opts.adapter;
          const conversation = this.conversation;
          const stream = this.opts.runtime.execute(
            spec,
            async function* ({ signal }: { signal: AbortSignal }) {
              const s = adapter.stream([systemPrompt, ...conversation], { tools, signal });
              for await (const ev of s) {
                if (ev.type === "text") yield { type: "assistant.delta", text: ev.delta } as never;
                else if ((ev as { type: string }).type === "reasoning") yield { type: "assistant.reasoning", text: (ev as unknown as { delta: string }).delta } as never;
                else if (ev.type === "toolCalls") for (const c of ev.calls) yield { type: "tool.request", name: c.name, arguments: c.arguments } as never;
                else if (ev.type === "usage") yield { type: "usage", promptTokens: ev.usage.inputTokens, completionTokens: ev.usage.outputTokens } as never;
              }
            },
            signal ?? this.opts.signal,
          );
          for await (const ev of stream) {
            const e = ev as unknown as { type: string; text?: string; name?: string; arguments?: Record<string, unknown>; promptTokens?: number; completionTokens?: number };
            if (e.type === "assistant.delta" && e.text) {
              text += e.text;
              this.emit("assistant/stream", { turn: steps, delta: e.text });
            } else if (e.type === "assistant.reasoning" && (e as unknown as { text?: string }).text) {
              const r = (e as unknown as { text: string }).text;
              reasoning += r;
              this.emit("assistant/reasoning", { turn: steps, delta: r });
            } else if (e.type === "tool.request" && e.name) {
              calls = [...calls, { id: `call_${randomUUID().slice(0, 8)}`, name: e.name, arguments: e.arguments ?? {} }];
            } else if (e.type === "usage") {
              usage = { inputTokens: e.promptTokens ?? 0, outputTokens: e.completionTokens ?? 0 };
            } else if (e.type === "error") {
              throw new Error((e as { message?: string }).message ?? "provider error");
            }
          }
        } finally {
          span.end();
        }
      } else {
        const span = this.opts.telemetry.span("llm.stream", { step: steps, provider: this.opts.adapter.provider });
        try {
          const stream = this.opts.adapter.stream([systemPrompt, ...this.conversation], { tools });
          for await (const event of stream) {
            if (event.type === "text") {
              text += event.delta;
              this.emit("assistant/stream", { turn: steps, delta: event.delta });
            } else if ((event as unknown as { type: string }).type === "reasoning") {
              const r = (event as unknown as { delta: string }).delta;
              reasoning += r;
              this.emit("assistant/reasoning", { turn: steps, delta: r });
            } else if (event.type === "toolCalls") {
              calls = event.calls;
            } else if (event.type === "usage") {
              usage = event.usage;
            }
          }
        } finally {
          span.end();
        }
      }

      totalUsage.inputTokens += usage.inputTokens;
      totalUsage.outputTokens += usage.outputTokens;

      const assistantMsg: Message = { id: randomUUID(), role: "assistant", content: text || undefined, reasoningContent: reasoning || undefined, toolCalls: calls.length ? calls : undefined } as unknown as Message;
      this.conversation.push(assistantMsg);
      this.emit("assistant/message", { turn: steps, content: text, reasoningContent: reasoning || undefined, toolCalls: calls.length ? calls : undefined, usage });

      if (!calls.length) break;
      // Chat mode has no tools — ignore any tool calls the model tried to make
      if (modeId === "chat" && calls.length) {
        this.emit("metadata", { kind: "mode.chat.tools_ignored", count: calls.length });
        break;
      }

      for (const call of calls) {
        let result: ToolResult;
        if (modeId === "dry-run") {
          const stub = `[dry-run: would call ${call.name} with ${JSON.stringify(call.arguments)}]`;
          result = { callId: call.id, name: call.name, ok: true, output: stub, durationMs: 1 };
          this.emit("tool/start", { callId: call.id, name: call.name, arguments: call.arguments });
          this.emit("tool/end", result);
        } else {
          result = await this.runTool(call);
        }
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
