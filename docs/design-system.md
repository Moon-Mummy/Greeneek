# Technical Precision System — Design System Reference

Greeneek's interface stack. Corporate/Modern with a technical edge:
information density without sacrificing editorial polish. Evokes "surgical
tools for AI" — authoritative, precise, transparent.

## Foundation

- **Deep Slate** tonal foundation; light bg `#F8F9FA`, dark bg `#151517`.
- **Forest Emerald** `#067A52` for interaction/energy; luminous `#34D399` in
  dark mode.
- Hairline 0.5px strokes: light `rgba(0,0,0,0.10)`, dark `rgba(255,255,255,0.06)`.
- Depth via luminance shifts, not heavy shadows. Floating layers: 0px-blur
  stroke + `0 4px 12px rgba(0,0,0,0.05)`. Modal backdrop: 2px blur.

## Typography

| Style | Family | Size/Line | Weight | Spacing |
| --- | --- | --- | --- | --- |
| headline-lg | Inter | 21/30 | 700 | -0.015em |
| headline-md | Inter | 19/28 | 700 | -0.01em |
| headline-sm | Inter | 18/26 | 700 | -0.005em |
| body-lg | Inter | 14/24 | 400 | — |
| body-md | Inter | 13/20 | 400 | — |
| label-md | JetBrains Mono | 12/19 | 400 | — |
| label-sm | JetBrains Mono | 11/19 | 400 | — |

Technical stack (JetBrains Mono) is reserved for code, terminal output, and
inline technical variables.

## Spacing

4px rhythm: 4 / 8 / 12 / 16 / 24 / 32. Terminal gutter 30px. Conversation
column clamped 680–920px; mobile side margins 16px, full-bleed.

## Shapes

- Buttons/inputs: 8px (0.5rem); cards/terminals 16px; major modals 24px;
  composer card 22px; interactive pills 999px.

## Components

- **Buttons** 36px capsule: primary = Brand Ink; secondary = Forest Emerald;
  ghost = toolbar, subtle wash hover.
- **Terminal blocks** 12px radii, one step darker than surface, 30px left
  gutter, 11px JetBrains Mono.
- **Composer card** 22px radius, hairline stroke, emerald glow on focus.
- **Chips** 12px mono, 999px radius.
- **List items** 16px padding; **diff blocks** full-width add/del
  backgrounds with +/- in the gutter.

## Tokens

Machine-readable tokens ship in `packages/brand/src/index.ts` (light + dark
tables) and as CSS custom properties in `packages/web/src/styles.css`.
