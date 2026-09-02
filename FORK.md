# FORK.md — provenance & pin

Greeneek is an independent fork-and-extend product.

| Field | Value |
| --- | --- |
| Upstream project | DeepSeek-Harness (github.com/deepseek-ai/deepseek-harness) |
| Upstream license | MIT |
| Pinned commit SHA | `4e84901e6471b79ec0338099867ebb4606d12bb5` |
| Pinned upstream version | `dsh 0.1.2-alpha.4` (release branch merge) |
| Pinned date | 2026-09-01 |
| Product | Greeneek (Greeneek Labs) |
| Product license | MIT |
| Affiliation | None — not affiliated with, endorsed by, or sponsored by the upstream project |

## Upstream sync policy

- Upstream is a fast-moving developer preview. **Pin, don't float.**
- An upstream-sync owner reviews the upstream diff weekly and rebases
  monthly, not daily.
- All product changes attach to documented seams (config rows, profile
  patches, telemetry sinks, tool registry). Core edits that conflict with
  upstream are forbidden by policy; if a change cannot attach to a seam,
  stop and re-read the extension map in `docs/architecture/`.

## License compliance

- [x] Upstream LICENSE text preserved verbatim, with the Greeneek Labs
  copyright line appended (never replacing).
- [x] THIRD_PARTY_NOTICES.md ships alongside LICENSE.
- [x] Brand sweep CI gate (`scripts/brand-sweep.sh`) blocks any upstream
  identity leak outside LICENSE / notices.
