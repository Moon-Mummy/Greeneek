// PAL — Provider Abstraction Layer types (spec §4.2.1)
// This is the Single Source of Truth for provider & model shapes.
// Existing ModelInfo/Provider remain for backward compat; new PAL types are canonical.

export type ProviderType =
  | "openai-compatible" // Generic: Ollama, LM Studio, vLLM, LocalAI, etc.
  | "ollama" // Native Ollama (/api/tags, /api/chat)
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek" // BYOK only, never default
  | "openrouter"
  | "azure"
  | "custom";

export type ModelCapability =
  | "chat"
  | "vision"
  | "reasoning"
  | "tool_call"
  | "function_call"
  | "embedding"
  | "code"
  | "multimodality"
  | "streaming";

export interface PALModel {
  id: string;
  name: string;
  providerId: string;
  providerType: ProviderType;
  baseURL?: string;
  contextLength?: number;
  maxTokens?: number;
  vision?: boolean;
  reasoning?: boolean;
  tools?: boolean;
  streaming?: boolean;
  inputPrice?: number;
  outputPrice?: number;
  description?: string;
  tags?: string[];
  disabled?: boolean;
  isLocal?: boolean;
  available?: boolean;
}

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  baseURL: string;
  apiKeyRequired: boolean;
  defaultBaseURL?: string;
  models: PALModel[] | "auto";
  headers?: Record<string, string>;
  supportsStreaming: boolean;
  supportsVision?: boolean;
  supportsTools?: boolean;
  supportsReasoning?: boolean;
  isLocal?: boolean;
  enabled?: boolean;
  healthCheckEndpoint?: string;
  docsUrl?: string;
  icon?: string;
}

export type ChatRole = "user" | "assistant" | "system" | "tool";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  reasoningContent?: string;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  images?: MessageImage[];
  files?: MessageFile[];
  timestamp: number;
  model?: string;
  providerId?: string;
  finishReason?: string;
  tokenUsage?: TokenUsage;
  error?: string | null;
}

export interface ToolCall {
  id: string;
  type: "function" | "tool";
  function: {
    name: string;
    arguments: string;
  };
  result?: unknown;
}

export interface MessageImage {
  id: string;
  name: string;
  mimeType: string;
  dataUrl: string;
  size: number;
}

export interface MessageFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  content?: string;
  url?: string;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ChatCompletionParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stream?: boolean;
  stop?: string | string[];
  presencePenalty?: number;
  frequencyPenalty?: number;
  tools?: unknown[];
  toolChoice?: unknown;
  responseFormat?: unknown;
  reasoning?: boolean;
  systemPrompt?: string;
  images?: File[] | string[];
}

export interface ChatCompletionChunk {
  id: string;
  model: string;
  delta: {
    content?: string;
    role?: ChatRole;
    toolCalls?: unknown[];
    reasoningContent?: string;
  };
  finishReason?: string | null;
  done?: boolean;
}
