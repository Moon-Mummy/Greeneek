import { create } from "zustand";
import type { ProviderConfig, PALModel } from "@greeneek/adapters";
import { DEFAULT_REGISTRY, mergeRegistry } from "@greeneek/adapters";

interface ProviderState {
  registry: Record<string, ProviderConfig>;
  activeProviderId: string;
  availableModels: PALModel[];
  isDiscovering: boolean;
  lastDiscoveryAt?: number;
  error?: string | null;
  // actions
  initRegistry: (overrides?: Record<string, Partial<ProviderConfig>>) => void;
  setActiveProvider: (id: string) => void;
  updateProvider: (id: string, patch: Partial<ProviderConfig>) => void;
  setAvailableModels: (models: PALModel[]) => void;
  setDiscovering: (v: boolean) => void;
  setError: (e: string | null) => void;
  refreshModels: (providerId?: string) => Promise<void>;
}

export const useProviderStore = create<ProviderState>()((set, get) => ({
  registry: { ...DEFAULT_REGISTRY },
  activeProviderId: "ollama",
  availableModels: [],
  isDiscovering: false,
  lastDiscoveryAt: undefined,
  error: null,

  initRegistry: (overrides) => {
    const registry = mergeRegistry(DEFAULT_REGISTRY, overrides);
    set({ registry });
  },
  setActiveProvider: (id) => set({ activeProviderId: id }),
  updateProvider: (id, patch) =>
    set((s) => ({ registry: { ...s.registry, [id]: { ...s.registry[id]!, ...patch } as ProviderConfig } })),
  setAvailableModels: (models) => set({ availableModels: models, lastDiscoveryAt: Date.now() }),
  setDiscovering: (v) => set({ isDiscovering: v }),
  setError: (e) => set({ error: e }),

  refreshModels: async (providerId) => {
    const { registry, activeProviderId } = get();
    const target = providerId ?? activeProviderId;
    const cfg = registry[target];
    if (!cfg) return;
    set({ isDiscovering: true, error: null });
    try {
      const res = await fetch(`/api/models${target ? `?provider=${encodeURIComponent(target)}` : ""}`);
      if (!res.ok) throw new Error(`models ${res.status}`);
      const body = (await res.json()) as { models?: PALModel[] };
      const models = body.models ?? [];
      // Filter to target provider if registry returned mixed
      const filtered = target ? models.filter((m) => (m as PALModel).providerId === target || (m as { provider?: string }).provider === target) : models;
      set({ availableModels: filtered.length ? filtered : models, lastDiscoveryAt: Date.now() });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ isDiscovering: false });
    }
  },
}));
