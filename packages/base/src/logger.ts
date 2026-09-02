export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Structured logger with automatic secret redaction.
 *
 * Redacts known secret patterns before emitting. Never log raw credentials.
 * Use this instead of bare console.log in production code.
 */
export class Logger {
  private level: LogLevel;

  constructor(
    private namespace: string,
    level: LogLevel = "info",
  ) {
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.emit("debug", message, meta);
  }
  info(message: string, meta?: Record<string, unknown>): void {
    this.emit("info", message, meta);
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    this.emit("warn", message, meta);
  }
  error(message: string, meta?: Record<string, unknown>): void {
    this.emit("error", message, meta);
  }

  private emit(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    const redactedMsg = redactSecrets(message);
    const redactedMeta = meta ? redactObject(meta) : undefined;
    const ts = new Date().toISOString();
    const line =
      redactedMeta && Object.keys(redactedMeta).length
        ? `[${ts}] [${this.namespace}] [${level}] ${redactedMsg} ${JSON.stringify(redactedMeta)}`
        : `[${ts}] [${this.namespace}] [${level}] ${redactedMsg}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else if (level === "debug") console.debug(line);
    else console.log(line);
  }
}

const SECRET_PATTERNS: RegExp[] = [
  /sk-or-[a-zA-Z0-9_-]+/g,
  /sk-[a-zA-Z0-9]{20,}/g,
  /sk-proj-[a-zA-Z0-9_-]+/g,
  /gsk_[a-zA-Z0-9]{20,}/g,
  /rk_[a-zA-Z0-9]{20,}/g,
  /Bearer\s+sk-[^\s"']+/gi,
  /Bearer\s+sk-or-[^\s"']+/gi,
];

const KEY_PATTERNS: RegExp[] = [/api[_-]?key/i, /credentials/i, /secret/i, /token/i];

export function redactSecrets(input: string): string {
  if (!input || typeof input !== "string") return input;
  let out = input;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m) => {
      if (m.toLowerCase().startsWith("bearer")) return "Bearer sk-****";
      if (m.startsWith("sk-or-")) return "sk-or-****";
      if (m.startsWith("sk-proj-")) return "sk-proj-****";
      if (m.startsWith("gsk_")) return "gsk_****";
      if (m.startsWith("rk_")) return "rk_****";
      return "sk-****";
    });
  }
  // Generic key=value redaction: api_key=...  or "apiKey": "sk-..."
  out = out.replace(/("?(?:api[_-]?key|secret|token)"?\s*[:=]\s*"?)([^"\s,}]+)"?/gi, (_m, prefix: string) => `${prefix}"****"`);
  return out;
}

export function redactObject(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const isSensitive = KEY_PATTERNS.some((re) => re.test(k));
    if (isSensitive && typeof v === "string" && v.length > 0) {
      out[k] = "****";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redactObject(v as Record<string, unknown>);
    } else if (typeof v === "string") {
      out[k] = redactSecrets(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Factory — keep one instance per namespace. */
const instances = new Map<string, Logger>();
export function getLogger(namespace: string, level?: LogLevel): Logger {
  const existing = instances.get(namespace);
  if (existing) {
    if (level) existing.setLevel(level);
    return existing;
  }
  const created = new Logger(namespace, level);
  instances.set(namespace, created);
  return created;
}

/** Singletons for the harness. */
export const systemLogger = getLogger("greeneek");
