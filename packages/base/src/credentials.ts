import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Credentials store — ~/.greeneek/credentials.json plus environment overlay.
 *
 * Keys are read but never echoed by the server; the settings UI writes only
 * masked/generated credentials.
 */
/**
 * File-backed credentials only. Environment overlay is handled exclusively by
 * `settings.ts:settingsFromEnv()` — this module must not read process.env
 * so the settings module remains the single source of truth.
 */
export function loadCredentials(file: string): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = {};
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
      for (const [k, v] of Object.entries(parsed)) {
        // Defensive: normalise on read (trim, strip Bearer) — migration also does this
        if (typeof v === "string") {
          let s = v.trim();
          if (/api[_-]?key|secret|token/i.test(k) && s.toLowerCase().startsWith("bearer ")) s = s.slice(7).trim();
          values[k] = s;
        } else {
          values[k] = v as unknown as string;
        }
      }
    } catch {
      // corrupt credential file: treat as empty, never crash boot
    }
  }
  return values;
}

export function saveCredential(file: string, key: string, value: string): void {
  const existing = loadCredentials(file);
  existing[key] = value;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(existing, null, 2), { mode: 0o600 });
}
