/**
 * Shared SSE parser — handles OpenRouter keep-alive `: OPENROUTER PROCESSING`,
 * empty lines, `data: [DONE]`, and tolerate malformed JSON.
 */
export interface SSEChunk {
  data: string;
  event?: string;
}

export async function* parseSSE(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) throw new Error("aborted");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        if (!line) continue; // empty keep-alive
        if (line.startsWith(":")) continue; // comment keep-alive e.g. : OPENROUTER PROCESSING
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        if (!payload) continue;
        yield payload;
      }
    }
    // flush remainder
    const tail = buffer.trim();
    if (tail && tail.startsWith("data:")) {
      const payload = tail.slice(5).trim();
      if (payload && payload !== "[DONE]") yield payload;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

export function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
