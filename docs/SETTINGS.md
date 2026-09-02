# Settings — Single source of truth, versioned

`packages/base/src/settings.ts:16` `Settings` `schemaVersion:2`, `validateSettings:202` strict defaults, unknown keys warn-drop `settings.ts:270`, `loadVersioned` `storage.ts:24` `schemaVersion` + `migrate` `SETTINGS_MIGRATIONS:85` v1→v2 theme removal + key trim `storage.ts:85`.

```ts
interface Settings {
  schemaVersion: 2;
  providers: {
    openai: { apiKey: string; baseUrl?: string; enabled: boolean };
    anthropic: { apiKey: string; baseUrl?: string; enabled: boolean };
    ollama: { baseUrl: string; enabled: boolean };
    openrouter?: { apiKey: string; baseUrl?: string; enabled: boolean };
  };
  defaults: { provider: string; modelId?: string; mode: string; temperature: number; maxTokens?: number; systemPrompt: string };
  plugins: Record<string, { enabled: boolean; config?: Record<string, unknown> }>;
  tracing: { enabled: boolean; storePrompts: boolean; redactPatterns: string[]; retentionDays: number; maxSizeMB: number; otlpEndpoint?: string; exportPath?: string };
  advanced: { requestTimeoutMs: number; streamIdleTimeoutMs: number; logLevel: "debug"|"info"|"warn"|"error" };
  data: { storageLocation?: string };
  billing: { plan: string };
  search: { provider: string };
  server: { port: number };
}
```

- Env seeds defaults **only** via `settingsFromEnv:108` (single `process.env` reader); `secretsFromSettings:180` bridges to `bundle.secrets`.
- `loadSettings:290` `loadVersioned` + `validate` + `settingsFromEnv` merge (env wins at runtime, not persisted).
- `saveSettings:312` + `updateSettings:320` field-level `deepMerge` `settings.ts:335` atomic, never stale whole object, versioned `saveVersioned` `storage.ts:24`.
- `isSettingsHydrated:352` for UI loading state.

## UI — Phase 3

`packages/web/src/App.tsx:132` `settings/settingsLoading/fieldSaving/fieldStatus/testResult/reveal`, `loadSettings:156` hydrates before render (loading), `patchSettings:162` `PATCH /api/settings` `server/src/app.ts:96` `updateSettings` + `bundle.settings/secrets` sync, `testProvider:185` `POST /api/settings/test` `server/src/app.ts:111` per `ProviderError.kind` distinct.

Secret inputs: masked `****`, reveal, **Clear**, trimmed `Bearer` strip `settings.ts:169`, `redactSettings` `server/src/app.ts:374` `hasKey`.

Sections: **Providers & Keys** `App.tsx:815` enabled/apiKey/baseUrl + **Test connection**, **Defaults** `App.tsx:904` `mode/temperature/maxTokens/systemPrompt` + `modelId` read-only chip `App.tsx:908`, **Tracing** `App.tsx:658`, **Advanced** `App.tsx:695`, **Data & Storage** `App.tsx:722`, **Diagnostics** `App.tsx:740` + `GET /api/diagnostics` `server/src/app.ts:181`, **Reset/Export/Import** `App.tsx:880`. No model dropdown in Settings. Keyboard: `htmlFor` `App.tsx:565`, `role=dialog` `App.tsx:839`, `Escape` `App.tsx:504`.

## Tests

`packages/base/tests/settings.test.ts:1` round-trip every field `settings.test.ts:10`, partial no-clobber `settings.test.ts:25`, migration `theme`+`Bearer` `settings.test.ts:33`, invalid drop `settings.test.ts:45`, hydrate `isSettingsHydrated` `settings.test.ts:52`.
