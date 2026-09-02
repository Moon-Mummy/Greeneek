import React, { useCallback, useEffect, useRef, useState } from "react";
import { en } from "./locales/en";
import { es } from "./locales/es";

type Lang = "en" | "es";
const tDict = { en, es } as const;

type Item =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string; streaming?: boolean; usage?: { inputTokens: number; outputTokens: number } }
  | { kind: "tool"; name: string; ok: boolean; output: string; durationMs: number; running?: boolean };

interface Meta {
  name: string;
  version: string;
  profile: string;
  accent: string;
  provider?: { provider: string; model: string };
  plan: string;
  usage: { tokens: number; usd: number; requests: number };
}

interface Plugin {
  id: string;
  name: string;
  description: string;
  version: string;
  verified?: boolean;
  publisher?: string;
}

interface AuditEntry {
  seq: number;
  ts: number;
  actor: string;
  action: string;
  resource: string;
  detail: Record<string, unknown>;
  hash: string;
}

const PRESETS = [
  { id: "forest", name: "Forest Emerald", accent: "#067a52", darkAccent: "#34d399" },
  { id: "ink", name: "Brand Ink", accent: "#0f1115", darkAccent: "#e7e8e9" },
  { id: "slate", name: "Slate Gray", accent: "#61666b", darkAccent: "#a1a3a7" },
];

function t(lang: Lang, key: keyof typeof en): string {
  return tDict[lang][key] ?? en[key] ?? key;
}

const LOGO = "/assets/logo-mark.png";

function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const parts = text.split(/(`[^`]+`)/g);
  parts.forEach((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      out.push(
        <code key={i} style={{ fontFamily: "var(--font-technical)", fontSize: "12px", background: "var(--surface-container-high)", padding: "1px 5px", borderRadius: "4px" }}>
          {part.slice(1, -1)}
        </code>,
      );
    } else {
      out.push(part);
    }
  });
  return out;
}

function Markdown({ text }: { text: string }): React.ReactNode {
  const blocks = text.split(/(```[\s\S]*?```)/g);
  return (
    <>
      {blocks.map((block, i) => {
        if (block.startsWith("```")) {
          const body = block.replace(/^```[a-z]*\n?/, "").replace(/```$/, "");
          return (
            <div className="terminal" key={i} style={{ margin: "8px 0" }}>
              <pre>{body}</pre>
            </div>
          );
        }
        return <span key={i}>{renderInline(block)}</span>;
      })}
    </>
  );
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

const SpeechCtor: (new () => SpeechRecognitionLike) | undefined =
  (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike; SpeechRecognition?: new () => SpeechRecognitionLike })
    .webkitSpeechRecognition ??
  (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition;

export default function App() {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("gk.lang") as Lang) ?? "en");
  const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem("gk.theme") as "light" | "dark") ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const [accent, setAccent] = useState<string>(() => localStorage.getItem("gk.accent") ?? "#067a52");
  const [presetId, setPresetId] = useState("forest");
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [planMode, setPlanMode] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tab, setTab] = useState<"providers" | "billing" | "marketplace" | "audit" | "theme" | "about">("providers");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [recording, setRecording] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("gk.theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("gk.lang", lang);
  }, [lang]);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
    localStorage.setItem("gk.accent", accent);
  }, [accent]);

  // Feature 10: share-as-URL themes.
  useEffect(() => {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    const sharedTheme = hash.get("theme");
    const sharedAccent = hash.get("a");
    if (sharedTheme === "dark" || sharedTheme === "light") setTheme(sharedTheme);
    if (sharedAccent && /^#[0-9a-fA-F]{6}$/.test(sharedAccent)) {
      setAccent(sharedAccent);
      setPresetId("custom");
    }
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch("/api/meta");
      setMeta(await res.json());
    } catch {
      setMeta(null);
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  const ensureSession = async (): Promise<string> => {
    if (sessionRef.current) return sessionRef.current;
    const res = await fetch("/api/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const body = (await res.json()) as { id: string };
    sessionRef.current = body.id;
    return body.id;
  };

  const commit = (message: string) => {
    setItems((prev) => {
      const next = [...prev];
      const last = next[next.length - 1];
      if (last?.kind === "assistant" && last.streaming) {
        next[next.length - 1] = { ...last, text: last.text + message, streaming: true };
      } else {
        next.push({ kind: "assistant", text: message, streaming: true });
      }
      return next;
    });
  };

  const runTask = async (task: string) => {
    if (running) return;
    setRunning(true);
    setItems((prev) => [...prev, { kind: "user", text: task }]);
    const sessionId = await ensureSession();
    try {
      const res = await fetch(`/api/sessions/${sessionId}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task }),
      });
      if (!res.ok || !res.body) throw new Error(`run failed: ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const push = (payload: { type: string; data: Record<string, unknown> }) => {
        if (payload.type === "assistant/stream") {
          commit(String(payload.data.delta ?? ""));
        } else if (payload.type === "assistant/message") {
          setItems((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.kind === "assistant" && last.streaming) {
              next[next.length - 1] = { ...last, streaming: false, usage: payload.data.usage as { inputTokens: number; outputTokens: number } | undefined };
            }
            return next;
          });
        } else if (payload.type === "tool/start") {
          setItems((prev) => [...prev, { kind: "tool", name: String(payload.data.name), ok: true, output: "", durationMs: 0, running: true }]);
        } else if (payload.type === "tool/end") {
          const d = payload.data as { name: string; ok: boolean; output?: string; durationMs: number };
          setItems((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.kind === "tool" && last.running && last.name === d.name) {
              next[next.length - 1] = { ...last, ok: d.ok, output: d.output ?? "ok", durationMs: d.durationMs, running: false };
            }
            return next;
          });
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const type = part.match(/^event: (.+)$/m)?.[1];
          const data = part.match(/^data: (.+)$/m)?.[1];
          if (type && data) {
            try {
              push({ type, data: JSON.parse(data) });
            } catch {
              // skip malformed frame
            }
          }
        }
      }
    } catch (err) {
      commit(`\n\n**error** — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setItems((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.kind === "assistant" && last.streaming) next[next.length - 1] = { ...last, streaming: false };
        return next;
      });
      setRunning(false);
      void loadMeta();
      void loadAudit();
    }
  };

  const submit = () => {
    const task = input.trim();
    if (!task || running) return;
    setInput("");
    void runTask(task);
  };

  const loadPlugins = async () => {
    const res = await fetch("/api/marketplace/plugins");
    if (res.ok) setPlugins((await res.json()).plugins as Plugin[]);
  };

  const loadAudit = async () => {
    const res = await fetch("/api/audit/entries");
    if (res.ok) setAudit(((await res.json()) as { entries: AuditEntry[] }).entries);
  };

  useEffect(() => {
    if (settingsOpen) {
      void loadPlugins();
      void loadAudit();
    }
  }, [settingsOpen]);

  const saveCred = async (key: string, value: string) => {
    await fetch("/api/settings/credentials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
  };

  const shareTheme = async () => {
    const params = new URLSearchParams({ theme, a: accent });
    await navigator.clipboard.writeText(`${location.origin}${location.pathname}#${params.toString()}`);
    notify(t(lang, "themeShared"));
  };

  const toggleVoice = () => {
    if (!SpeechCtor) {
      notify(t(lang, "notRecording"));
      return;
    }
    if (recording) {
      recRef.current?.stop();
      setRecording(false);
      return;
    }
    const rec = new SpeechCtor();
    rec.lang = lang === "es" ? "es-ES" : "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const last = e.results[e.results.length - 1][0];
      if (last) setInput((prev) => (prev ? prev + " " : "") + last.transcript);
    };
    rec.onend = () => setRecording(false);
    rec.onerror = () => setRecording(false);
    recRef.current = rec;
    rec.start();
    setRecording(true);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  const providerMeta = meta?.provider ? `${meta.provider.provider} · ${meta.provider.model}` : "echo · echo-1";
  const usable = meta?.usage?.tokens ?? 0;

  return (
    <div className="app">
      <header className="header">
        <div className="wordmark">
          <img src={LOGO} alt="Greeneek" />
          <span>{t(lang, "appName")}</span>
        </div>
        <span className={`chip profile-chip ${planMode ? "plan" : ""}`}>
          <span className="dot" />
          {planMode ? t(lang, "planMode") : meta?.profile ?? "web"}
        </span>
        <div className="header-spacer" />
        <span className="statusline" title={providerMeta}>
          <span className="dot" style={{ background: running ? "var(--accent)" : "var(--tertiary)" }} />
          {running ? t(lang, "streaming") : providerMeta}
        </span>
        <button className="icon-btn" title={t(lang, "theme")} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="theme">
          {theme === "dark" ? "☀" : "☾"}
        </button>
        <button className="icon-btn" title={t(lang, "language")} onClick={() => setLang(lang === "en" ? "es" : "en")} aria-label="language">
          {lang.toUpperCase()}
        </button>
        <button className="icon-btn" title={t(lang, "settings")} onClick={() => setSettingsOpen(true)} aria-label="settings">
          ⚙
        </button>
      </header>

      <div className="scroll" ref={scrollRef}>
        <div className="conversation">
          {items.length === 0 && (
            <div className="empty">
              <img src={LOGO} width="72" height="72" alt="Greeneek" style={{ borderRadius: "18px" }} />
              <h2>{t(lang, "emptyTitle")}</h2>
              <p style={{ maxWidth: "52ch" }}>{t(lang, "emptyBody")}</p>
              <p className="mono">{t(lang, "emptyHint")}</p>
            </div>
          )}

          {items.map((item, i) => {
            if (item.kind === "user") {
              return (
                <div className="turn user" key={i}>
                  <div className="bubble">{item.text}</div>
                </div>
              );
            }
            if (item.kind === "assistant") {
              return (
                <div className="turn assistant" key={i}>
                  <div className="meta-line">
                    <span className="dot" />
                    {t(lang, "appName")}
                    {item.usage && <span>· {item.usage.inputTokens + item.usage.outputTokens} tok</span>}
                  </div>
                  <div className="bubble">
                    <Markdown text={item.text} />
                    {item.streaming && <span className="spinner" style={{ display: "inline-block", marginLeft: 6, verticalAlign: "middle" }} />}
                  </div>
                </div>
              );
            }
            return (
              <div className="turn" key={i}>
                <div className="terminal">
                  <div className="term-header">
                    <span className={item.ok ? "ok" : "fail"}>{item.running ? "…" : item.ok ? "✓" : "✗"}</span>
                    <span>{item.name}</span>
                    {!item.running && <span className="muted">· {item.durationMs}ms</span>}
                  </div>
                  <pre>
                    {item.output
                      ? item.output.split("\n").map((line, ln) => (
                          <React.Fragment key={ln}>
                            <span className="ln">{ln + 1}</span>
                            <span className={!item.ok && ln === 0 ? "tok-err" : undefined}>{line}</span>
                            {"\n"}
                          </React.Fragment>
                        ))
                      : "running…"}
                  </pre>
                </div>
              </div>
            );
          })}

          {items.length > 0 && !running && (
            <p className="meta-line" style={{ justifyContent: "center" }}>
              <span className="dot" style={{ background: "var(--outline)" }} />
              {t(lang, "runAgain")}
            </p>
          )}
        </div>
      </div>

      <div className="composer-wrap">
        <div className="composer">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={t(lang, "composerPlaceholder")}
            rows={2}
          />
          <div className="composer-row">
            <button
              className={`tool-trigger ${planMode ? "on" : ""}`}
              onClick={() => setPlanMode(!planMode)}
              title={t(lang, "planMode")}
            >
              ⌁ {t(lang, "planMode")}
            </button>
            <button
              className={`tool-trigger ${recording ? "recording-pulse" : ""}`}
              onClick={toggleVoice}
              title={t(lang, "listening")}
            >
              {recording ? `● ${t(lang, "listening")}` : "🎙"}
            </button>
            <span className="spacer" />
            <span className="muted">{t(lang, "usageLabel")}: {usable.toLocaleString()} tok</span>
            <button className="send" onClick={submit} disabled={running || !input.trim()} title={t(lang, "send")}>
              {running ? <span className="spinner" /> : "↑"}
            </button>
          </div>
        </div>
      </div>

      {settingsOpen && (
        <div className="panel" onClick={() => setSettingsOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="tabs">
              {(["providers", "billing", "marketplace", "audit", "theme", "about"] as const).map((key) => (
                <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>
                  {t(lang, key)}
                </button>
              ))}
            </div>
            <div className="tab-body">
              {tab === "providers" && (
                <>
                  <h3>{t(lang, "providers")}</h3>
                  <p>{t(lang, "provider")} — GREENEK_MODEL_PROVIDER (openai | anthropic | ollama | echo) · Web search — WEB_SEARCH_PROVIDER (mock | exa | perplexity | deepseek)</p>
                  <div className="row wrap">
                    <div className="field grow">
                      <label>OPENAI_API_KEY</label>
                      <input type="password" value={creds.OPENAI_API_KEY ?? ""} onChange={(e) => setCreds({ ...creds, OPENAI_API_KEY: e.target.value })} />
                    </div>
                    <div className="field grow">
                      <label>ANTHROPIC_API_KEY</label>
                      <input type="password" value={creds.ANTHROPIC_API_KEY ?? ""} onChange={(e) => setCreds({ ...creds, ANTHROPIC_API_KEY: e.target.value })} />
                    </div>
                  </div>
                  <div className="row wrap">
                    <div className="field grow">
                      <label>WEB_SEARCH_PROVIDER</label>
                      <select value={creds.WEB_SEARCH_PROVIDER ?? "mock"} onChange={(e) => setCreds({ ...creds, WEB_SEARCH_PROVIDER: e.target.value })}>
                        <option value="mock">mock</option>
                        <option value="exa">exa</option>
                        <option value="perplexity">perplexity</option>
                        <option value="deepseek">deepseek</option>
                      </select>
                    </div>
                    <div className="field grow">
                      <label>EXA_API_KEY</label>
                      <input type="password" value={creds.EXA_API_KEY ?? ""} onChange={(e) => setCreds({ ...creds, EXA_API_KEY: e.target.value })} />
                    </div>
                  </div>
                  <div className="row">
                    <button
                      className="btn secondary"
                      onClick={() =>
                        void Promise.all(
                          Object.entries(creds)
                            .filter(([, v]) => v)
                            .map(([k, v]) => saveCred(k, v)),
                        ).then(() => {
                          notify(t(lang, "credentialsSaved"));
                          setCreds({});
                          void loadMeta();
                        })
                      }
                    >
                      {t(lang, "save")}
                    </button>
                  </div>
                </>
              )}

              {tab === "billing" && (
                <>
                  <h3>{t(lang, "billing")}</h3>
                  <div className="row wrap">
                    <span className={`chip ${meta?.plan === "enterprise" ? "active" : ""}`}>{t(lang, "planLabel")}: {meta?.plan ?? "free"}</span>
                    <span className="chip">{t(lang, "usageLabel")}: ${(meta?.usage?.usd ?? 0).toFixed(4)} · {usable.toLocaleString()} tok · {meta?.usage?.requests ?? 0} req</span>
                  </div>
                  <p>Free 100k tok/mo · Pro $20/mo · Team $150/mo. Stripe products, prices, webhooks and dunning/grace-period flows are wired at the billing seam — token metering happens at agent/request, tier limits enforce pre-execution.</p>
                </>
              )}

              {tab === "marketplace" && (
                <>
                  <h3>{t(lang, "marketplace")}</h3>
                  <ul className="flat-list">
                    {plugins.length === 0 && <li>{t(lang, "noPlugins")}</li>}
                    {plugins.map((p) => (
                      <li key={p.id}>
                        <div className="row">
                          <div className="grow">
                            <strong>{p.name}</strong> <span className="muted">v{p.version} · {p.publisher ?? "unknown"}{p.verified ? " · verified" : ""}</span>
                            <div className="muted">{p.description}</div>
                          </div>
                          <button
                            className="btn ghost"
                            onClick={() =>
                              void fetch("/api/marketplace/install", {
                                method: "POST",
                                headers: { "content-type": "application/json" },
                                body: JSON.stringify({ pluginId: p.id }),
                              }).then(() => notify(`Installed ${p.id} → ~/.greeneek/cordis.patch.yml`))
                            }
                          >
                            {t(lang, "install")}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {tab === "audit" && (
                <>
                  <h3>{t(lang, "audit")}</h3>
                  <div className="row">
                    <a className="btn ghost" href="/api/audit/export">{t(lang, "exportCsv")}</a>
                    <span className="muted">SHA-256 hash-chained · append-only</span>
                  </div>
                  <ul className="flat-list">
                    {audit.length === 0 && <li>{t(lang, "auditEmpty")}</li>}
                    {audit.slice(-12).reverse().map((e) => (
                      <li key={e.seq}>
                        <div className="row">
                          <span className="chip">{e.action}</span>
                          <span className="muted">{e.resource}</span>
                          <span className="muted" style={{ fontFamily: "var(--font-technical)", fontSize: "10px" }}>
                            #{e.seq} · {e.hash.slice(0, 12)}… · {new Date(e.ts).toLocaleString()}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {tab === "theme" && (
                <>
                  <h3>{t(lang, "theme")}</h3>
                  <div className="swatches">
                    {PRESETS.map((p) => (
                      <button
                        key={p.id}
                        className={`swatch ${presetId === p.id ? "active" : ""}`}
                        style={{ background: p.accent }}
                        title={p.name}
                        onClick={() => {
                          setPresetId(p.id);
                          setAccent(theme === "dark" ? p.darkAccent : p.accent);
                        }}
                      />
                    ))}
                  </div>
                  <div className="field">
                    <label>{t(lang, "accent")}</label>
                    <div className="row">
                      <input type="color" value={accent} onChange={(e) => { setAccent(e.target.value); setPresetId("custom"); }} style={{ width: 48, height: 36, padding: 2 }} />
                      <input value={accent} onChange={(e) => setAccent(e.target.value)} style={{ fontFamily: "var(--font-technical)", width: 120 }} />
                    </div>
                  </div>
                  <div className="row">
                    <button className="btn secondary" onClick={() => void shareTheme()}>{t(lang, "shareTheme")}</button>
                  </div>
                </>
              )}

              {tab === "about" && (
                <>
                  <h3>{t(lang, "about")}</h3>
                  <p>Greeneek 0.1.0 · Greeneek Labs · MIT · Independent fork of an MIT-licensed agent harness, pinned at 4e84901e6471b79ec0338099867ebb4606d12bb5 (see FORK.md). License and third-party notices preserved; brand is wholly Greeneek.</p>
                  <p className="mono">greeneek --profile web --dump-config · ~/.greeneek</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", bottom: 92, left: "50%", transform: "translateX(-50%)", background: "var(--primary)", color: "var(--on-primary)", padding: "8px 14px", borderRadius: 999, fontSize: 12 }}>{toast}</div>}
    </div>
  );
}
