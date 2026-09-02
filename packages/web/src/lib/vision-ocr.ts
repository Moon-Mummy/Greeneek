export async function ocrDataUrl(dataUrl: string, lang = "eng"): Promise<string> {
  // Dynamic import — tesseract.js is ~2MB, only load when non-vision fallback needed
  try {
    const mod = await import("tesseract.js");
    const createWorker: unknown = (mod as unknown as { createWorker?: unknown }).createWorker ?? (mod as unknown as { default?: { createWorker?: unknown } }).default?.createWorker;
    if (typeof createWorker !== "function") return "";
    const worker = await (createWorker as (lang: string) => Promise<{ recognize: (src: string) => Promise<{ data: { text: string } }>; terminate: () => Promise<void> }>)(lang);
    const { data } = await worker.recognize(dataUrl);
    await worker.terminate();
    return (data.text ?? "").trim();
  } catch {
    return "";
  }
}

export function isVisionModel(modelId: string): boolean {
  const lid = modelId.toLowerCase();
  return lid.includes("vision") || lid.includes("gpt-4o") || lid.includes("gpt-4-vision") || lid.includes("claude-3") || lid.includes("gemini") && lid.includes("vision") || lid.includes("llava") || lid.includes("qwen-vl");
}
