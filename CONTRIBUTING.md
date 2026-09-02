# Contributing to Greeneek

## Ground rules

1. **Everything is a plugin.** If you find yourself editing a core package
   to add behavior, stop and re-read `docs/architecture/composition.md`.
   Features mount as config rows behind profile patches.
2. **Brand sweep must pass.** `scripts/brand-sweep.sh` is a CI gate. No
   upstream identity outside LICENSE/notices.
3. **License discipline.** New code is MIT. Update
   `THIRD_PARTY_NOTICES.md` in the same commit as any dependency change.
4. **Silence by default.** Telemetry defaults stay local (`~/.greeneek`);
   opt-in sinks only.

## Setup

```bash
pnpm install
pnpm build
pnpm test
pnpm greeneek web
```

## PR checklist

- [ ] `pnpm lint` clean
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` green
- [ ] `scripts/brand-sweep.sh` green
- [ ] Feature behind a config row (patch can disable)
- [ ] Docs updated (`docs/features.md` for new capabilities)
