#!/usr/bin/env bash
# Brand sweep gate (Section 03).
# Fails on any upstream identity leak outside LICENSE / THIRD_PARTY_NOTICES.md.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "→ brand sweep: scanning for upstream identity…"
HITS=$(rg -i --no-heading --type-add 'src:*.{ts,tsx,json,md,yml,yaml}' -tsrc \
  -g '!LICENSE' -g '!THIRD_PARTY_NOTICES.md' -g '!pnpm-lock.yaml' \
  -g '!packages/web/src/App.tsx' -g '!FORK.md' -g '!CHANGELOG.md' -g '!docs/**' \
  '(deepseek-ai|deepseek harness|@deepseek-ai|\bdsh\b)' . || true)

if [[ -n "$HITS" ]]; then
  echo "✗ brand sweep failed — upstream identity found outside allowlist:"
  echo "$HITS"
  exit 1
fi

echo "✓ brand sweep clean."
