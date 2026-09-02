/**
 * Provider error taxonomy — maps HTTP status + provider payload to a stable kind.
 * Every non-200 must NOT be reported as "invalid key".
 */
export type ProviderErrorKind =
  | "auth"
  | "credits"
  | "rate_limit"
  | "model_not_found"
  | "bad_request"
  | "network"
  | "timeout"
  | "server"
  | "moderation"
  | "unknown";

export class ProviderError extends Error {
  kind: ProviderErrorKind;
  status?: number;
  providerMessage?: string;
  retryable: boolean;
  raw?: unknown;

  constructor(opts: {
    kind: ProviderErrorKind;
    message: string;
    status?: number;
    providerMessage?: string;
    retryable?: boolean;
    raw?: unknown;
  }) {
    super(opts.message);
    this.name = "ProviderError";
    this.kind = opts.kind;
    this.status = opts.status;
    this.providerMessage = opts.providerMessage;
    this.retryable = opts.retryable ?? false;
    this.raw = opts.raw;
  }
}

export function mapProviderError(
  status: number,
  bodyText: string,
  provider: string,
): ProviderError {
  let parsed: unknown = null;
  let providerMessage = bodyText.slice(0, 800);
  try {
    parsed = JSON.parse(bodyText);
    const obj = parsed as Record<string, unknown>;
    const errObj = obj?.error as Record<string, unknown> | undefined;
    if (errObj && typeof errObj.message === "string") providerMessage = String(errObj.message).slice(0, 800);
    else if (typeof obj?.message === "string") providerMessage = String(obj.message).slice(0, 800);
  } catch {
    // keep raw text
  }
  const code = (() => {
    try {
      const obj = parsed as Record<string, unknown>;
      const errObj = obj?.error as Record<string, unknown> | undefined;
      return String(errObj?.code ?? "").toLowerCase();
    } catch {
      return "";
    }
  })();
  const msgLower = providerMessage.toLowerCase();

  if (status === 401) {
    return new ProviderError({
      kind: "auth",
      status,
      providerMessage,
      raw: parsed ?? bodyText,
      retryable: false,
      message: `Invalid API key for ${provider} (${status}): ${providerMessage}`,
    });
  }
  if (status === 402) {
    return new ProviderError({
      kind: "credits",
      status,
      providerMessage,
      raw: parsed ?? bodyText,
      retryable: false,
      message: `Out of credits on ${provider} — add credits or pick a :free model (${status}): ${providerMessage}`,
    });
  }
  if (status === 429) {
    return new ProviderError({
      kind: "rate_limit",
      status,
      providerMessage,
      raw: parsed ?? bodyText,
      retryable: true,
      message: `Rate limited on ${provider} (${status}): ${providerMessage}`,
    });
  }
  if (status === 403 && (msgLower.includes("moderation") || msgLower.includes("flagged"))) {
    return new ProviderError({ kind: "moderation", status, providerMessage, raw: parsed ?? bodyText, retryable: false, message: `Moderation block on ${provider} (${status}): ${providerMessage}` });
  }
  if (status === 403) {
    return new ProviderError({ kind: "auth", status, providerMessage, raw: parsed ?? bodyText, retryable: false, message: `Forbidden on ${provider} (${status}): ${providerMessage}` });
  }
  if (status === 404 || code.includes("model_not_found") || (status === 400 && (msgLower.includes("model") || code.includes("model")))) {
    // Distinguish model_not_found from generic bad_request
    if (msgLower.includes("model") || code.includes("model")) {
      return new ProviderError({ kind: "model_not_found", status, providerMessage, raw: parsed ?? bodyText, retryable: false, message: `Model not found on ${provider} (${status}): ${providerMessage}` });
    }
  }
  if (status === 400) {
    return new ProviderError({ kind: "bad_request", status, providerMessage, raw: parsed ?? bodyText, retryable: false, message: `Bad request to ${provider} (${status}): ${providerMessage}` });
  }
  if (status === 408) {
    return new ProviderError({ kind: "timeout", status, providerMessage, raw: parsed ?? bodyText, retryable: true, message: `Timeout on ${provider} (${status}): ${providerMessage}` });
  }
  if (status >= 500) {
    return new ProviderError({ kind: "server", status, providerMessage, raw: parsed ?? bodyText, retryable: true, message: `Server error on ${provider} (${status}): ${providerMessage}` });
  }
  return new ProviderError({ kind: "unknown", status, providerMessage, raw: parsed ?? bodyText, retryable: false, message: `Provider error on ${provider} (${status}): ${providerMessage}` });
}

export function mapNetworkError(err: unknown, provider: string): ProviderError {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes("abort") || lower.includes("aborted")) {
    return new ProviderError({ kind: "unknown", providerMessage: msg, retryable: false, message: `Request aborted on ${provider}: ${msg}` });
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return new ProviderError({ kind: "timeout", providerMessage: msg, retryable: true, message: `Timeout on ${provider}: ${msg}` });
  }
  return new ProviderError({ kind: "network", providerMessage: msg, retryable: true, message: `Network error on ${provider}: ${msg}` });
}
