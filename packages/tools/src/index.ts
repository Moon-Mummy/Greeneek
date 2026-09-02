import type { ToolRegistry } from "@greeneek/core";
import { registerFsTools } from "./fs";
import { registerWebTools } from "./web";
import { registerShellTool } from "./shell";
import { registerCalcTool } from "./calc";

export { evaluate } from "./calc";

/** Register every built-in Greeneek tool on the registry. */
export function registerBuiltinTools(registry: ToolRegistry): void {
  registerFsTools(registry);
  registerWebTools(registry);
  registerShellTool(registry);
  registerCalcTool(registry);
}
