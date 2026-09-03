import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ProviderConfig, PALModel } from "@greeneek/adapters";
import { DEFAULT_REGISTRY } from "../lib/registry";

export interface ProviderSettings {
  baseUrl: string;
  apiKey: string;
  apiKeyEncrypted: boolean;
  selectedModel: string;
  customHeaders?: Record<string, string>;
}

export interface SettingsState {
  version: number;
  theme: "dark" | "light" | "system";
  autoTitle: boolean;
  sendOnEnter: boolean;
  autoScroll: boolean;
  showReasoning: boolean;
  renderMath: boolean;
  sidebarWidth: number;
  keysEncrypted: boolean;
  encryptionPassphrase: string | null;

  // Provider settings per providerId
  providerSettings: Record<string, ProviderSettings>;
  activeProviderId: string;

  // Local provider configs
  ollamaBaseUrl: string;
  lmstudioBaseUrl: string;
  vllmBaseUrl: string;

  // Actions
  setTheme: (theme: "dark" | "light" | "system") => void;
  setAutoTitle: (v: boolean) => void;
  setSendOnEnter: (v: boolean) => void;
  setAutoScroll: (v: boolean) => void;
  setShowReasoning: (v: boolean) => void;
  setRenderMath: (v: boolean) => void;
  setSidebarWidth: (v: number) => void;
  setKeysEncrypted: (v: boolean) => void;
  setEncryptionPassphrase: (passphrase: string | null) => void;

  setProviderSetting: (providerId: string, key: keyof ProviderSettings, value: unknown) => void;
  getProviderSetting: (providerId: string, key: keyof ProviderSettings) => unknown;
  setActiveProvider: (providerId: string) => void;
  getActiveProvider: () => ProviderConfig | undefined;
  getActiveModel: () => PALModel | undefined;

  setOllamaBaseUrl: (url: string) => void;
  setLmstudioBaseUrl: (url: string) => void;
  setVllmBaseUrl: (url: string) => void;

  migrate: (oldState: unknown) => SettingsState;
  reset: () => void;
}

const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  baseUrl: "",
  apiKey: "",
  apiKeyEncrypted: false,
  selectedModel: "",
};

const DEFAULT_SETTINGS: SettingsState = {
  version: 4,
  theme: "system",
  autoTitle: true,
  sendOnEnter: true,
  autoScroll: true,
  showReasoning: true,
  renderMath: true,
  sidebarWidth: 280,
  keysEncrypted: false,
  encryptionPassphrase: null,
  providerSettings: {
    ollama: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: "http://localhost:11434" },
    lmstudio: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: "http://localhost:1234/v1" },
    vllm: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: "http://localhost:8000/v1" },
    openai: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: "https://api.openai.com/v1" },
    anthropic: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: "https://api.anthropic.com/v1" },
    openrouter: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: "https://openrouter.ai/api/v1" },
    deepseek: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: "https://api.deepseek.com/v1" },
    groq: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: "https://api.groq.com/openai/v1" },
    together: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: "https://api.together.xyz/v1" },
    echo: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: "" },
  },
  activeProviderId: "ollama",
  ollamaBaseUrl: "http://localhost:11434",
  lmstudioBaseUrl: "http://localhost:1234",
  vllmBaseUrl: "http://localhost:8000",

  setTheme: () => {},
  setAutoTitle: () => {},
  setSendOnEnter: () => {},
  setAutoScroll: () => {},
  setShowReasoning: () => {},
  setRenderMath: () => {},
  setSidebarWidth: () => {},
  setKeysEncrypted: () => {},
  setEncryptionPassphrase: () => {},
  setProviderSetting: () => {},
  getProviderSetting: () => {},
  setActiveProvider: () => {},
  getActiveProvider: () => undefined,
  getActiveModel: () => undefined,
  setOllamaBaseUrl: () => {},
  setLmstudioBaseUrl: () => {},
  setVllmBaseUrl: () => {},
  migrate: () => DEFAULT_SETTINGS,
  reset: () => {},
};

const migrateState = (persisted: unknown, _version: number): SettingsState => {
  const state = persisted as Partial<SettingsState>;
  let migrated = { ...DEFAULT_SETTINGS, ...state } as SettingsState;

  if (!state.version || state.version < 2) {
    migrated.providerSettings = {
      ollama: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: state.ollamaBaseUrl ?? "http://localhost:11434" },
      lmstudio: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: state.lmstudioBaseUrl ?? "http://localhost:1234/v1" },
      vllm: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: state.vllmBaseUrl ?? "http://localhost:8000/v1" },
      openai: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: "https://api.openai.com/v1" },
      anthropic: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: "https://api.anthropic.com/v1" },
      openrouter: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: "https://openrouter.ai/api/v1" },
      deepseek: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: "https://api.deepseek.com/v1" },
      groq: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: "https://api.groq.com/openai/v1" },
      together: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: "https://api.together.xyz/v1" },
      echo: { ...DEFAULT_PROVIDER_SETTINGS, baseUrl: "" },
    };
  }

  if (!state.version || state.version < 3) {
    migrated.keysEncrypted = state.keysEncrypted ?? false;
    migrated.encryptionPassphrase = state.encryptionPassphrase ?? null;
    for (const key of Object.keys(migrated.providerSettings)) {
      migrated.providerSettings[key].apiKeyEncrypted = migrated.providerSettings[key].apiKeyEncrypted ?? false;
    }
  }

  if (!state.version || state.version < 4) {
    migrated.renderMath = state.renderMath ?? true;
    migrated.sidebarWidth = typeof state.sidebarWidth === "number" ? Math.min(360, Math.max(240, state.sidebarWidth)) : 280;
    if (!state.theme) migrated.theme = "system";
  }

  migrated.version = 4;
  return migrated;
};

type SetState = (fn: (state: SettingsState) => Partial<SettingsState>) => void;
type GetState = () => SettingsState;

const createState = (set: SetState, get: GetState): SettingsState => ({
  ...DEFAULT_SETTINGS,

  setTheme: (theme) => set((state) => ({ ...state, theme })),
  setAutoTitle: (autoTitle) => set((state) => ({ ...state, autoTitle })),
  setSendOnEnter: (sendOnEnter) => set((state) => ({ ...state, sendOnEnter })),
  setAutoScroll: (autoScroll) => set((state) => ({ ...state, autoScroll })),
  setShowReasoning: (showReasoning) => set((state) => ({ ...state, showReasoning })),
  setRenderMath: (renderMath) => set((state) => ({ ...state, renderMath })),
  setSidebarWidth: (sidebarWidth) => set((state) => ({ ...state, sidebarWidth: Math.min(360, Math.max(240, sidebarWidth)) })),
  setKeysEncrypted: (keysEncrypted) => set((state) => ({ ...state, keysEncrypted })),
  setEncryptionPassphrase: (encryptionPassphrase) => set((state) => ({ ...state, encryptionPassphrase })),

  setProviderSetting: (providerId, key, value) =>
    set((state) => ({
      providerSettings: {
        ...state.providerSettings,
        [providerId]: {
          ...state.providerSettings[providerId],
          [key]: value,
        },
      },
    })),

  getProviderSetting: (providerId, key) => {
    return get().providerSettings[providerId]?.[key];
  },

  setActiveProvider: (activeProviderId) => set((state) => ({ ...state, activeProviderId })),

  getActiveProvider: () => {
    const { activeProviderId } = get();
    return DEFAULT_REGISTRY[activeProviderId];
  },

  getActiveModel: () => {
    const { activeProviderId, providerSettings } = get();
    const provider = DEFAULT_REGISTRY[activeProviderId];
    if (!provider) return undefined;
    const selectedModel = providerSettings[activeProviderId]?.selectedModel;
    const models = provider.models === "auto" ? [] : provider.models;
    if (!selectedModel) return models[0];
    return models.find((m) => m.id === selectedModel) ?? models[0];
  },

  setOllamaBaseUrl: (ollamaBaseUrl) => set((state) => ({ ...state, ollamaBaseUrl })),
  setLmstudioBaseUrl: (lmstudioBaseUrl) => set((state) => ({ ...state, lmstudioBaseUrl })),
  setVllmBaseUrl: (vllmBaseUrl) => set((state) => ({ ...state, vllmBaseUrl })),

  migrate: (oldState: unknown) => migrateState(oldState, 3),

  reset: () => set(() => DEFAULT_SETTINGS),
});

export const useSettingsStore = create<SettingsState>()(
  persist(
    createState,
    {
      name: "greeneek.settings.v4",
      storage: createJSONStorage(() => localStorage),
      version: 4,
      migrate: migrateState,
    }
  )
);

// Selectors
export const useTheme = () => useSettingsStore((s: SettingsState) => s.theme);
export const useAutoTitle = () => useSettingsStore((s: SettingsState) => s.autoTitle);
export const useSendOnEnter = () => useSettingsStore((s: SettingsState) => s.sendOnEnter);
export const useAutoScroll = () => useSettingsStore((s: SettingsState) => s.autoScroll);
export const useShowReasoning = () => useSettingsStore((s: SettingsState) => s.showReasoning);
export const useRenderMath = () => useSettingsStore((s: SettingsState) => s.renderMath);
export const useSidebarWidth = () => useSettingsStore((s: SettingsState) => s.sidebarWidth);
export const useKeysEncrypted = () => useSettingsStore((s: SettingsState) => s.keysEncrypted);
export const useEncryptionPassphrase = () => useSettingsStore((s: SettingsState) => s.encryptionPassphrase);
export const useActiveProviderId = () => useSettingsStore((s: SettingsState) => s.activeProviderId);
export const useActiveProvider = () => useSettingsStore((s: SettingsState) => s.getActiveProvider());
export const useActiveModel = () => useSettingsStore((s: SettingsState) => s.getActiveModel());
export const useProviderSettings = (providerId: string) => useSettingsStore((s: SettingsState) => s.providerSettings[providerId]);
export const useOllamaBaseUrl = () => useSettingsStore((s: SettingsState) => s.ollamaBaseUrl);
export const useLmstudioBaseUrl = () => useSettingsStore((s: SettingsState) => s.lmstudioBaseUrl);
export const useVllmBaseUrl = () => useSettingsStore((s: SettingsState) => s.vllmBaseUrl);