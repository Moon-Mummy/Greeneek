import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ProfilePatchRow } from "@greeneek/core";
import { compareSemver, satisfies } from "./semver";

export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  entryPoints: string[];
  rows: ProfilePatchRow[];
  signature?: string;
  publisher?: string;
  verified?: boolean;
}

/**
 * Plugin marketplace registry (feature 03).
 *
 * Sources: local JSON registry file (offline/dev), a curated HTTP registry
 * URL (GREENEek_MARKETPLACE_URL), or a plugin page. Manifests carry semver,
 * an optional publisher signature, and the rows they mount into the profile
 * patch — which is the documented, reversible install flow.
 */
export class MarketplaceRegistry {
  constructor(
    private baseDir: string,
    private remoteUrl?: string,
  ) {}

  private file(): string {
    return join(this.baseDir, "registry.json");
  }

  private readLocal(): PluginManifest[] {
    if (!existsSync(this.file())) return [];
    return JSON.parse(readFileSync(this.file(), "utf8")) as PluginManifest[];
  }

  async search(query = ""): Promise<PluginManifest[]> {
    const local = this.readLocal();
    if (this.remoteUrl) {
      try {
        const res = await fetch(new URL(`${this.remoteUrl}?q=${encodeURIComponent(query)}`));
        if (res.ok) return ((await res.json()) as PluginManifest[]).concat(local);
      } catch {
        // registry unreachable: degrade to local
      }
    }
    const q = query.toLowerCase();
    return local.filter((m) => m.id.includes(q) || m.name.toLowerCase().includes(q));
  }

  resolve(pluginId: string, range = "*"): PluginManifest | null {
    const candidates = this.readLocal().filter((m) => m.id === pluginId && satisfies(m.version, range));
    if (!candidates.length) return null;
    return candidates.sort((a, b) => compareSemver(b.version, a.version))[0];
  }

  verify(manifest: PluginManifest): { verified: boolean; reason: string } {
    if (!manifest.signature) return { verified: false, reason: "unsigned manifest" };
    if (!manifest.verified) return { verified: false, reason: "publisher not verified" };
    return { verified: true, reason: "signature + verified publisher" };
  }
}

/** Install = write plugin rows into the profile patch (the durable cut seam). */
export function installPlugin(manifest: PluginManifest, patchFile: string): void {
  const rows = readPatchFile(patchFile);
  for (const row of manifest.rows) {
    const idx = rows.findIndex((r) => r.id === row.id);
    if (idx >= 0) rows[idx] = { ...row, enabled: true };
    else rows.push(row);
  }
  writePatchFile(patchFile, rows);
}

/** Local patch-file I/O (mirror of the base implementation; no cycle). */
export function readPatchFile(file: string): ProfilePatchRow[] {
  if (!existsSync(file)) return [];
  const raw = readFileSync(file, "utf8").trim();
  if (!raw) return [];
  if (raw.startsWith("{")) return (JSON.parse(raw) as { rows?: ProfilePatchRow[] }).rows ?? [];
  const rows: ProfilePatchRow[] = [];
  let current: ProfilePatchRow | null = null;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    const indent = line.match(/^\s*/)?.[0].length ?? 0;
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

export function writePatchFile(file: string, rows: ProfilePatchRow[]): void {
  mkdirSync(dirname(file), { recursive: true });
  const yaml = [
    "rows:",
    ...rows.map(
      (r) => `  - id: ${r.id}\n    type: ${r.type}\n    enabled: ${r.enabled !== false}\n${r.options ? `    options: ${JSON.stringify(r.options)}` : ""}`,
    ),
  ].join("\n");
  writeFileSync(file, yaml, "utf8");
}

export function seedDemoRegistry(baseDir: string): void {
  mkdirSync(baseDir, { recursive: true });
  const file = join(baseDir, "registry.json");
  if (!existsSync(file)) {
    const demo: PluginManifest[] = [
      {
        id: "greeneek.weather",
        name: "Weather probe",
        description: "Adds a weather.check tool that returns structured observations.",
        version: "1.0.0",
        entryPoints: ["dist/index.js"],
        rows: [{ id: "plugin.weather.tool", type: "tool.custom", options: { tool: "weather.check" } }],
        publisher: "Greeneek Labs",
        verified: true,
        signature: "demo",
      },
      {
        id: "greeneek.report",
        name: "Report styleguide",
        description: "Injects a report-writing system-prompt section.",
        version: "2.1.0",
        entryPoints: ["dist/index.js"],
        rows: [{ id: "plugin.report.styleguide", type: "system-prompt.section", options: { name: "Report styleguide" } }],
        publisher: "Greeneek Labs",
        verified: true,
        signature: "demo",
      },
    ];
    writeFileSync(file, JSON.stringify(demo, null, 2));
  }
}
