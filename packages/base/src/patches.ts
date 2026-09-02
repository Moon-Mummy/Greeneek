import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ProfilePatchRow } from "@greeneek/core";

/**
 * Patch files — the reversible product cut seam.
 *
 * cordis.patch.yml (JSON-compatible YAML) contains:
 *   rows:
 *     - id: ...
 *       type: ...
 *       enabled: true|false
 *       options: {...}
 *
 * Home patch applies to every profile; CLI overlay is the final word.
 */
export function loadPatchFile(file: string): ProfilePatchRow[] {
  if (!existsSync(file)) return [];
  const raw = readFileSync(file, "utf8").trim();
  if (!raw) return [];
  // JSON is a YAML subset; we accept strict JSON plus a minimal `rows:` list.
  if (raw.startsWith("{")) {
    const parsed = JSON.parse(raw) as { rows?: ProfilePatchRow[] };
    return parsed.rows ?? [];
  }
  return parseLiteYamlRows(raw);
}

export function writePatchFile(file: string, rows: ProfilePatchRow[]): void {
  mkdirSync(dirname(file), { recursive: true });
  const yaml = ["rows:", ...rows.map((r) => `  - id: ${r.id}\n    type: ${r.type}\n    enabled: ${r.enabled !== false}\n${r.options ? `    options: ${JSON.stringify(r.options)}` : ""}`)].join("\n");
  writeFileSync(file, yaml, "utf8");
}

/** Minimal YAML subset parser for patch rows. */
function parseLiteYamlRows(raw: string): ProfilePatchRow[] {
  const rows: ProfilePatchRow[] = [];
  let current: ProfilePatchRow | null = null;
  for (const line of raw.split("\n")) {
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (indent === 0 && trimmed === "rows:") continue;
    if (indent === 2 && trimmed.startsWith("- id:")) {
      if (current) rows.push(current);
      current = { id: trimmed.slice(5).trim(), type: "" };
    } else if (indent === 4 && current) {
      const m = trimmed.match(/^(\w+):\s*(.*)$/);
      if (!m) continue;
      const [, key, value] = m;
      if (key === "type") current.type = value;
      else if (key === "enabled") current.enabled = value !== "false";
      else if (key === "options") {
        try {
          current.options = JSON.parse(value);
        } catch {
          current.options = {};
        }
      }
    }
  }
  if (current) rows.push(current);
  return rows;
}
