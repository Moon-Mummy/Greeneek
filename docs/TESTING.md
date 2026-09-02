# Testing

## Run

```bash
pnpm test              # unit
pnpm smoke             # profile smoke (headless)
pnpm test -- --coverage # with coverage
scripts/brand-sweep.sh # no upstream identity outside LICENSE/notices
```

## Structure

- `vitest.config.ts` — unit (`packages/*/tests`, `apps/*/tests`, 15s timeout, forks)
- `vitest.smoke.config.ts` — profile smoke (`apps/headless/tests`, 60s)
- `vitest` coverage via `v8` — thresholds 70% overall, 85% for provider/settings/runtime/registry (see `vitest.config.ts:coverage.thresholds`).

## Provider fixtures (Phase 2.4)

Mock `fetch` via `vi.stubGlobal('fetch', vi.fn())` with helpers `mockResponse(status, body)` and `mockStreamResponse(chunks)` in `packages/adapters/tests/providers.test.ts`. Fixtures cover:

- 200 non-stream, 200 stream with `: OPENROUTER PROCESSING` keep-alive and `[DONE]`
- Stream with tool calls split across chunks, mid-stream `error` object, malformed JSON
- 401/402/429 (with `Retry-After`)/404, abort mid-stream, key normalisation (`Bearer ` + whitespace)

## Adding a provider fixture

1. Add a case to `packages/adapters/tests/providers.test.ts` using `mockResponse`/`mockStreamResponse`
2. Assert `ProviderError.kind` (`auth`/`credits`/`rate_limit`/`model_not_found`) and that 402/404 are never `auth`
3. Run `pnpm test -- packages/adapters/tests/providers.test.ts`

## CI

`.github/workflows/ci.yml` — matrix `node 20` — `install → lint → typecheck → test --coverage → build → gitleaks → audit → smoke → brand-sweep`. Fails on any error. Coverage gates 70% overall, 85% for provider/settings/runtime/registry.

## Brand sweep

`scripts/brand-sweep.sh` — `rg -i "deepseek|dsh"` outside `LICENSE`/`THIRD_PARTY_NOTICES.md`/`pnpm-lock.yaml`/`FORK.md` must be 0. Run locally and in CI.
