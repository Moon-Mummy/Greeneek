import React, { useMemo } from "react";

type ModelInfo = {
  id: string;
  name: string;
  provider: string;
  contextLength?: number;
  pricing?: { promptPer1M?: number; isFree: boolean };
  supportsTools?: boolean;
  providerId?: string;
  isLocal?: boolean;
  vision?: boolean;
  reasoning?: boolean;
  available?: boolean;
};

function badgeLocal(m: ModelInfo) {
  if (m.isLocal || m.provider === "ollama" || m.providerId === "ollama" || m.id.includes(":") && !m.id.includes("/")) return true;
  return false;
}

export function ModelPickerGrouped(props: {
  models: ModelInfo[];
  search: string;
  onPick: (id: string, provider: string) => void;
  favorites: string[];
  recents: string[];
  onToggleFav: (id: string) => void;
}) {
  const { models, search, onPick, favorites, recents, onToggleFav } = props;
  const q = search.toLowerCase();
  const filtered = useMemo(() => models.filter((m) => !q || m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q) || m.provider.toLowerCase().includes(q)), [models, q]);

  const local = filtered.filter((m) => badgeLocal(m) || (m as unknown as { isLocal?: boolean }).isLocal);
  const cloud = filtered.filter((m) => !badgeLocal(m) && !(m as unknown as { isLocal?: boolean }).isLocal);
  // If no isLocal flagged (legacy), split by provider: ollama/lmstudio → local, rest cloud
  const splitLocal = local.length ? local : filtered.filter((m) => ["ollama", "lmstudio", "vllm", "localai"].includes(m.provider));
  const splitCloud = local.length ? cloud : filtered.filter((m) => !["ollama", "lmstudio", "vllm", "localai"].includes(m.provider));

  const Group = ({ title, list }: { title: string; list: ModelInfo[] }) => {
    if (!list.length) return null;
    const byProvider: Record<string, ModelInfo[]> = {};
    for (const m of list) {
      const key = m.provider || (m.isLocal ? "local" : "cloud");
      (byProvider[key] ??= []).push(m);
    }
    return (
      <div style={{ marginBottom: 14 }}>
        <h4 style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--secondary)", margin: "12px 0 6px 0" }}>{title}</h4>
        {Object.entries(byProvider).map(([prov, arr]) => (
          <div key={prov} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "var(--on-surface-variant)", textTransform: "uppercase", margin: "6px 0 4px 0" }}>{prov}</div>
            {arr.map((m) => (
              <div key={m.id} className="row" style={{ padding: "6px 0", borderBottom: "1px solid var(--outlineVariant)", alignItems: "center", gap: 8 }}>
                <button className="btn ghost" onClick={() => onToggleFav(m.id)} title="Favorite" style={{ minWidth: 28 }}>{favorites.includes(m.id) ? "★" : "☆"}</button>
                <div style={{ flex: 1, cursor: "pointer" }} onClick={() => onPick(m.id, m.provider)}>
                  <strong style={{ fontSize: 13 }}>{m.id}</strong> <span className="muted" style={{ fontSize: 11 }}>{m.name}</span>
                  <div className="row" style={{ gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                    {m.contextLength ? <span className="chip" style={{ fontSize: 10 }}>{Math.round(m.contextLength / 1000)}k</span> : null}
                    {m.pricing?.isFree ? <span className="chip" style={{ fontSize: 10, background: "var(--secondaryContainer)" }}>FREE</span> : null}
                    {m.supportsTools ? <span className="chip" style={{ fontSize: 10 }}>tools</span> : null}
                    {m.vision ? <span className="chip" style={{ fontSize: 10, background: "#dbeafe" }}>VISION</span> : null}
                    {m.reasoning ? <span className="chip" style={{ fontSize: 10, background: "#fef3c7" }}>REASONING</span> : null}
                    {badgeLocal(m) ? <span className="chip" style={{ fontSize: 10, background: "#ecfdf5" }}>LOCAL</span> : null}
                    <span className="muted" style={{ fontSize: 10 }}>{m.available === false ? "● offline" : m.isLocal ? "● local" : "● cloud"}</span>
                  </div>
                </div>
                {recents.includes(m.id) ? <span className="muted" style={{ fontSize: 10 }}>↻</span> : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  };

  if (filtered.length === 0) return <p className="muted">No matches</p>;

  return (
    <div>
      {splitLocal.length > 0 && <Group title="Free & Local — No API Key Required" list={splitLocal} />}
      {splitCloud.length > 0 && <Group title="Bring Your Own Key — Cloud" list={splitCloud} />}
      {filtered.length === 0 && <p className="muted">No models — enable a provider in Settings → Providers and Test connection.</p>}
    </div>
  );
}
