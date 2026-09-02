import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Credentials store — ~/.greeneek/credentials.json plus environment overlay.
 *
 * Keys are read but never echoed by the server; the settings UI writes only
 * masked/generated credentials.
 */
export function loadCredentials(file: string): Record<string, string | undefined> {
  const values: Record<string, string | undefined> = {};
  if (existsSync(file)) {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
      for (const [k, v] of Object.entries(parsed)) values[k] = v;
    } catch {
      // corrupt credential file: treat as empty, never crash boot
    }
  }
  for (const k of [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "OLLAMA_API_KEY",
    "EXA_API_KEY",
    "PERPLEXITY_API_KEY",
    "DEEPSEEK_API_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "GREENEK_AUTO_APPROVE",
    "GREENEK_MODEL_PROVIDER",
  ]) {
    if (process.env[k]) values[k] = process.env[k];
  }
  return values;
}

export function saveCredential(file: string, key: string, value: string): void {
  const existing = loadCredentials(file);
  existing[key] = value;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(existing, null, 2), { mode: 0o600 });
}
