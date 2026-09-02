/** Core shared types for the Greeneek harness. */

export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  id: string;
  role: Role;
  content?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
  reasoningContent?: string;
  images?: { dataUrl: string; mimeType: string; name?: string }[];
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export interface ToolResult {
  callId: string;
  name: string;
  ok: boolean;
  output: string;
  durationMs: number;
  usage?: Usage;
}

export interface ApprovalRequest {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  requireApproval: boolean;
}

export type ApprovalPolicy = "always" | "auto" | "never";

export interface ProfilePatchRow {
  id: string;
  type: string;
  enabled?: boolean;
  options?: Record<string, unknown>;
}

/** Public surface of a model adapter registered on the ctx.llm seam. */
export interface ModelAdapter {
  readonly provider: string;
  readonly model: string;
  readonly pricing: { inputPerMToken: number; outputPerMToken: number };
  stream(
    messages: Message[],
    options: { tools?: ToolDefinition[]; signal?: AbortSignal },
  ): AsyncGenerator<StreamEvent>;
}

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "toolCalls"; calls: ToolCall[] }
  | { type: "usage"; usage: Usage };

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  requireApproval?: boolean;
}

export interface ToolContext {
  secrets: Record<string, string | undefined>;
  workingDir: string;
  log(message: string): void;
}

export interface HarnessTool {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<string>;
}

export interface SystemPromptSection {
  name: string;
  priority: number;
  content: string;
}

export type SessionEventType =
  | "session/start"
  | "session/end"
  | "turn/start"
  | "assistant/stream"
  | "assistant/reasoning"
  | "assistant/message"
  | "tool/start"
  | "tool/end"
  | "turn/end"
  | "metadata";

export interface SessionEvent {
  type: SessionEventType;
  ts: number;
  sessionId: string;
  data: unknown;
}
