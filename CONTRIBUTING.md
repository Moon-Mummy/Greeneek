# Contributing to Greeneek

English | [中文](CONTRIBUTING.zh.md)

Thank you for your interest in contributing to Greeneek!

We deeply believe in the power of open source communities, and that belief has shaped this project from the very beginning.

## Ground rules

1. **Everything is a plugin.** If you find yourself editing a core package to add behavior, stop and re-read [docs/architecture.md](docs/architecture.md). Features mount as Cordis plugins behind profile configurations.
2. **Brand contract must hold.** App branding, logo, and green theme stay **Greeneek**; model provider/model names stay **DeepSeek** (see the Branding and models section in [README.md](README.md)). No upstream "DeepSeek Harness" identity as the product name in user-facing docs.
3. **License discipline.** New code is MIT. Update [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) in the same commit as any dependency change.
4. **Bilingual docs.** Every in-scope document ships as an English/Chinese pair; after editing either side, bring the other along and re-record with `pnpm run verify-translation-pairing --write <pair>`.

## Setup

```sh
pnpm install
pnpm run build
pnpm run test
pnpm dsh web
```

## PR checklist

- [ ] `pnpm run lint` clean
- [ ] `pnpm run typecheck` clean
- [ ] `pnpm run test` green
- [ ] `pnpm run verify-translation-pairing <edited pairs>` green
- [ ] Brand contract intact (Greeneek app/logo/theme; DeepSeek models)
- [ ] Docs updated for new capabilities

## Branding and models

- App branding stays **Greeneek**.
- Logo stays **Greeneek**.
- Green theme stays **Greeneek green**.
- Model provider/models are back to **DeepSeek**:
  - `DeepSeek`
  - `DeepSeek-V4-Flash`
  - `DeepSeek-V4-Pro`
  - `DeepSeek-V4-Flash-Vision-Exp`
