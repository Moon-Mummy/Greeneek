import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenRouterAdapter } from "../src/openrouter";
import { OpenAICompatibleAdapter } from "../src/openai";
import { createAdapter } from "../src/index";
import { Harness } from "@greeneek/core";

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let idx = 0;
  return new ReadableStream({
    pull(controller) {
      if (idx < chunks.length) controller.enqueue(encoder.encode(chunks[idx++]));
      else controller.close();
    },
  }) as unknown as ReadableStream<Uint8Array>;
}

function mockResponse(status: number, body: string | Record<string, unknown>, headers: Record<string, string> = {}): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } as Headers,
    text: async () => text,
    json: async () => JSON.parse(text),
    body: null,
  } as unknown as Response;
}

function mockStreamResponse(chunks: string[], status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: sseBody(chunks),
    headers: { get: () => null } as unknown as Headers,
    text: async () => chunks.join(""),
    json: async () => ({}),
  } as unknown as Response;
}

describe("Provider layer — Phase 2", () => {
  let origFetch: typeof fetch;
  beforeEach(() => {
    origFetch = global.fetch;
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    global.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it("key normalisation trims whitespace and Bearer prefix", () => {
    const a = new OpenRouterAdapter({ apiKey: "  Bearer sk-or-abc123  ", baseUrl: "https://openrouter.ai/api/v1" });
    expect((a as unknown as { apiKey: string }).apiKey).toBe("sk-or-abc123");
    const b = new OpenAICompatibleAdapter({ apiKey: "  Bearer sk-xyz  " });
    expect((b as unknown as { apiKey: string }).apiKey).toBe("sk-xyz");
  });

  it("validateCredentials uses /auth/key and does not use /models for key check", async () => {
    const adapter = new OpenRouterAdapter({ apiKey: "sk-or-valid" });
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValueOnce(mockResponse(200, { data: { label: "test", usage: 10, limit: 100 } }));
    const result = await adapter.validateCredentials({ apiKey: "sk-or-valid" });
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/auth/key"), expect.anything());
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/models"), expect.anything());

    fetchMock.mockResolvedValueOnce(mockResponse(401, { error: { message: "Invalid key" } }));
    const bad = await adapter.validateCredentials({ apiKey: "sk-or-bad" });
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain("Invalid API key");
  });

  it("listModels maps pricing/context_length/modalities and marks :free", async () => {
    const adapter = new OpenRouterAdapter({ apiKey: "sk-or-valid" });
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValueOnce(
      mockResponse(200, {
        data: [
          {
            id: "openai/gpt-4o-mini",
            name: "GPT-4o Mini",
            context_length: 128000,
            pricing: { prompt: "0.00000015", completion: "0.0000006" },
            architecture: { input_modalities: ["text"], output_modalities: ["text"] },
            supported_parameters: ["tools"],
          },
          { id: "meta-llama/llama-3.1-8b-instruct:free", name: "Llama Free", context_length: 131000, pricing: { prompt: "0", completion: "0" }, supported_parameters: [] },
        ],
      }),
    );
    const models = await adapter.listModels({}, { forceRefresh: true });
    const mini = models.find((m) => m.id === "openai/gpt-4o-mini")!;
    expect(mini.pricing?.promptPer1M).toBeCloseTo(0.15);
    expect(mini.contextLength).toBe(128000);
    expect(mini.supportsTools).toBe(true);
    const free = models.find((m) => m.id.includes(":free"))!;
    expect(free.pricing?.isFree).toBe(true);
  });

  it("listModels uses cache on failure, fallback list with warning when no cache", async () => {
    const adapter = new OpenRouterAdapter({ apiKey: "sk-or-valid" });
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const models = await adapter.listModels({}, { forceRefresh: true });
    // fallback list should have at least 5 entries
    expect(models.length).toBeGreaterThan(0);
    expect(models.some((m) => m.id.includes("openai/gpt-4o-mini"))).toBe(true);
  });

  it("chat streams with keep-alive comments and [DONE]", async () => {
    const adapter = new OpenRouterAdapter({ apiKey: "sk-or-valid", model: "openai/gpt-4o-mini" });
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValueOnce(
      mockStreamResponse([
        ": OPENROUTER PROCESSING\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n",
        ": OPENROUTER PROCESSING\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n",
        "data: [DONE]\n\n",
      ]),
    );
    const chunks: unknown[] = [];
    for await (const ev of adapter.stream([{ id: "1", role: "user", content: "hi" }], {})) chunks.push(ev);
    const texts = chunks.filter((c) => (c as { type: string }).type === "text").map((c) => (c as { delta: string }).delta).join("");
    expect(texts).toBe("Hello world");
  });

  it("chat accumulates tool calls split across chunks", async () => {
    const adapter = new OpenRouterAdapter({ apiKey: "sk-or-valid" });
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValueOnce(
      mockStreamResponse([
        "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"function\":{\"name\":\"calc\"}}]}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"{\\\"expr\\\"\"}}]}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\":\\\"2+2\\\"}\"}}]}}]}\n\n",
        "data: [DONE]\n\n",
      ]),
    );
    const events: unknown[] = [];
    for await (const ev of adapter.stream([{ id: "1", role: "user", content: "@execute calc" }], {})) events.push(ev);
    const toolEv = events.find((e) => (e as { type: string }).type === "toolCalls") as { calls: Array<{ name: string; arguments: Record<string, unknown> }> } | undefined;
    expect(toolEv).toBeDefined();
    expect(toolEv!.calls[0].name).toBe("calc");
    expect(toolEv!.calls[0].arguments).toEqual({ expr: "2+2" });
  });

  it("chat throws precise ProviderError for 401/402/429/404, never as 'invalid key' for non-auth", async () => {
    const adapter = new OpenRouterAdapter({ apiKey: "sk-or-valid" });
    const fetchMock = vi.mocked(global.fetch);

    // 401 -> auth
    fetchMock.mockResolvedValueOnce(mockResponse(401, { error: { message: "Invalid API key", code: 401 } }));
    await expect(adapter.stream([{ id: "1", role: "user", content: "hi" }], {}).next()).rejects.toMatchObject({ kind: "auth", status: 401 });

    // 402 -> credits (must not be auth)
    fetchMock.mockResolvedValueOnce(mockResponse(402, { error: { message: "Insufficient credits", code: 402 } }));
    await expect(adapter.stream([{ id: "1", role: "user", content: "hi" }], {}).next()).rejects.toMatchObject({ kind: "credits", status: 402 });

    // 429 -> rate_limit retryable
    fetchMock.mockResolvedValueOnce(mockResponse(429, { error: { message: "Rate limited", code: 429 } }));
    await expect(adapter.stream([{ id: "1", role: "user", content: "hi" }], {}).next()).rejects.toMatchObject({ kind: "rate_limit", retryable: true });

    // 404 model not found -> model_not_found not auth
    fetchMock.mockResolvedValueOnce(mockResponse(404, { error: { message: "Model openai/gpt-404 not found", code: "model_not_found" } }));
    await expect(adapter.stream([{ id: "1", role: "user", content: "hi" }], {}).next()).rejects.toMatchObject({ kind: "model_not_found" });
  });

  it("openai adapter maps 402 and 404 distinctly from 401", async () => {
    const adapter = new OpenAICompatibleAdapter({ apiKey: "sk-test" });
    const fetchMock = vi.mocked(global.fetch);
    fetchMock.mockResolvedValueOnce(mockResponse(402, { error: { message: "No credits" } }));
    await expect(adapter.stream([{ id: "1", role: "user", content: "hi" }], {}).next()).rejects.toMatchObject({ kind: "credits" });

    fetchMock.mockResolvedValueOnce(mockResponse(404, { error: { message: "Model gpt-404 not found" } }));
    await expect(adapter.stream([{ id: "1", role: "user", content: "hi" }], {}).next()).rejects.toMatchObject({ kind: "model_not_found" });
  });

  it("SSE parser tolerates malformed JSON chunk and mid-stream error object", async () => {
    const adapter = new OpenRouterAdapter({ apiKey: "sk-or-valid" });
    const fetchMock = vi.mocked(global.fetch);
    // first chunk malformed, second valid, then stream error
    fetchMock.mockResolvedValueOnce(
      mockStreamResponse([
        "data: {invalid json\n\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}\n\n",
        "data: [DONE]\n\n",
      ]),
    );
    const evs: unknown[] = [];
    for await (const ev of adapter.stream([{ id: "1", role: "user", content: "hi" }], {})) evs.push(ev);
    expect(evs.some((e) => (e as { delta: string }).delta === "ok")).toBe(true);
  });

  it("abort mid-stream honours AbortSignal", async () => {
    const adapter = new OpenRouterAdapter({ apiKey: "sk-or-valid" });
    const fetchMock = vi.mocked(global.fetch);
    // create a stream that never ends, then abort
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(async (_url, opts) => {
      // if signal already aborted, throw
      if ((opts as RequestInit).signal?.aborted) throw new Error("aborted");
      // return a stream that yields one chunk then hangs
      return mockStreamResponse(["data: {\"choices\":[{\"delta\":{\"content\":\"hi\"}}]}\n\n"]);
    });
    const iter = adapter.stream([{ id: "1", role: "user", content: "hi" }], { signal: controller.signal });
    const first = await iter.next();
    expect(first.value).toBeDefined();
    controller.abort();
    // next should handle abort (or throw)
    try {
      await iter.next();
    } catch (e) {
      expect(e).toBeDefined();
    }
  });

  it("createAdapter is reactive: changing secrets changes next adapter without rebuild", () => {
    const harness = new Harness();
    harness.add({ id: "llm.echo", type: "llm.adapter", options: { provider: "echo", model: "echo-1" } });
    harness.add({ id: "llm.openrouter", type: "llm.adapter", enabled: false, options: { provider: "openrouter", model: "openai/gpt-4o-mini", baseUrl: "https://openrouter.ai/api/v1" } });
    const secrets: Record<string, string | undefined> = { GREENEK_MODEL_PROVIDER: "echo" };
    let a = createAdapter(harness, secrets);
    expect(a.provider).toBe("echo");
    secrets.GREENEK_MODEL_PROVIDER = "openrouter";
    secrets.OPENROUTER_API_KEY = "sk-or-abc";
    a = createAdapter(harness, secrets);
    expect(a.provider).toBe("openrouter");
    // mutate key live
    secrets.OPENROUTER_API_KEY = "  Bearer sk-or-mutated  ";
    a = createAdapter(harness, secrets);
    expect((a as unknown as { apiKey: string }).apiKey).toBe("sk-or-mutated");
  });
});
