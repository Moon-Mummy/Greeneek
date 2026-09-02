# Plugins — Everything is a plugin

A thin kernel; every capability — providers, tools, modes, tracers/exporters, storage backends, UI panels — is loaded through one plugin mechanism. Built-ins use the *same* mechanism as third-party ones.

## Contract

```ts
interface PluginManifest {
  id: string;                     // "greeneek.provider.openrouter"
  name: string; version: string; description: string;
  kinds: ("provider"|"tool"|"mode"|"tracer"|"storage"|"ui-panel"|"middleware")[];
  permissions: ("network"|"filesystem"|"secrets"|"shell"|"conversations"|"settings")[];
  configSchema?: JSONSchema;      // rendered automatically in Settings → Plugins
  minAppVersion?: string;
}

interface Plugin {
  manifest: PluginManifest;
  init(ctx: PluginContext): Promise<void>;      // register capabilities
  activate?(): Promise<void>;
  deactivate?(): Promise<void>;
  dispose?(): Promise<void>;
}
```

Context `ctx.registry` exposes `registerProvider`, `registerTool`, `registerMode`, `registerTracerExporter`, `registerPanel`, `registerMiddleware`. Permissions are enforced at the context level (a plugin without `network` gets no HTTP client; without `secrets` cannot read API keys).

## Lifecycle

`register → init → activate` at startup for enabled plugins; `deactivate → dispose` on disable/quit. Dependency order: `storage → tracer → providers → tools → modes → panels`. Every plugin call is wrapped in try/catch + 5s timeout; a failing plugin is marked `errored` with the message visible in **Settings → Plugins**; the core and other plugins keep working. A plugin can never crash the app.

## Discovery

- Built-ins in `plugins/<name>/` (each with its own `manifest.json`), statically listed in `plugins/index.ts` (and mirrored in `packages/base/src/plugins/` for the build).
- Optional user plugin directory scanned at startup (desktop) — each must be enabled explicitly in Settings → Plugins before it runs.
- `Settings → Plugins` page: list (name, version, kinds, status), enable/disable toggle, auto-generated config form from `configSchema`, **Reload plugins**, error details.
- Version compatibility check against `minAppVersion`.

## Dogfooding

Builtin plugins (all use the same mechanism):

- `greeneek.provider.openrouter` / `openai` / `anthropic` / `echo` / `ollama`
- `greeneek.tool.basic` (current_time, calculator)
- `greeneek.tracer.local`
- `greeneek.mode.chat`
- `greeneek.template.hello` (hello-world example)

The pre-plugin code paths (`registerAdapterRows`) are deleted — there is exactly one way to add a provider/mode/tool: via `plugins/`.

## How to write a plugin

See `plugins/_template/` — a working hello-world plugin (registers one tool and one middleware) with tests. Copy it, change `manifest.id`, implement `init`, and add it to `plugins/index.ts` (and `packages/base/src/plugins/index.ts` for the build). Permissions you declare in the manifest are enforced; a plugin without `network` cannot `fetch`.

## Permissions

A plugin without `network` gets no HTTP client; without `secrets` cannot read API keys; without `filesystem` cannot read files; without `shell` cannot spawn. The kernel enforces this at the context level.

## Testing a plugin

A plugin whose `init` throws is isolated and reported; without `network` it cannot make HTTP calls; disable/enable at runtime works; middleware order is deterministic (see `packages/base/tests/plugins.test.ts`).
