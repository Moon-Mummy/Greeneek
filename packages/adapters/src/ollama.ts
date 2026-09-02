import { OpenAICompatibleAdapter } from "./openai";

/**
 * Ollama adapter — local models through Ollama's OpenAI-compatible endpoint.
 */
export class OllamaAdapter extends OpenAICompatibleAdapter {
  override readonly provider = "ollama";
  override readonly pricing = { inputPerMToken: 0, outputPerMToken: 0 };

  constructor(options: { model?: string; baseUrl?: string }) {
    super({
      model: options.model ?? "qwen2.5-coder:7b",
      baseUrl: (options.baseUrl ?? "http://127.0.0.1:11434/v1").replace(/\/$/, ""),
      apiKey: "ollama",
    });
  }
}
