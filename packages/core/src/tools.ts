import type { ApprovalPolicy, ApprovalRequest, HarnessTool, ToolContext, ToolDefinition } from "./types";

/**
 * Tool registry with a guarded execution pipeline.
 *
 * Tools register definitions; the registry scopes which tools a session sees,
 * applies approval policy, and lets the audit seam observe post-execute
 * (tools/post-execute) without touching tool code.
 */
export class ToolRegistry {
  private tools = new Map<string, HarnessTool>();
  private beforeExecute: ((req: ApprovalRequest) => Promise<boolean>)[] = [];
  private afterExecute: ((req: ApprovalRequest, ok: boolean, output: string) => Promise<void> | void)[] = [];

  register(tool: HarnessTool): void {
    this.tools.set(tool.definition.name, tool);
  }

  get(name: string): HarnessTool | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => t.definition);
  }

  onBeforeExecute(fn: (req: ApprovalRequest) => Promise<boolean>): void {
    this.beforeExecute.push(fn);
  }

  onAfterExecute(fn: (req: ApprovalRequest, ok: boolean, output: string) => void): void {
    this.afterExecute.push(fn);
  }

  setPolicy(policy: ApprovalPolicy): void {
    this.policy = policy;
  }

  private policy: ApprovalPolicy = "auto";

  async approve(
    callId: string,
    tool: HarnessTool,
    args: Record<string, unknown>,
  ): Promise<boolean> {
    const requireApproval =
      tool.definition.requireApproval === true || this.policy === "always";
    if (!requireApproval) return true;
    const req: ApprovalRequest = { callId, name: tool.definition.name, arguments: args, requireApproval };
    for (const fn of this.beforeExecute) {
      const ok = await fn(req);
      if (!ok) return false;
    }
    return true;
  }

  async execute(
    callId: string,
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<{ ok: boolean; output: string }> {
    const tool = this.get(name);
    if (!tool) return { ok: false, output: `Unknown tool: ${name}` };
    const start = Date.now();
    let ok = false;
    let output = "";
    try {
      if (!(await this.approve(callId, tool, args))) {
        return { ok: false, output: "Blocked: approval required and denied." };
      }
      output = await tool.execute(args, ctx);
      ok = true;
      return { ok, output };
    } catch (err) {
      output = err instanceof Error ? err.message : String(err);
      ok = false;
      return { ok, output };
    } finally {
      for (const fn of this.afterExecute) {
        try {
          await fn({ callId, name, arguments: args, requireApproval: false }, ok, output);
        } catch {
          // audit hooks never break execution
        }
      }
      void start;
    }
  }
}
