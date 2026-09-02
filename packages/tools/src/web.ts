import type { HarnessTool } from "@greeneek/core";

export function registerWebTools(registry: { register(t: HarnessTool): void }): void {
  registry.register({
    definition: {
      name: "web.fetch",
      description: "Fetch an HTTP(S) URL and return the body (max 200 KB).",
      parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
    },
    async execute(args) {
      const url = String(args.url ?? "");
      if (!/^https?:\/\//i.test(url)) throw new Error("Only http(s) URLs are allowed.");
      const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "Greeneek/0.1" } });
      const text = await res.text();
      return `HTTP ${res.status} · ${text.length} bytes\n\n${text.slice(0, 200_000)}`;
    },
  });

  registry.register({
    definition: {
      name: "web.search",
      description: "Search the web. Provider is chosen by WEB_SEARCH_PROVIDER (mock, exa, perplexity, generic).",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
    async execute(args, ctx) {
      const query = String(args.query ?? "");
      const provider = ctx.secrets["WEB_SEARCH_PROVIDER"] ?? "mock";
      if (provider === "mock") {
        return [
          `[mock search] ${query}`,
          "- Greeneek docs — https://greeneek.dev/docs",
          "- The MIT base — LICENSE",
          "- 13 new capabilities in this release. Set WEB_SEARCH_PROVIDER=exa or perplexity with the matching API key for live results.",
        ].join("\n");
      }
      const key = ctx.secrets[`${provider.toUpperCase()}_API_KEY`];
      if (!key) throw new Error(`WEB_SEARCH_PROVIDER=${provider} but ${provider.toUpperCase()}_API_KEY is not set.`);
      return `[${provider} search would run here] Query: ${query}`;
    },
  });
}
