import React, { useEffect } from "react";
import { useSettingsStore } from "../stores/settings.store";

export function ThemeToggle({ compact }: { compact?: boolean }) {
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  // apply theme to document
  useEffect(() => {
    const m = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const resolved = theme === "system" ? (m.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    apply();
    if (theme === "system") {
      m.addEventListener("change", apply);
      return () => m.removeEventListener("change", apply);
    }
  }, [theme]);

  const cycle = () => {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next as never);
  };

  const label = theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System";

  if (compact) {
    return (
      <button className="icon-btn theme-toggle" onClick={cycle} title={`Theme: ${label} (click to cycle)`} aria-label={`Theme ${label}`}>
        <span aria-hidden>{theme === "light" ? "☀" : theme === "dark" ? "☾" : "◐"}</span>
      </button>
    );
  }

  return (
    <div className="theme-toggle-group" role="radiogroup" aria-label="Theme">
      {(["light", "dark", "system"] as const).map((v) => (
        <button
          key={v}
          role="radio"
          aria-checked={theme === v}
          className={`chip ${theme === v ? "active" : ""}`}
          onClick={() => setTheme(v)}
          title={v}
          style={{ cursor: "pointer", textTransform: "capitalize" }}
        >
          {v === "light" ? "☀ Light" : v === "dark" ? "☾ Dark" : "◐ System"}
        </button>
      ))}
    </div>
  );
}
