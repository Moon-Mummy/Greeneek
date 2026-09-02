import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ChatRole = "user" | "assistant" | "system" | "tool";
export interface ToolCall { id: string; name: string; arguments: Record<string, unknown> }
export interface MessageImage { id: string; name: string; mimeType: string; dataUrl: string; size: number }
export interface MessageFile { id: string; name: string; mimeType: string; size: number; content?: string; url?: string }
export interface TokenUsage { promptTokens?: number; completionTokens?: number; totalTokens?: number }

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

export interface ChatThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  model?: string;
  providerId?: string;
  systemPrompt?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  reasoning?: boolean;
  pinned?: boolean;
  archived?: boolean;
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
function titleFrom(text: string): string {
  const t = text.trim().slice(0, 42).replace(/\s+/g, " ");
  return t || "New chat";
}

interface ChatState {
  threads: ChatThread[];
  activeThreadId: string | null;
  isGenerating: boolean;
  isStreaming: boolean;
  error: string | null;
  // actions
  createThread: (title?: string, opts?: Partial<ChatThread>) => string;
  setActiveThread: (id: string) => void;
  deleteThread: (id: string) => void;
  renameThread: (id: string, title: string) => void;
  pinThread: (id: string, pinned: boolean) => void;
  archiveThread: (id: string, archived: boolean) => void;
  addMessage: (threadId: string, msg: ChatMessage) => void;
  updateMessage: (threadId: string, msgId: string, partial: Partial<ChatMessage>) => void;
  appendToMessage: (threadId: string, msgId: string, delta: { content?: string; reasoningContent?: string }) => void;
  removeMessage: (threadId: string, msgId: string) => void;
  setMessages: (threadId: string, messages: ChatMessage[]) => void;
  clearActiveThread: () => void;
  setGenerating: (v: boolean) => void;
  setStreaming: (v: boolean) => void;
  setError: (e: string | null) => void;
}

// Keep large threads out of localStorage if too big — truncate handled by UI; full Dexie migration is next step.
export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      threads: [],
      activeThreadId: null,
      isGenerating: false,
      isStreaming: false,
      error: null,

      createThread: (title, opts) => {
        const id = `th_${uid()}`;
        const now = Date.now();
        const th: ChatThread = {
          id,
          title: title ?? "New chat",
          messages: [],
          createdAt: now,
          updatedAt: now,
          ...opts,
        };
        set((s) => ({ threads: [th, ...s.threads], activeThreadId: id }));
        return id;
      },
      setActiveThread: (id) => set({ activeThreadId: id }),
      deleteThread: (id) =>
        set((s) => {
          const threads = s.threads.filter((t) => t.id !== id);
          const activeThreadId = s.activeThreadId === id ? (threads[0]?.id ?? null) : s.activeThreadId;
          return { threads, activeThreadId };
        }),
      renameThread: (id, title) =>
        set((s) => ({ threads: s.threads.map((t) => (t.id === id ? { ...t, title, updatedAt: Date.now() } : t)) })),
      pinThread: (id, pinned) =>
        set((s) => ({ threads: s.threads.map((t) => (t.id === id ? { ...t, pinned } : t)) })),
      archiveThread: (id, archived) =>
        set((s) => ({ threads: s.threads.map((t) => (t.id === id ? { ...t, archived } : t)) })),

      addMessage: (threadId, msg) =>
        set((s) => ({
          threads: s.threads.map((t) => {
            if (t.id !== threadId) return t;
            const autoTitle = t.messages.length === 0 && msg.role === "user";
            return {
              ...t,
              messages: [...t.messages, msg],
              title: autoTitle ? titleFrom(msg.content) : t.title,
              updatedAt: Date.now(),
            };
          }),
        })),

      updateMessage: (threadId, msgId, partial) =>
        set((s) => ({
          threads: s.threads.map((t) =>
            t.id !== threadId
              ? t
              : { ...t, messages: t.messages.map((m) => (m.id === msgId ? { ...m, ...partial } : m)), updatedAt: Date.now() },
          ),
        })),

      appendToMessage: (threadId, msgId, delta) =>
        set((s) => ({
          threads: s.threads.map((t) =>
            t.id !== threadId
              ? t
              : {
                  ...t,
                  messages: t.messages.map((m) =>
                    m.id !== msgId ? m : { ...m, content: (m.content ?? "") + (delta.content ?? ""), reasoningContent: (m.reasoningContent ?? "") + (delta.reasoningContent ?? "") },
                  ),
                  updatedAt: Date.now(),
                },
          ),
        })),

      removeMessage: (threadId, msgId) =>
        set((s) => ({
          threads: s.threads.map((t) => (t.id !== threadId ? t : { ...t, messages: t.messages.filter((m) => m.id !== msgId), updatedAt: Date.now() })),
        })),

      setMessages: (threadId, messages) =>
        set((s) => ({
          threads: s.threads.map((t) => (t.id !== threadId ? t : { ...t, messages, updatedAt: Date.now() })),
        })),

      clearActiveThread: () => {
        const { activeThreadId } = get();
        if (!activeThreadId) return;
        set((s) => ({
          threads: s.threads.map((t) => (t.id === activeThreadId ? { ...t, messages: [], title: "New chat", updatedAt: Date.now() } : t)),
        }));
      },

      setGenerating: (v) => set({ isGenerating: v }),
      setStreaming: (v) => set({ isStreaming: v }),
      setError: (e) => set({ error: e }),
    }),
    {
      name: "greeneek.chat.v1",
      partialize: (s) => ({ threads: s.threads, activeThreadId: s.activeThreadId }),
      version: 1,
    },
  ),
);

// Selectors
export const selectActiveThread = (s: ChatState) => s.threads.find((t) => t.id === s.activeThreadId) ?? null;
