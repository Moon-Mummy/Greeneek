// Dexie-based persistence layer for large chat data (IndexedDB)
// Falls back to localStorage for small data / unsupported environments

import Dexie, { Table } from "dexie";
import type { Thread } from "./chat.store";
import type { ChatMessage } from "@greeneek/adapters";
import type { SettingsState } from "./settings.store";
import type { ProviderState } from "./provider.store";

// Database version - increment when schema changes
const DB_VERSION = 3;

interface StoredThread {
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

interface StoredSettings {
  key: "settings";
  value: SettingsState;
}

interface StoredProvider {
  key: "provider";
  value: ProviderState;
}

export class GreeneekDB extends Dexie {
  threads!: Table<StoredThread, string>;
  settings!: Table<StoredSettings, string>;
  provider!: Table<StoredProvider, string>;

  constructor() {
    super("greeneek-db");
    this.version(DB_VERSION).stores({
      threads: "id, updatedAt, pinned, archived, providerId",
      settings: "key",
      provider: "key",
    });

    // Migration from v1 (localStorage only) to v2 (IndexedDB)
    this.version(2).stores({
      threads: "id, updatedAt, pinned, archived, providerId",
      settings: "key",
      provider: "key",
    }).upgrade((tx) => {
      // Migrate from localStorage if exists
      const localThreads = localStorage.getItem("greeneek.chat.v3");
      const localSettings = localStorage.getItem("greeneek.settings.v3");
      const localProvider = localStorage.getItem("greeneek.provider.v1");

      if (localThreads) {
        try {
          const parsed = JSON.parse(localThreads);
          if (parsed.threads) {
            for (const [id, thread] of Object.entries(parsed.threads)) {
              tx.table("threads").put({ id, ...(thread as Omit<StoredThread, "id">) });
            }
          }
        } catch {
          // Ignore migration errors
        }
      }

      if (localSettings) {
        try {
          tx.table("settings").put({ key: "settings", value: JSON.parse(localSettings) });
        } catch {
          // Ignore
        }
      }

      if (localProvider) {
        try {
          tx.table("provider").put({ key: "provider", value: JSON.parse(localProvider) });
        } catch {
          // Ignore
        }
      }
    });

    // Version 3 - schema cleanup
    this.version(3).stores({
      threads: "id, updatedAt, pinned, archived, providerId",
      settings: "key",
      provider: "key",
    });
  }
}

export const db = new GreeneekDB();

// Check if IndexedDB is available
export function isIndexedDBAvailable(): boolean {
  try {
    return "indexedDB" in window;
  } catch {
    return false;
  }
}

// Persistence layer with fallback
export class PersistenceLayer {
  private useDexie: boolean;

  constructor() {
    this.useDexie = isIndexedDBAvailable();
  }

  // Thread operations
  async getAllThreads(): Promise<Thread[]> {
    if (this.useDexie) {
      try {
        const stored = await db.threads.toArray();
        return stored.map((t) => ({ ...t })) as Thread[];
      } catch {
        this.useDexie = false;
      }
    }
    // Fallback to localStorage
    const data = localStorage.getItem("greeneek.chat.v3");
    if (data) {
      try {
        const parsed = JSON.parse(data);
        return Object.values(parsed.threads ?? {}) as Thread[];
      } catch {
        return [];
      }
    }
    return [];
  }

  async getThread(id: string): Promise<Thread | undefined> {
    if (this.useDexie) {
      try {
        const thread = await db.threads.get(id);
        return thread ? ({ ...thread } as Thread) : undefined;
      } catch {
        this.useDexie = false;
      }
    }
    const data = localStorage.getItem("greeneek.chat.v3");
    if (data) {
      try {
        const parsed = JSON.parse(data);
        return parsed.threads?.[id];
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  async putThread(thread: Thread): Promise<void> {
    if (this.useDexie) {
      try {
        await db.threads.put(thread as StoredThread);
        return;
      } catch {
        this.useDexie = false;
      }
    }
    // Fallback to localStorage
    const data = localStorage.getItem("greeneek.chat.v3");
    let parsed = { threads: {} as Record<string, Thread> };
    if (data) {
      try {
        parsed = JSON.parse(data);
      } catch {
        parsed = { threads: {} };
      }
    }
    parsed.threads[thread.id] = thread;
    localStorage.setItem("greeneek.chat.v3", JSON.stringify(parsed));
  }

  async deleteThread(id: string): Promise<void> {
    if (this.useDexie) {
      try {
        await db.threads.delete(id);
        return;
      } catch {
        this.useDexie = false;
      }
    }
    const data = localStorage.getItem("greeneek.chat.v3");
    if (data) {
      try {
        const parsed = JSON.parse(data);
        delete parsed.threads[id];
        localStorage.setItem("greeneek.chat.v3", JSON.stringify(parsed));
      } catch {
        // Ignore
      }
    }
  }

  async clearAllThreads(): Promise<void> {
    if (this.useDexie) {
      try {
        await db.threads.clear();
        return;
      } catch {
        this.useDexie = false;
      }
    }
    localStorage.removeItem("greeneek.chat.v3");
  }

  // Settings operations
  async getSettings(): Promise<SettingsState | undefined> {
    if (this.useDexie) {
      try {
        const stored = await db.settings.get("settings");
        return stored?.value;
      } catch {
        this.useDexie = false;
      }
    }
    const data = localStorage.getItem("greeneek.settings.v3");
    if (data) {
      try {
        return JSON.parse(data);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  async putSettings(settings: SettingsState): Promise<void> {
    if (this.useDexie) {
      try {
        await db.settings.put({ key: "settings", value: settings });
        return;
      } catch {
        this.useDexie = false;
      }
    }
    localStorage.setItem("greeneek.settings.v3", JSON.stringify(settings));
  }

  // Provider operations
  async getProvider(): Promise<ProviderState | undefined> {
    if (this.useDexie) {
      try {
        const stored = await db.provider.get("provider");
        return stored?.value;
      } catch {
        this.useDexie = false;
      }
    }
    const data = localStorage.getItem("greeneek.provider.v1");
    if (data) {
      try {
        return JSON.parse(data);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  async putProvider(provider: ProviderState): Promise<void> {
    if (this.useDexie) {
      try {
        await db.provider.put({ key: "provider", value: provider });
        return;
      } catch {
        this.useDexie = false;
      }
    }
    localStorage.setItem("greeneek.provider.v1", JSON.stringify(provider));
  }

  // Utility
  async isUsingDexie(): Promise<boolean> {
    return this.useDexie && (await db.isOpen());
  }

  async close(): Promise<void> {
    if (this.useDexie) {
      await db.close();
    }
  }
}

export const persistence = new PersistenceLayer();

// Hook for syncing Zustand stores with persistence
export async function syncStoresToPersistence(
  chatState: { threads: Record<string, Thread> },
  settingsState: SettingsState,
  providerState: ProviderState
): Promise<void> {
  // Sync threads
  for (const thread of Object.values(chatState.threads)) {
    await persistence.putThread(thread);
  }

  // Sync settings & provider
  await persistence.putSettings(settingsState);
  await persistence.putProvider(providerState);
}

export async function loadStoresFromPersistence(): Promise<{
  threads: Record<string, Thread>;
  settings: SettingsState | undefined;
  provider: ProviderState | undefined;
}> {
  const [threads, settings, provider] = await Promise.all([
    persistence.getAllThreads(),
    persistence.getSettings(),
    persistence.getProvider(),
  ]);

  const threadsRecord: Record<string, Thread> = {};
  for (const thread of threads) {
    threadsRecord[thread.id] = thread;
  }

  return { threads: threadsRecord, settings, provider };
}