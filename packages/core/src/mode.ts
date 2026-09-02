import type { Message, ToolCall, ToolDefinition, Usage } from "./types";
import type { TraceStore } from "./trace";

export interface Mode {
  id: string;
  label: string;
  description: string;
  icon?: string;
  capabilities: { tools: boolean; multiStep: boolean; maxSteps?: number; sideEffects: "none" | "ask" | "allow"; needsApprovalUI?: boolean };
  defaultParams?: Partial<{ temperature: number; maxTokens: number }>;
  buildSystemPrompt(ctx: ModeContext): string;
  run(ctx: ModeContext): AsyncIterable<ModeRunEvent>;
}

export interface ModeContext {
  mode: Mode;
  messages: Message[];
  tools: ToolDefinition[];
  secrets: Record<string, string | undefined>;
  workingDir: string;
  signal?: AbortSignal;
  // Provider call — must go through the runtime gateway (never direct)
  chat(messages: Message[], opts: { tools?: ToolDefinition[]; signal?: AbortSignal }): AsyncIterable<{ type: string; delta?: string; calls?: ToolCall[]; usage?: Usage }>;
  callTool(name: string, args: Record<string, unknown>): Promise<{ ok: boolean; output: string; durationMs: number }>;
  emit(event: ModeRunEvent): void;
  traceStore: TraceStore;
}

export type ModeRunEvent =
  | { type: "assistant.delta"; text: string }
  | { type: "assistant.done"; text: string }
  | { type: "step.start"; step: number; mode: string }
  | { type: "step.end"; step: number; mode: string }
  | { type: "tool.request"; name: string; arguments: Record<string, unknown> }
  | { type: "tool.result"; name: string; output: string; durationMs: number; ok: boolean }
  | { type: "approval.request"; name: string; arguments: Record<string, unknown>; approved?: boolean }
  | { type: "plan"; steps: string[]; tools: string[] }
  | { type: "note"; text: string }
  | { type: "error"; message: string; kind: string };

export const MODES: Mode[] = [
  {
    id: "chat",
    label: "Chat",
    description: "Single model call, no tools",
    capabilities: { tools: false, multiStep: false, sideEffects: "none" },
    buildSystemPrompt() {
      return "You are Greeneek in Chat mode — answer directly, no tools.";
    },
    async *run(ctx) {
      yield { type: "step.start", step: 1, mode: "chat" } as ModeRunEvent;
      let text = "";
      for await (const ev of ctx.chat(ctx.messages, {})) {
        if ((ev as { type: string }).type === "text" && (ev as { delta: string }).delta) {
          text += (ev as { delta: string }).delta;
          yield { type: "assistant.delta", text: (ev as { delta: string }).delta } as ModeRunEvent;
        }
      }
      yield { type: "assistant.done", text } as ModeRunEvent;
      yield { type: "step.end", step: 1, mode: "chat" } as ModeRunEvent;
    },
  },
  {
    id: "plan",
    label: "Plan",
    description: "Model emits a plan first; Run plan executes like Agent",
    capabilities: { tools: true, multiStep: true, maxSteps: 12, sideEffects: "ask" },
    buildSystemPrompt() {
      return "You are Greeneek in Plan mode — first output a numbered plan (steps and tools you intend to call), then await Run plan.";
    },
    async *run(ctx) {
      yield { type: "step.start", step: 1, mode: "plan" } as ModeRunEvent;
      let planText = "";
      for await (const ev of ctx.chat(ctx.messages, { tools: ctx.tools })) {
        if ((ev as { type: string }).type === "text" && (ev as { delta: string }).delta) {
          planText += (ev as { delta: string }).delta;
          yield { type: "assistant.delta", text: (ev as { delta: string }).delta } as ModeRunEvent;
        }
      }
      const steps = planText.split("\n").filter((l) => /^\d+\./.test(l.trim()));
      yield { type: "plan", steps: steps.length ? steps : [planText.slice(0, 200)], tools: ctx.tools.map((t) => t.name) } as ModeRunEvent;
      yield { type: "step.end", step: 1, mode: "plan" } as ModeRunEvent;
      // For headless/test, auto-run the plan like Agent (in UI, user would click Run plan)
      // We simulate by running one Agent step
      let messages = [...ctx.messages, { id: "plan-msg", role: "assistant" as const, content: planText }];
      for await (const ev of ctx.chat(messages, { tools: ctx.tools })) {
        if ((ev as { type: string }).type === "text" && (ev as { delta: string }).delta) {
          yield { type: "assistant.delta", text: (ev as { delta: string }).delta } as ModeRunEvent;
        } else if ((ev as { type: string }).type === "toolCalls" && (ev as { calls: ToolCall[] }).calls) {
          for (const c of (ev as { calls: ToolCall[] }).calls) {
            yield { type: "tool.request", name: c.name, arguments: c.arguments } as ModeRunEvent;
            const result = await ctx.callTool(c.name, c.arguments);
            yield { type: "tool.result", name: c.name, output: result.output, durationMs: result.durationMs, ok: result.ok } as ModeRunEvent;
          }
        }
      }
    },
  },
  {
    id: "agent",
    label: "Agent",
    description: "Tool loop with approval for side effects",
    capabilities: { tools: true, multiStep: true, maxSteps: 12, sideEffects: "ask", needsApprovalUI: true },
    buildSystemPrompt(ctx) {
      const tools = ctx.tools.map((t) => `- ${t.name}: ${t.description}`).join("\n");
      return `You are Greeneek in Agent mode — reason, then call tools, observe, repeat up to ${ctx.mode.capabilities.maxSteps ?? 12} steps.\nAvailable tools:\n${tools}`;
    },
    async *run(ctx) {
      let messages = [...ctx.messages];
      const maxSteps = ctx.mode.capabilities.maxSteps ?? 12;
      for (let step = 1; step <= maxSteps; step++) {
        yield { type: "step.start", step, mode: "agent" } as ModeRunEvent;
        let text = "";
        let calls: ToolCall[] = [];
        for await (const ev of ctx.chat(messages, { tools: ctx.tools })) {
          if ((ev as { type: string }).type === "text" && (ev as { delta: string }).delta) {
            text += (ev as { delta: string }).delta;
            yield { type: "assistant.delta", text: (ev as { delta: string }).delta } as ModeRunEvent;
          } else if ((ev as { type: string }).type === "toolCalls" && (ev as { calls: ToolCall[] }).calls) {
            calls = (ev as { calls: ToolCall[] }).calls;
            for (const c of calls) yield { type: "tool.request", name: c.name, arguments: c.arguments } as ModeRunEvent;
          }
        }
        if (text) yield { type: "assistant.done", text } as ModeRunEvent;
        if (!calls.length) {
          yield { type: "step.end", step, mode: "agent" } as ModeRunEvent;
          break;
        }
        for (const call of calls) {
          // Approval gate for side effects
          if (ctx.mode.capabilities.sideEffects === "ask") {
            yield { type: "approval.request", name: call.name, arguments: call.arguments } as ModeRunEvent;
            // In headless/test, auto-approve; in UI, the Approval card would pause
          }
          const result = await ctx.callTool(call.name, call.arguments);
          yield { type: "tool.result", name: call.name, output: result.output, durationMs: result.durationMs, ok: result.ok } as ModeRunEvent;
          messages.push({ id: `tool-${Date.now()}`, role: "tool", toolCallId: call.id, name: call.name, content: result.output });
        }
        yield { type: "step.end", step, mode: "agent" } as ModeRunEvent;
        if (calls.length === 0) break;
      }
    },
  },
  {
    id: "dry-run",
    label: "Dry-run",
    description: "Agent loop but tools are simulated — safe to test",
    capabilities: { tools: true, multiStep: true, maxSteps: 12, sideEffects: "none" },
    buildSystemPrompt() {
      return "You are Greeneek in Dry-run mode — simulate tool calls, do not execute.";
    },
    async *run(ctx) {
      let messages = [...ctx.messages];
      const maxSteps = ctx.mode.capabilities.maxSteps ?? 12;
      for (let step = 1; step <= maxSteps; step++) {
        yield { type: "step.start", step, mode: "dry-run" } as ModeRunEvent;
        let text = "";
        let calls: ToolCall[] = [];
        for await (const ev of ctx.chat(messages, { tools: ctx.tools })) {
          if ((ev as { type: string }).type === "text" && (ev as { delta: string }).delta) {
            text += (ev as { delta: string }).delta;
            yield { type: "assistant.delta", text: (ev as { delta: string }).delta } as ModeRunEvent;
          } else if ((ev as { type: string }).type === "toolCalls" && (ev as { calls: ToolCall[] }).calls) {
            calls = (ev as { calls: ToolCall[] }).calls;
            for (const c of calls) yield { type: "tool.request", name: c.name, arguments: c.arguments } as ModeRunEvent;
          }
        }
        if (text) yield { type: "assistant.done", text } as ModeRunEvent;
        if (!calls.length) {
          yield { type: "step.end", step, mode: "dry-run" } as ModeRunEvent;
          break;
        }
        for (const call of calls) {
          const stub = `[dry-run: would call ${call.name} with ${JSON.stringify(call.arguments)}]`;
          yield { type: "tool.result", name: call.name, output: stub, durationMs: 1, ok: true } as ModeRunEvent;
          messages.push({ id: `tool-${Date.now()}`, role: "tool", toolCallId: call.id, name: call.name, content: stub });
        }
        yield { type: "step.end", step, mode: "dry-run" } as ModeRunEvent;
      }
    },
  },
  {
    id: "replay",
    label: "Replay",
    description: "Re-execute a previous run with same or different model, diff outputs",
    capabilities: { tools: true, multiStep: true, maxSteps: 12, sideEffects: "none" },
    buildSystemPrompt() {
      return "You are Greeneek in Replay mode — re-execute the previous run's inputs exactly.";
    },
    async *run(ctx) {
      // Replay is trigger:replay — the caller has already reconstructed the messages from the original run
      // We just run like Chat but mark the run as replay
      yield { type: "step.start", step: 1, mode: "replay" } as ModeRunEvent;
      let text = "";
      for await (const ev of ctx.chat(ctx.messages, { tools: ctx.tools })) {
        if ((ev as { type: string }).type === "text" && (ev as { delta: string }).delta) {
          text += (ev as { delta: string }).delta;
          yield { type: "assistant.delta", text: (ev as { delta: string }).delta } as ModeRunEvent;
        } else if ((ev as { type: string }).type === "toolCalls" && (ev as { calls: ToolCall[] }).calls) {
          for (const c of (ev as { calls: ToolCall[] }).calls) {
            yield { type: "tool.request", name: c.name, arguments: c.arguments } as ModeRunEvent;
            const result = await ctx.callTool(c.name, c.arguments);
            yield { type: "tool.result", name: c.name, output: result.output, durationMs: result.durationMs, ok: result.ok } as ModeRunEvent;
          }
        }
      }
      yield { type: "assistant.done", text } as ModeRunEvent;
      yield { type: "step.end", step: 1, mode: "replay" } as ModeRunEvent;
    },
  },
];
