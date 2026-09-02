import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface AppSettings {
  activeProviderId: string;
  activeModelId: string;
  defaultSystemPrompt: string;
  temperature: number;
  topP: number;
  maxTokens?: number;
  reasoningEnabled: boolean;
  streamResponse: boolean;
  theme: "light" | "dark" | "system";
  accentColor?: string;
  radius?: number;
  sidebarWidth?: number;
  sidebarOpen: boolean;
  autoTitle: boolean;
  sendOnEnter: boolean;
  autoScroll: boolean;
  showReasoning: boolean;
  autoDetectLocalModels: boolean;
  ollamaBaseURL: string;
  lmStudioBaseURL: string;
  vllmBaseURL: string;
  keysEncrypted: boolean;
  hasEncryptionPassphrase: boolean;
  enableWebSearch: boolean;
  enableTools: boolean;
  maxContextMessages?: number;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  activeProviderId: "ollama",
  activeModelId: "",
  defaultSystemPrompt: "You are a helpful, accurate, and concise AI assistant.",
  temperature: 0.7,
  topP: 1,
  maxTokens: undefined,
  reasoningEnabled: false,
  streamResponse: true,
  theme: "system",
  sidebarOpen: true,
  autoTitle: true,
  sendOnEnter: true,
  autoScroll: true,
  showReasoning: true,
  autoDetectLocalModels: true,
  ollamaBaseURL: "http://localhost:11434",
  lmStudioBaseURL: "http://localhost:1234/v1",
  vllmBaseURL: "http://localhost:8000/v1",
  keysEncrypted: false,
  hasEncryptionPassphrase: false,
  enableWebSearch: false,
  enableTools: false,
};

interface SettingsState extends AppSettings {
  hydrated: boolean;
  set: (patch: Partial<AppSettings>) => void;
  setHydrated: (v: boolean) => void;
  reset: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_APP_SETTINGS,
      hydrated: false,
      set: (patch) => set((s) => ({ ...s, ...patch })),
      setHydrated: (v) => set({ hydrated: v }),
      reset: () => set({ ...DEFAULT_APP_SETTINGS, hydrated: true }),
    }),
    {
      name: "greeneek.settings.v1",
      partialize: (s) => {
        const { hydrated: _h, ...rest } = s;
        void _h;
        return rest as unknown as AppSettings;
      },
      version: 1,
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
        // Apply theme to document
        const theme = state?.theme ?? "system";
        const effective = theme === "system" ? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
        document.documentElement.setAttribute("data-theme", effective);
      },
    },
  ),
);
