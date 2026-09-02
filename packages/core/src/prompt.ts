import type { SystemPromptSection } from "./types";

/**
 * System-prompt assembly seam.
 *
 * Layers register sections with a priority; the scaffold sections are built
 * in priority order so plugins can inject context without rewriting the base
 * prompt.
 */
export class PromptAssembly {
  private sections: SystemPromptSection[] = [];

  add(section: SystemPromptSection): void {
    this.sections.push(section);
    this.sections.sort((a, b) => a.priority - b.priority);
  }

  render(): string {
    const parts = this.sections
      .filter((s) => s.content.trim().length > 0)
      .map((s) => `## ${s.name}\n${s.content.trim()}`);
    return parts.join("\n\n");
  }
}
