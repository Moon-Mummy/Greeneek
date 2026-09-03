import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ProviderConfig, PALModel } from "@greeneek/adapters";
import { DEFAULT_REGISTRY, mergeRegistry, registryGrouped } from "../lib/registry";

export interface ProviderState {
  // Registry state
  registry: Record<string, ProviderConfig>;
  userOverrides: Record<string, Partial<ProviderConfig>>;

  // Selection state
  selectedProviderId: string;
  selectedModelId: string | null;

  // Derived
  availableModels: PALModel[];
  groupedProviders: { local: ProviderConfig[]; cloud: ProviderConfig[] };

  // Actions
  setUserOverride: (providerId: string, patch: Partial<ProviderConfig>) => void;
  removeUserOverride: (providerId: string) => void;
  setSelectedProvider: (providerId: string) => void;
  setSelectedModel: (modelId: string) => void;
  refreshModels: (providerId: string, models: PALModel[]) => void;
  toggleProviderEnabled: (providerId: string, enabled: boolean) => void;
  addCustomProvider: (provider: ProviderConfig) => void;
  reset: () => void;
}

const initialState = {
  registry: DEFAULT_REGISTRY,
  userOverrides: {},
  selectedProviderId: "ollama",
  selectedModelId: null,
  availableModels: [],
  groupedProviders: registryGrouped(DEFAULT_REGISTRY),
};

export const useProviderStore = create<ProviderState>()(
  persist(
    (set, _get) => ({
      ...initialState,

      setUserOverride: (providerId, patch) =>
        set((state) => {
          const newOverrides = { ...state.userOverrides, [providerId]: { ...state.userOverrides[providerId], ...patch } };
          const newRegistry = mergeRegistry(DEFAULT_REGISTRY, newOverrides);
          return {
            userOverrides: newOverrides,
            registry: newRegistry,
            groupedProviders: registryGrouped(newRegistry),
          };
        }),

      removeUserOverride: (providerId) =>
        set((state) => {
          const { [providerId]: _, ...newOverrides } = state.userOverrides;
          const newRegistry = mergeRegistry(DEFAULT_REGISTRY, newOverrides);
          return {
            userOverrides: newOverrides,
            registry: newRegistry,
            groupedProviders: registryGrouped(newRegistry),
          };
        }),

      setSelectedProvider: (providerId) =>
        set((state) => {
          const provider = state.registry[providerId];
          const models = provider?.models === "auto" ? [] : (provider?.models ?? []);
          return {
            selectedProviderId: providerId,
            selectedModelId: models[0]?.id ?? null,
            availableModels: models,
          };
        }),

      setSelectedModel: (modelId) => set({ selectedModelId: modelId }),

      refreshModels: (providerId, models) =>
        set((state) => {
          const newRegistry = { ...state.registry };
          if (newRegistry[providerId]) {
            newRegistry[providerId] = { ...newRegistry[providerId], models };
          }
          return {
            registry: newRegistry,
            availableModels: state.selectedProviderId === providerId ? models : state.availableModels,
            groupedProviders: registryGrouped(newRegistry),
          };
        }),

      toggleProviderEnabled: (providerId, enabled) =>
        set((state) => {
          const newRegistry = { ...state.registry };
          if (newRegistry[providerId]) {
            newRegistry[providerId] = { ...newRegistry[providerId], enabled };
          }
          return {
            registry: newRegistry,
            groupedProviders: registryGrouped(newRegistry),
          };
        }),

      addCustomProvider: (provider) =>
        set((state) => {
          const newRegistry = { ...state.registry, [provider.id]: provider };
          return {
            registry: newRegistry,
            groupedProviders: registryGrouped(newRegistry),
          };
        }),

      reset: () => set(initialState),
    }),
    {
      name: "greeneek.provider.v1",
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({
        userOverrides: state.userOverrides,
        selectedProviderId: state.selectedProviderId,
        selectedModelId: state.selectedModelId,
      }),
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Partial<ProviderState>;
        if (!state || version === 0) return initialState;
        const mergedRegistry = mergeRegistry(DEFAULT_REGISTRY, state.userOverrides ?? {});
        return {
          ...initialState,
          registry: mergedRegistry,
          userOverrides: state.userOverrides ?? {},
          selectedProviderId: state.selectedProviderId ?? "ollama",
          selectedModelId: state.selectedModelId ?? null,
          groupedProviders: registryGrouped(mergedRegistry),
        };
      },
    }
  )
);

// Selectors
export const useRegistry = () => useProviderStore((s) => s.registry);
export const useSelectedProvider = () => useProviderStore((s) => s.registry[s.selectedProviderId]);
export const useSelectedProviderId = () => useProviderStore((s) => s.selectedProviderId);
export const useSelectedModel = () => useProviderStore((s) => {
  const { selectedProviderId, selectedModelId, registry } = s;
  const provider = registry[selectedProviderId];
  if (!provider || !selectedModelId) return undefined;
  const models = provider.models === "auto" ? [] : provider.models;
  return models.find((m) => m.id === selectedModelId);
});
export const useAvailableModels = () => useProviderStore((s) => s.availableModels);
export const useGroupedProviders = () => useProviderStore((s) => s.groupedProviders);
export const useLocalProviders = () => useProviderStore((s) => s.groupedProviders.local);
export const useCloudProviders = () => useProviderStore((s) => s.groupedProviders.cloud);
export const useProviderEnabled = (providerId: string) => useProviderStore((s) => s.registry[providerId]?.enabled ?? false);