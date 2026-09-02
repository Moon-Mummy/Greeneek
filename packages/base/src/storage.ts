import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getLogger } from "./logger";

const logger = getLogger("greeneek:storage");

export interface VersionedPayload<T> {
  schemaVersion: number;
  data: T;
}

export interface Migration {
  from: number;
  to: number;
  description: string;
  migrate: (data: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Versioned storage layer with migration runner.
 *
 * File format: { schemaVersion: number, data: T }
 * Legacy files without schemaVersion are treated as v1.
 *
 * Migrations run sequentially (v1→v2→v3…). After migration the file is
 * rewritten so the next load is already at the target version.
 */
export function loadVersioned<T>(file: string, defaults: T, migrations: Migration[]): T {
  const currentVersion = migrations.length ? Math.max(...migrations.map((m) => m.to), 1) : 1;

  if (!existsSync(file)) return clone(defaults);

  try {
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<VersionedPayload<T>> & Record<string, unknown>;

    // Legacy shape: flat object without wrapper
    let version: number;
    let data: Record<string, unknown>;
    if (typeof parsed.schemaVersion === "number" && "data" in parsed) {
      version = parsed.schemaVersion;
      data = (parsed.data as Record<string, unknown>) ?? {};
    } else {
      version = 1;
      // treat whole file as data (pre-versioned config.json flat)
      const copy = { ...parsed } as Record<string, unknown>;
      delete copy.schemaVersion;
      delete copy.data;
      data = Object.keys(parsed).length ? (parsed as unknown as Record<string, unknown>) : ({} as Record<string, unknown>);
      // If file was already wrapped but corrupted, fallback to defaults
      if (!data || typeof data !== "object") data = clone(defaults) as Record<string, unknown>;
    }

    if (version > currentVersion) {
      logger.warn(`storage ${file} version ${version} is newer than code ${currentVersion} — using as-is`);
      return data as T;
    }

    let nextData = { ...data };
    let nextVersion = version;
    const sorted = [...migrations].sort((a, b) => a.from - b.from);
    for (const m of sorted) {
      if (nextVersion === m.from) {
        try {
          nextData = m.migrate(clone(nextData));
          nextVersion = m.to;
          logger.info(`migrated ${file} v${m.from}→v${m.to}: ${m.description}`);
        } catch (err) {
          logger.error(`migration v${m.from}→v${m.to} failed: ${err instanceof Error ? err.message : String(err)}`);
          return clone(defaults);
        }
      }
    }

    if (nextVersion !== version) {
      saveVersioned(file, nextData as T, nextVersion);
    }

    // Merge defaults for missing keys (non-destructive)
    const merged = { ...clone(defaults as Record<string, unknown>), ...nextData } as T;
    // Drop unknown keys with warning
    const allowed = new Set(Object.keys(defaults as Record<string, unknown>));
    for (const k of Object.keys(merged as Record<string, unknown>)) {
      if (!allowed.has(k) && k !== "schemaVersion") {
        logger.warn(`dropping unknown key "${k}" from ${file}`);
        delete (merged as Record<string, unknown>)[k];
      }
    }

    return merged;
  } catch (err) {
    logger.warn(`corrupt storage ${file} — resetting to defaults: ${err instanceof Error ? err.message : String(err)}`);
    return clone(defaults);
  }
}

export function saveVersioned<T>(file: string, data: T, schemaVersion: number): void {
  mkdirSync(dirname(file), { recursive: true });
  const payload: VersionedPayload<T> = { schemaVersion, data: clone(data) };
  writeFileSync(file, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

export function saveVersionedAtomic<T>(file: string, updater: (prev: T) => T, defaults: T, migrations: Migration[]): T {
  const current = loadVersioned(file, defaults, migrations);
  const next = updater(clone(current));
  const version = migrations.length ? Math.max(...migrations.map((m) => m.to), 1) : 1;
  saveVersioned(file, next, version);
  return next;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Built-in migrations for Greeneek settings.
 *
 * v1 → v2: Remove theme key (migrated to localStorage/UI) and normalise
 * stored API keys (trim whitespace/Bearer prefix).
 */
export const SETTINGS_MIGRATIONS: Migration[] = [
  {
    from: 1,
    to: 2,
    description: "remove theme key, normalise API keys (trim)",
    migrate(data) {
      const next = { ...data };
      // Drop theme artefacts
      delete next.theme;
      delete next.accent;
      delete next.preset;
      delete (next as Record<string, unknown>).themeMode;
      // Normalise any field that looks like an API key
      for (const [k, v] of Object.entries(next)) {
        if (typeof v === "string" && /api[_-]?key|secret|token/i.test(k)) {
          let s = v.trim();
          if (s.toLowerCase().startsWith("bearer ")) s = s.slice(7).trim();
          next[k] = s;
        }
        if (v && typeof v === "object" && !Array.isArray(v)) {
          const inner = v as Record<string, unknown>;
          for (const [ik, iv] of Object.entries(inner)) {
            if (typeof iv === "string" && /api[_-]?key|secret|token/i.test(ik)) {
              let s = iv.trim();
              if (s.toLowerCase().startsWith("bearer ")) s = s.slice(7).trim();
              inner[ik] = s;
            }
          }
        }
      }
      // Also normalise nested providers.*.apiKey if present
      const providers = next.providers as Record<string, unknown> | undefined;
      if (providers && typeof providers === "object") {
        for (const provider of Object.values(providers)) {
          if (provider && typeof provider === "object") {
            const p = provider as Record<string, unknown>;
            if (typeof p.apiKey === "string") {
              let s = (p.apiKey as string).trim();
              if (s.toLowerCase().startsWith("bearer ")) s = s.slice(7).trim();
              p.apiKey = s;
            }
          }
        }
      }
      return next;
    },
  },
];

/** Small helper for credentials file migration (trim). */
export function migrateCredentialsFile(file: string): void {
  if (!existsSync(file)) return;
  try {
    const raw = readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as Record<string, string>;
    let changed = false;
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") {
        let s = v.trim();
        if (/api[_-]?key|secret|token/i.test(k) && s.toLowerCase().startsWith("bearer ")) s = s.slice(7).trim();
        if (s !== v) changed = true;
        next[k] = s;
      } else {
        next[k] = v as string;
      }
      // drop legacy theme keys if someone stored them here
      if (k.toLowerCase().includes("theme")) {
        delete next[k];
        changed = true;
      }
    }
    if (changed) {
      writeFileSync(file, JSON.stringify(next, null, 2), { mode: 0o600 });
      getLogger("greeneek:storage").info(`normalised credentials ${file}`);
    }
  } catch {
    // corrupt — loadCredentials will treat as empty
  }
}
