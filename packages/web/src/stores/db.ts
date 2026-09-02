import Dexie, { type Table } from "dexie";

export interface DexieThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: string; // JSON stringified ChatMessage[]
  providerId?: string;
  model?: string;
  pinned?: number;
  archived?: number;
}

export class GreeneekDB extends Dexie {
  threads!: Table<DexieThread, string>;
  constructor() {
    super("greeneek");
    this.version(1).stores({
      threads: "id, updatedAt, pinned, archived",
    });
  }
}

export const db = new GreeneekDB();
