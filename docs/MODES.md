# Modes — Multiple runtime modes

Same conversation can run under different execution strategies, chosen from the composer next to the model.

## Contract

`packages/core/src/mode.ts:4` `Mode {id,label,description,capabilities,defaultParams,buildSystemPrompt,run}`, `ModeContext:15` `messages/tools/secrets/workingDir/signal/chat/callTool/emit/traceStore`, `ModeRunEvent:29` `assistant.delta/done/step.start/end/tool.request/result/approval.request/plan/note/error`.

## Built-ins (each `plugins/mode-*/manifest.json` `kinds:["mode"]`)

1. **Chat** `mode.ts:42` single call, `tools:false` — default.
2. **Agent** `mode.ts:99` tool loop `reason→tool→observe` up to `maxSteps 12`, `sideEffects:ask` → inline **Approve/Deny** `mode.ts:132`, steps collapsible `web/src/App.tsx:540`.
3. **Plan** `mode.ts:63` model first emits numbered `plan{steps,tools}` `mode.ts:81`, user **Run plan** (like Agent) or **Refine**; also `plan-only` when tools disabled.
4. **Dry-run** `mode.ts:144` identical to Agent but `callTool` returns `"[dry-run: would call X with …]"` `mode.ts:174`, `agent.ts:168` stub, never calls `registry.execute` — safe to test.
5. **Replay** `mode.ts:183` `trigger:replay` takes `runId` from Traces → reconstructs inputs, re-executes with same/different model, side-by-side diff `usage/cost`, itself a traced `run` `trigger:replay` link to original.
6. **Headless/Batch** `apps/headless/src/index.ts:12` `runHeadless(task,{mode,model})` + `runBatch(input,output)` `headless/src/index.ts:28` `prompts.jsonl→results.jsonl` via `Runtime`, `apps/cli/src/index.ts:37` `greeneek run --mode/--model/--input/--out`.

`Debug` toggle (not a mode) shows every `RunEvent` inline.

## Integration

- Mode chip `web/src/App.tsx:591/677` `mode-chip` `Mode` `chat/agent/plan/dry-run/replay` with descriptions `App.tsx:850` picker, per-conversation `conversationMode` `App.tsx:146` `localStorage gk.mode.<sessionId>`, default `settings.defaults.mode` `settings.ts:23` `Settings → Defaults`.
- `run.modeId` on `Run/Span/SessionEvent` `server/src/app.ts:438` `agent.ts:90`, `mode.step` spans `mode.ts:112`.
- Capabilities gate UI: `tools` panel hidden in `Chat`, approval cards only `Agent/Plan` `web/src/App.tsx:540`.
- Param overrides: `settings.defaults → mode.defaultParams → conversation` `agent.ts:90`.

## Tests

`packages/core/tests/mode.test.ts:1` `agent` stops at `maxSteps`, denied `approval` ends with reason, `dry-run` never calls `execute` `mode.test.ts:22`, `replay` reproduces identical `chat` bodies (except `model`), `mode` switch persists `mode.test.ts:30`. Acceptance: `chat→agent→dry-run→replay` from composer → distinct traces `server/src/app.ts:438` + `mode.test.ts:4`.
