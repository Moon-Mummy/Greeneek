// Plugins index — plain JS for runtime, mirrors packages/base/src/plugins for the build
// This file is at repo root for the spec's file tree; the build also has packages/base/src/plugins/*

const builtins = [
  {
    manifest: { id: "greeneek.provider.echo", name: "Echo Provider", version: "0.1.0", description: "Echo provider", kinds: ["provider"], permissions: [] },
    async init(ctx) { ctx.registry.registerProvider({ id: "echo", label: "Echo", create: () => { const { EchoAdapter } = require("@greeneek/adapters"); return new EchoAdapter(); } }); },
  },
  {
    manifest: { id: "greeneek.provider.openai", name: "OpenAI Provider", version: "0.1.0", description: "OpenAI provider", kinds: ["provider"], permissions: ["network", "secrets"] },
    async init(ctx) { ctx.registry.registerProvider({ id: "openai", label: "OpenAI", create: () => { const { OpenAICompatibleAdapter } = require("@greeneek/adapters"); return new OpenAICompatibleAdapter({ apiKey: ctx.secrets.get("OPENAI_API_KEY") }); } }); },
  },
  {
    manifest: { id: "greeneek.provider.openrouter", name: "OpenRouter Provider", version: "0.1.0", description: "OpenRouter provider", kinds: ["provider"], permissions: ["network", "secrets"] },
    async init(ctx) { ctx.registry.registerProvider({ id: "openrouter", label: "OpenRouter", create: () => { const { OpenRouterAdapter } = require("@greeneek/adapters"); return new OpenRouterAdapter({ apiKey: ctx.secrets.get("OPENROUTER_API_KEY") ?? ctx.secrets.get("OPENAI_API_KEY") }); } }); },
  },
  {
    manifest: { id: "greeneek.provider.anthropic", name: "Anthropic Provider", version: "0.1.0", description: "Anthropic provider", kinds: ["provider"], permissions: ["network", "secrets"] },
    async init(ctx) { ctx.registry.registerProvider({ id: "anthropic", label: "Anthropic", create: () => { const { AnthropicAdapter } = require("@greeneek/adapters"); return new AnthropicAdapter({ apiKey: ctx.secrets.get("ANTHROPIC_API_KEY") }); } }); },
  },
  {
    manifest: { id: "greeneek.provider.ollama", name: "Ollama Provider", version: "0.1.0", description: "Ollama provider", kinds: ["provider"], permissions: ["network"] },
    async init(ctx) { ctx.registry.registerProvider({ id: "ollama", label: "Ollama", create: () => { const { OllamaAdapter } = require("@greeneek/adapters"); return new OllamaAdapter({}); } }); },
  },
  {
    manifest: { id: "greeneek.tool.basic", name: "Basic Tools", version: "0.1.0", description: "Basic tools", kinds: ["tool"], permissions: ["network"] },
    async init(ctx) {
      ctx.registry.registerTool({ name: "current_time", description: "Get current time", parameters: { type: "object", properties: {} }, async execute() { return new Date().toISOString(); } });
      ctx.registry.registerTool({ name: "calculator", description: "Evaluate expression", parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] }, async execute(args) { const expr = String(args.expression ?? ""); try { const val = Function(`"use strict"; return (${expr})`)(); return String(val); } catch (e) { return `error: ${e instanceof Error ? e.message : String(e)}`; } } });
    },
  },
  {
    manifest: { id: "greeneek.tracer.local", name: "Local Tracer", version: "0.1.0", description: "Local tracer", kinds: ["tracer"], permissions: ["filesystem"] },
    async init(ctx) { ctx.registry.registerTracerExporter({ id: "local" }); },
  },
  {
    manifest: { id: "greeneek.mode.agent", name: "Agent Mode", version: "0.1.0", description: "Agent mode", kinds: ["mode"], permissions: [] },
    async init(ctx) { const { MODES } = require("@greeneek/core/mode"); const m = MODES.find(x => x.id === "agent"); if (m) ctx.registry.registerMode({ id: m.id, label: m.label, description: m.description, capabilities: m.capabilities }); },
  },
  {
    manifest: { id: "greeneek.mode.plan", name: "Plan Mode", version: "0.1.0", description: "Plan mode", kinds: ["mode"], permissions: [] },
    async init(ctx) { const { MODES } = require("@greeneek/core/mode"); const m = MODES.find(x => x.id === "plan"); if (m) ctx.registry.registerMode({ id: m.id, label: m.label, description: m.description, capabilities: m.capabilities }); },
  },
  {
    manifest: { id: "greeneek.mode.dry-run", name: "Dry-run Mode", version: "0.1.0", description: "Dry-run mode", kinds: ["mode"], permissions: [] },
    async init(ctx) { const { MODES } = require("@greeneek/core/mode"); const m = MODES.find(x => x.id === "dry-run"); if (m) ctx.registry.registerMode({ id: m.id, label: m.label, description: m.description, capabilities: m.capabilities }); },
  },
  {
    manifest: { id: "greeneek.mode.replay", name: "Replay Mode", version: "0.1.0", description: "Replay mode", kinds: ["mode"], permissions: [] },
    async init(ctx) { const { MODES } = require("@greeneek/core/mode"); const m = MODES.find(x => x.id === "replay"); if (m) ctx.registry.registerMode({ id: m.id, label: m.label, description: m.description, capabilities: m.capabilities }); },
  },
  {
    manifest: { id: "greeneek.mode.chat", name: "Chat Mode", version: "0.1.0", description: "Chat mode", kinds: ["mode"], permissions: [] },
    async init(ctx) { ctx.registry.registerMode({ id: "chat", label: "Chat", description: "Single call", capabilities: { tools: false, multiStep: false, sideEffects: "none" } }); },
  },
];

module.exports = { builtins };
