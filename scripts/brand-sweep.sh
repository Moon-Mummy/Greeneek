#!/usr/bin/env bash
# CI brand gate. The rebrand contract is two-sided and machine-checked here:
#
#   1. residue  — no DeepSeek/dsh identity may re-enter the tree outside the
#                 explicit allowlists (attribution, migration docs, the
#                 codemod itself, known false positives like `handshake`).
#   2. egress   — no shipped source or config may reference a retired
#                 DeepSeek endpoint; the only sanctioned occurrence family is
#                 the egress blocklist in packages/util/egress.
#
# Both verifiers are dependency-free Node scripts; allowlists live in
# scripts/rebrand/mapping.mjs, decisions live in scripts/rebrand/decisions.md.
# Re-run after any upstream merge: see the "Sync recipe" in decisions.md.
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/rebrand/verify-residue.mjs
node scripts/rebrand/verify-egress.mjs
