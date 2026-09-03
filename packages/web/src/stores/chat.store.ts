import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type { ChatMessage } from "@greeneek/adapters";

export interface Thread {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  archived: boolean;
  modelId?: string;
  providerId?: string;
}

interface ChatState {
  threads: Record<string, Thread>;
  activeThreadId: string | null;
  isGenerating: boolean;
  isStreaming: boolean;
  abortController: AbortController | null;
  error: string | null;

  // Thread CRUD
  createThread: (initialMessage?: ChatMessage) => string;
  deleteThread: (id: string) => void;
  renameThread: (id: string, title: string) => void;
  pinThread: (id: string, pinned: boolean) => void;
  archiveThread: (id: string, archived: boolean) => void;
  setActiveThread: (id: string | null) => void;
  getActiveThread: () => Thread | null;
  getThread: (id: string) => Thread | undefined;
  listThreads: (includeArchived?: boolean) => Thread[];

  // Message actions
  addMessage: (threadId: string, message: ChatMessage) => void;
  updateMessage: (threadId: string, messageId: string, patch: Partial<ChatMessage>) => void;
  appendToMessage: (threadId: string, messageId: string, delta: string) => void;
  removeMessage: (threadId: string, messageId: string) => void;
  setMessages: (threadId: string, messages: ChatMessage[]) => void;
  clearActiveThread: () => void;

  // Generation control
  setGenerating: (generating: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  setAbortController: (controller: AbortController | null) => void;
  abortGeneration: () => void;
  setError: (error: string | null) => void;

  // Auto-title from first user message
  maybeAutoTitle: (threadId: string) => void;
}

const generateId = () => uuidv4();

const initialState: Pick<ChatState, "threads" | "activeThreadId" | "isGenerating" | "isStreaming" | "abortController" | "error"> = {
  threads: {},
  activeThreadId: null,
  isGenerating: false,
  isStreaming: false,
  abortController: null,
  error: null,
};

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      ...initialState,

      createThread: (initialMessage) => {
        const id = generateId();
        const now = Date.now();
        const messages = initialMessage ? [initialMessage] : [];
        const title = initialMessage?.role === "user" ? initialMessage.content.slice(0, 50) : "New Chat";
        const thread: Thread = {
          id,
          title,
          messages,
          createdAt: now,
          updatedAt: now,
          pinned: false,
          archived: false,
        };
        set((state) => ({
          threads: { ...state.threads, [id]: thread },
          activeThreadId: id,
        }));
        return id;
      },

      deleteThread: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.threads;
          const newActive = state.activeThreadId === id ? Object.keys(rest)[0] ?? null : state.activeThreadId;
          return { threads: rest, activeThreadId: newActive };
        }),

      renameThread: (id, title) =>
        set((state) => ({
          threads: {
            ...state.threads,
            [id]: state.threads[id] ? { ...state.threads[id], title, updatedAt: Date.now() } : state.threads[id],
          },
        })),

      pinThread: (id, pinned) =>
        set((state) => ({
          threads: {
            ...state.threads,
            [id]: state.threads[id] ? { ...state.threads[id], pinned, updatedAt: Date.now() } : state.threads[id],
          },
        })),

      archiveThread: (id, archived) =>
        set((state) => ({
          threads: {
            ...state.threads,
            [id]: state.threads[id] ? { ...state.threads[id], archived, updatedAt: Date.now() } : state.threads[id],
          },
        })),

      setActiveThread: (id) => set({ activeThreadId: id }),

      getActiveThread: () => {
        const { activeThreadId, threads } = get();
        return activeThreadId ? threads[activeThreadId] ?? null : null;
      },

      getThread: (id) => get().threads[id],

      listThreads: (includeArchived = false) => {
        const { threads } = get();
        return Object.values(threads)
          .filter((t) => includeArchived || !t.archived)
          .sort((a, b) => (b.pinned === a.pinned ? b.updatedAt - a.updatedAt : Number(b.pinned) - Number(a.pinned)));
      },

      addMessage: (threadId, message) =>
        set((state) => {
          const thread = state.threads[threadId];
          if (!thread) return state;
          const now = Date.now();
          return {
            threads: {
              ...state.threads,
              [threadId]: { ...thread, messages: [...thread.messages, message], updatedAt: now },
            },
          };
        }),

      updateMessage: (threadId, messageId, patch) =>
        set((state) => {
          const thread = state.threads[threadId];
          if (!thread) return state;
          return {
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                messages: thread.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
                updatedAt: Date.now(),
              },
            },
          };
        }),

      appendToMessage: (threadId, messageId, delta) =>
        set((state) => {
          const thread = state.threads[threadId];
          if (!thread) return state;
          return {
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                messages: thread.messages.map((m) =>
                  m.id === messageId ? { ...m, content: m.content + delta } : m
                ),
                updatedAt: Date.now(),
              },
            },
          };
        }),

      removeMessage: (threadId, messageId) =>
        set((state) => {
          const thread = state.threads[threadId];
          if (!thread) return state;
          return {
            threads: {
              ...state.threads,
              [threadId]: {
                ...thread,
                messages: thread.messages.filter((m) => m.id !== messageId),
                updatedAt: Date.now(),
              },
            },
          };
        }),

      setMessages: (threadId, messages) =>
        set((state) => {
          const thread = state.threads[threadId];
          if (!thread) return state;
          return {
            threads: {
              ...state.threads,
              [threadId]: { ...thread, messages, updatedAt: Date.now() },
            },
          };
        }),

      clearActiveThread: () => set({ activeThreadId: null }),

      setGenerating: (generating) => set({ isGenerating: generating }),
      setStreaming: (streaming) => set({ isStreaming: streaming }),
      setAbortController: (controller) => set({ abortController: controller }),

      abortGeneration: () => {
        const { abortController } = get();
        if (abortController) abortController.abort();
        set({ abortController: null, isGenerating: false, isStreaming: false });
      },

      setError: (error) => set({ error }),

      maybeAutoTitle: (threadId) => {
        const thread = get().threads[threadId];
        if (!thread || thread.title !== "New Chat" || thread.messages.length === 0) return;
        const firstUser = thread.messages.find((m) => m.role === "user");
        if (firstUser) {
          const title = firstUser.content.slice(0, 50);
          get().renameThread(threadId, title);
        }
      },
    }),
    {
      name: "greeneek.chat.v3",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        threads: state.threads,
        activeThreadId: state.activeThreadId,
      }),
      version: 3,
      migrate: (persisted: unknown, version: number) => {
        const data = persisted as { threads?: Record<string, Thread>; activeThreadId?: string | null };
        if (version < 2) {
          // v1 -> v2: add pinned/archived fields
          if (data.threads) {
            for (const thread of Object.values(data.threads)) {
              thread.pinned = thread.pinned ?? false;
              thread.archived = thread.archived ?? false;
            }
          }
        }
        if (version < 3) {
          // v2 -> v3: ensure activeThreadId exists
          data.activeThreadId = data.activeThreadId ?? null;
        }
        return data;
      },
    }
  )
);

// Selectors for common derived state
export const useThreads = () => useChatStore((s) => s.listThreads());
export const useActiveThread = () => useChatStore((s) => s.getActiveThread());
export const useIsGenerating = () => useChatStore((s) => s.isGenerating);
export const useIsStreaming = () => useChatStore((s) => s.isStreaming);
export const useChatError = () => useChatStore((s) => s.error);