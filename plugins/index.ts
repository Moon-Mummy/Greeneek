export { providerOpenRouter } from "./provider-openrouter";
export { providerOpenAI } from "./provider-openai";
export { providerAnthropic } from "./provider-anthropic";
export { providerEcho } from "./provider-echo";
export { providerOllama } from "./provider-ollama";
export { toolBasic } from "./tool-basic";
export { tracerLocal } from "./tracer-local";
export { modeChat } from "./mode-chat";
export { modeAgent } from "./mode-agent";
export { modePlan } from "./mode-plan";
export { modeDryRun } from "./mode-dry-run";
export { modeReplay } from "./mode-replay";
export { templatePlugin } from "./_template";

import { providerOpenRouter } from "./provider-openrouter";
import { providerOpenAI } from "./provider-openai";
import { providerAnthropic } from "./provider-anthropic";
import { providerEcho } from "./provider-echo";
import { providerOllama } from "./provider-ollama";
import { toolBasic } from "./tool-basic";
import { tracerLocal } from "./tracer-local";
import { modeChat } from "./mode-chat";
import { modeAgent } from "./mode-agent";
import { modePlan } from "./mode-plan";
import { modeDryRun } from "./mode-dry-run";
import { modeReplay } from "./mode-replay";
import { templatePlugin } from "./_template";

import type { Plugin } from "@greeneek/base/plugin";

export const builtins: Plugin[] = [
  providerEcho,
  providerOpenAI,
  providerOpenRouter,
  providerAnthropic,
  providerOllama,
  toolBasic,
  tracerLocal,
  modeChat,
  modeAgent,
  modePlan,
  modeDryRun,
  modeReplay,
  templatePlugin,
];
