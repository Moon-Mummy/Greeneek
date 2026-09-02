/**
 * @greeneek/brand — Greeneek identity and the Technical Precision System tokens.
 *
 * The only upstream identity retained anywhere in this repository lives in
 * LICENSE and THIRD_PARTY_NOTICES.md (MIT attribution, legally required).
 */

export const BRAND = {
  name: "Greeneek",
  description: "The surgeon's toolkit for AI agents. Everything is a plugin.",
  cli: "greeneek",
  scope: "@greeneek",
  maintainer: "Greeneek Labs",
  domain: "greeneek.dev",
  docsUrl: "https://greeneek.dev/docs",
  supportUrl: "https://greeneek.dev/support",
  repository: "https://github.com/Moon-Mummy/Greeneek",
  version: "0.1.0",
  license: "MIT",
} as const;

export const HOME_DIR_NAME = ".greeneek";

/**
 * Technical Precision System — Deep Slate foundation, Forest Emerald interaction.
 *
 * Light mode accent is the stable Forest Emerald (#067A52). In dark mode the
 * emerald shifts to a more luminous variant (#34d399) to retain contrast and
 * glow against the deep slate canvas.
 */
export const TOKENS = {
  color: {
    light: {
      surface: "#f8f9fa",
      surfaceDim: "#d9dadb",
      surfaceBright: "#f8f9fa",
      surfaceContainerLowest: "#ffffff",
      surfaceContainerLow: "#f3f4f5",
      surfaceContainer: "#edeeef",
      surfaceContainerHigh: "#e7e8e9",
      surfaceContainerHighest: "#e1e3e4",
      onSurface: "#191c1d",
      onSurfaceVariant: "#45474b",
      inverseSurface: "#2e3132",
      inverseOnSurface: "#f0f1f2",
      outline: "#76777b",
      outlineVariant: "#c6c6cb",
      surfaceTint: "#5d5e63",
      primary: "#0f1115",
      onPrimary: "#ffffff",
      primaryContainer: "#1a1c20",
      onPrimaryContainer: "#828489",
      inversePrimary: "#c6c6cc",
      secondary: "#067a52",
      onSecondary: "#ffffff",
      secondaryContainer: "#96f6c4",
      onSecondaryContainer: "#005235",
      tertiary: "#61666b",
      onTertiary: "#ffffff",
      tertiaryContainer: "#171c20",
      onTertiaryContainer: "#7f848a",
      error: "#ba1a1a",
      onError: "#ffffff",
      errorContainer: "#ffdad6",
      onErrorContainer: "#93000a",
      primaryFixed: "#e2e2e8",
      primaryFixedDim: "#c6c6cc",
      onPrimaryFixed: "#1a1c20",
      onPrimaryFixedVariant: "#45474b",
      secondaryFixed: "#96f6c4",
      secondaryFixedDim: "#7ad9a9",
      onSecondaryFixed: "#002113",
      onSecondaryFixedVariant: "#005235",
      tertiaryFixed: "#dee3e9",
      tertiaryFixedDim: "#c2c7cc",
      onTertiaryFixed: "#171c20",
      onTertiaryFixedVariant: "#42474c",
      background: "#f8f9fa",
      onBackground: "#191c1d",
      surfaceVariant: "#e1e3e4",
      stroke: "rgba(0, 0, 0, 0.10)",
      shadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
    },
    dark: {
      surface: "#151517",
      surfaceDim: "#0f0f10",
      surfaceBright: "#3c3d40",
      surfaceContainerLowest: "#0b0b0c",
      surfaceContainerLow: "#151517",
      surfaceContainer: "#1c1d1f",
      surfaceContainerHigh: "#232426",
      surfaceContainerHighest: "#2a2b2d",
      onSurface: "#e7e8e9",
      onSurfaceVariant: "#a6a8ab",
      inverseSurface: "#e7e8e9",
      inverseOnSurface: "#2e3132",
      outline: "#8f9195",
      outlineVariant: "#45474b",
      surfaceTint: "#c6c6cc",
      primary: "#e7e8e9",
      onPrimary: "#0f1115",
      primaryContainer: "#26282c",
      onPrimaryContainer: "#c2c7cc",
      inversePrimary: "#0f1115",
      secondary: "#34d399",
      onSecondary: "#002113",
      secondaryContainer: "#005235",
      onSecondaryContainer: "#96f6c4",
      tertiary: "#a1a3a7",
      onTertiary: "#171c20",
      tertiaryContainer: "#2a2b2d",
      onTertiaryContainer: "#c2c7cc",
      error: "#ffb4ab",
      onError: "#690005",
      errorContainer: "#93000a",
      onErrorContainer: "#ffdad6",
      primaryFixed: "#e2e2e8",
      primaryFixedDim: "#c6c6cc",
      onPrimaryFixed: "#1a1c20",
      onPrimaryFixedVariant: "#45474b",
      secondaryFixed: "#96f6c4",
      secondaryFixedDim: "#7ad9a9",
      onSecondaryFixed: "#002113",
      onSecondaryFixedVariant: "#005235",
      tertiaryFixed: "#dee3e9",
      tertiaryFixedDim: "#c2c7cc",
      onTertiaryFixed: "#171c20",
      onTertiaryFixedVariant: "#42474c",
      background: "#151517",
      onBackground: "#e7e8e9",
      surfaceVariant: "#2a2b2d",
      stroke: "rgba(255, 255, 255, 0.06)",
      shadow: "0 4px 12px rgba(0, 0, 0, 0.35)",
    },
  },
  typography: {
    headlineLg: { fontFamily: "Inter", fontSize: "21px", fontWeight: 700, lineHeight: "30px", letterSpacing: "-0.015em" },
    headlineMd: { fontFamily: "Inter", fontSize: "19px", fontWeight: 700, lineHeight: "28px", letterSpacing: "-0.01em" },
    headlineSm: { fontFamily: "Inter", fontSize: "18px", fontWeight: 700, lineHeight: "26px", letterSpacing: "-0.005em" },
    bodyLg: { fontFamily: "Inter", fontSize: "14px", fontWeight: 400, lineHeight: "24px" },
    bodyMd: { fontFamily: "Inter", fontSize: "13px", fontWeight: 400, lineHeight: "20px" },
    labelMd: { fontFamily: "JetBrains Mono", fontSize: "12px", fontWeight: 400, lineHeight: "19px" },
    labelSm: { fontFamily: "JetBrains Mono", fontSize: "11px", fontWeight: 400, lineHeight: "19px" },
    headlineLgMobile: { fontFamily: "Inter", fontSize: "19px", fontWeight: 700, lineHeight: "28px" },
    terminal: { fontFamily: "JetBrains Mono", fontSize: "11px", lineHeight: "19px" },
  },
  rounded: { sm: "0.25rem", DEFAULT: "0.5rem", md: "0.75rem", lg: "1rem", xl: "1.5rem", composer: "22px", full: "9999px" },
  spacing: {
    unit: "4px",
    xs: "4px",
    sm: "8px",
    md: "12px",
    base: "16px",
    lg: "24px",
    xl: "32px",
    gutterTerminal: "30px",
    containerMin: "680px",
    containerMax: "920px",
  },
} as const;

export const LOGO_MARK_SVG = `<svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="1" y="1" width="62" height="62" rx="14" fill="#0F1115" stroke="#067A52" stroke-width="2"/>
  <path d="M17 42 L32 16 L47 42" stroke="#96F6C4" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="25.5" cy="33.5" r="3.2" fill="#34D399"/>
  <circle cx="38.5" cy="33.5" r="3.2" fill="#7AD9A9"/>
</svg>`;

export const LOGO_WORDMARK_SVG = `<svg width="240" height="40" viewBox="0 0 240 40" xmlns="http://www.w3.org/2000/svg">
  <rect width="40" height="40" rx="10" fill="#0F1115" stroke="#067A52" stroke-width="1.6"/>
  <path d="M10.5 27 L20 8 L29.5 27" stroke="#96F6C4" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="15.6" cy="21.8" r="2.4" fill="#34D399"/>
  <circle cx="24.4" cy="21.8" r="2.4" fill="#7AD9A9"/>
  <text x="50" y="27.5" font-family="Inter, sans-serif" font-size="21" font-weight="700" fill="#E7E8E9">Greeneek</text>
</svg>`;

export const FAVICON_SVG = LOGO_MARK_SVG;
