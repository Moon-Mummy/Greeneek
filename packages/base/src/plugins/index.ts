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

import type { Plugin } from "../plugin";

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
